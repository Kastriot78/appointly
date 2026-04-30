const mongoose = require("mongoose");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const { canManageBusiness } = require("../utils/businessAccess");
const { assertServiceCapacity } = require("../utils/subscriptionEnforcement");
const {
  isValidIsoDate,
  normalizePromotionInput,
} = require("../utils/servicePromotion");

function serializeService(doc) {
  const s = doc.toJSON ? doc.toJSON() : doc;
  if (s._id) {
    s.id = s._id.toString();
    delete s._id;
  }
  delete s.__v;
  return s;
}

async function assertCanManageBusinessId(req, businessId) {
  if (!mongoose.isValidObjectId(businessId)) {
    const err = new Error("Invalid business id");
    err.statusCode = 400;
    throw err;
  }
  const business = await Business.findById(businessId);
  if (!business) {
    const err = new Error("Business not found");
    err.statusCode = 404;
    throw err;
  }
  if (!canManageBusiness(req.user, business)) {
    const err = new Error("Not allowed");
    err.statusCode = 403;
    throw err;
  }
  return business;
}

async function listServices(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);
  const rows = await Service.find({ business: businessId })
    .sort({ sortOrder: 1, createdAt: 1, _id: 1 })
    .lean();
  res.json({
    services: rows.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      price: s.price,
      duration: s.duration,
      description: s.description ?? "",
      sortOrder: Number.isFinite(s.sortOrder) ? s.sortOrder : 0,
      isActive: s.isActive !== false,
      promotion: s.promotion || null,
    })),
  });
}

async function createService(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);
  await assertServiceCapacity(req, businessId);
  const { name, price, duration, description, isActive } = req.body;
  const n = String(name || "").trim();
  if (!n) {
    return res.status(400).json({ message: "Service name is required" });
  }
  const p = Number(price);
  const d = Number(duration);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ message: "Valid price is required" });
  }
  if (!Number.isFinite(d) || d < 1) {
    return res.status(400).json({ message: "Valid duration (minutes) is required" });
  }
  const last = await Service.findOne({ business: businessId })
    .sort({ sortOrder: -1, createdAt: -1 })
    .select("sortOrder")
    .lean();
  const nextSortOrder =
    last && Number.isFinite(last.sortOrder) ? last.sortOrder + 1 : 0;
  const doc = await Service.create({
    business: businessId,
    name: n,
    price: p,
    duration: d,
    description: String(description ?? "").trim(),
    sortOrder: nextSortOrder,
    isActive: isActive !== false,
  });
  if (req.body.promotion != null) {
    const norm = normalizePromotionInput(req.body.promotion, p);
    if (norm.error) {
      await Service.findByIdAndDelete(doc._id);
      return res.status(400).json({ message: norm.error });
    }
    if (!norm.clear && norm.value) {
      doc.promotion = norm.value;
      await doc.save();
    }
  }
  return res.status(201).json({ service: serializeService(doc) });
}

async function updateService(req, res) {
  const businessId = req.params.id;
  const { serviceId } = req.params;
  await assertCanManageBusinessId(req, businessId);
  if (!mongoose.isValidObjectId(serviceId)) {
    return res.status(400).json({ message: "Invalid service id" });
  }
  const svc = await Service.findOne({
    _id: serviceId,
    business: businessId,
  });
  if (!svc) {
    return res.status(404).json({ message: "Service not found" });
  }
  const body = req.body;
  if (body.name !== undefined) svc.name = String(body.name).trim() || svc.name;
  if (body.price !== undefined) {
    const p = Number(body.price);
    if (Number.isFinite(p) && p >= 0) svc.price = p;
  }
  if (body.duration !== undefined) {
    const d = Number(body.duration);
    if (Number.isFinite(d) && d >= 1) svc.duration = d;
  }
  if (body.description !== undefined) {
    svc.description = String(body.description ?? "").trim();
  }
  if (body.isActive !== undefined) svc.isActive = Boolean(body.isActive);
  if (body.promotion !== undefined) {
    if (body.promotion === null) {
      svc.set("promotion", undefined);
    } else {
      const norm = normalizePromotionInput(body.promotion, svc.price);
      if (norm.error) {
        return res.status(400).json({ message: norm.error });
      }
      svc.promotion = norm.value;
    }
  }
  if (svc.promotion && Number(svc.promotion.salePrice) >= Number(svc.price)) {
    svc.set("promotion", undefined);
  }
  await svc.save();
  const fresh = await Service.findById(svc._id);
  return res.json({ service: serializeService(fresh) });
}

async function deleteService(req, res) {
  const businessId = req.params.id;
  const { serviceId } = req.params;
  await assertCanManageBusinessId(req, businessId);
  if (!mongoose.isValidObjectId(serviceId)) {
    return res.status(400).json({ message: "Invalid service id" });
  }
  const svc = await Service.findOne({
    _id: serviceId,
    business: businessId,
  });
  if (!svc) {
    return res.status(404).json({ message: "Service not found" });
  }
  await Staff.updateMany(
    { business: businessId },
    { $pull: { services: svc._id } },
  );
  await Service.findByIdAndDelete(serviceId);
  return res.status(204).send();
}

/**
 * POST /api/businesses/:id/services/promotion-bulk
 * Body: { clear: true } removes all promotions, or { percentOff, validFrom, validTo } applies same % to every service.
 */
async function applyPromotionBulk(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);
  const body = req.body || {};
  if (body.clear === true) {
    const r = await Service.updateMany(
      { business: businessId },
      { $unset: { promotion: 1 } },
    );
    return res.json({ cleared: true, modifiedCount: r.modifiedCount });
  }
  const pct = Number(body.percentOff);
  const validFrom = String(body.validFrom || "").trim().slice(0, 10);
  const validTo = String(body.validTo || "").trim().slice(0, 10);
  if (!isValidIsoDate(validFrom) || !isValidIsoDate(validTo)) {
    return res
      .status(400)
      .json({ message: "validFrom and validTo must be YYYY-MM-DD" });
  }
  if (validFrom > validTo) {
    return res
      .status(400)
      .json({ message: "End date must be on or after start date" });
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
    return res
      .status(400)
      .json({ message: "percentOff must be between 1 and 99" });
  }
  const services = await Service.find({ business: businessId });
  let updated = 0;
  for (const svc of services) {
    const base = Number(svc.price);
    if (!Number.isFinite(base) || base <= 0) continue;
    const salePrice = Math.round(base * (100 - pct)) / 100;
    if (salePrice >= base) continue;
    svc.promotion = { salePrice, validFrom, validTo };
    await svc.save();
    updated += 1;
  }
  return res.json({ updated, total: services.length });
}

/**
 * PUT /api/businesses/:id/services/reorder
 * Body: { orderedServiceIds: string[] }
 */
async function reorderServices(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);
  const ids = Array.isArray(req.body?.orderedServiceIds)
    ? req.body.orderedServiceIds.map((v) => String(v || "").trim()).filter(Boolean)
    : null;
  if (!ids || ids.length === 0) {
    return res.status(400).json({ message: "orderedServiceIds is required" });
  }
  if (!ids.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "orderedServiceIds contains invalid id" });
  }
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    return res.status(400).json({ message: "orderedServiceIds must not contain duplicates" });
  }
  const services = await Service.find({ business: businessId })
    .select("_id")
    .lean();
  const existingIds = new Set(services.map((s) => String(s._id)));
  if (existingIds.size !== unique.length || unique.some((id) => !existingIds.has(id))) {
    return res.status(400).json({
      message:
        "orderedServiceIds must contain every service id for this business exactly once",
    });
  }
  const bulkOps = unique.map((id, idx) => ({
    updateOne: {
      filter: { _id: id, business: businessId },
      update: { $set: { sortOrder: idx } },
    },
  }));
  if (bulkOps.length > 0) {
    await Service.bulkWrite(bulkOps);
  }
  return res.json({ ok: true });
}

module.exports = {
  listServices,
  createService,
  updateService,
  deleteService,
  applyPromotionBulk,
  reorderServices,
};
