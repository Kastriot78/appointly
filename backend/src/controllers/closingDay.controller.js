const mongoose = require("mongoose");
const ClosingDay = require("../models/ClosingDay");
const Business = require("../models/Business");
const { canManageBusiness } = require("../utils/businessAccess");
const { getDistinctCustomerRecipientsForBusiness } = require("../utils/businessCustomerEmails");
const {
  sendClosingPeriodEmailsToCustomers,
} = require("../services/bookingEmail.service");

function mapClosing(c) {
  return {
    id: c._id.toString(),
    businessId: String(c.business),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    reason: c.reason || "",
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
  };
}

async function assertBusinessAccess(req, businessId) {
  if (!mongoose.isValidObjectId(businessId)) {
    const err = new Error("Invalid business id");
    err.statusCode = 400;
    throw err;
  }
  const business = await Business.findById(businessId).lean();
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

/**
 * GET /api/businesses/:id/closing-days
 */
async function listClosingDays(req, res) {
  const { id } = req.params;
  await assertBusinessAccess(req, id);
  const rows = await ClosingDay.find({ business: id })
    .sort({ startsAt: -1 })
    .lean();
  return res.json({ closingDays: rows.map(mapClosing) });
}

/**
 * POST /api/businesses/:id/closing-days
 * Body: { startsAt: ISO string, endsAt: ISO string, reason?: string }
 */
async function createClosingDay(req, res) {
  const { id } = req.params;
  await assertBusinessAccess(req, id);
  const { startsAt: sIn, endsAt: eIn, reason: rIn } = req.body || {};
  const startsAt = sIn != null ? new Date(sIn) : null;
  const endsAt = eIn != null ? new Date(eIn) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return res.status(400).json({ message: "startsAt is required (ISO date)" });
  }
  if (!endsAt || Number.isNaN(endsAt.getTime())) {
    return res.status(400).json({ message: "endsAt is required (ISO date)" });
  }
  if (endsAt <= startsAt) {
    return res.status(400).json({ message: "endsAt must be after startsAt" });
  }
  const reason = String(rIn ?? "").trim().slice(0, 500);
  const doc = await ClosingDay.create({
    business: id,
    startsAt,
    endsAt,
    reason,
  });

  const biz = await Business.findById(id).select("name slug").lean();
  const businessName = biz?.name?.trim() || "Business";
  const businessSlug = biz?.slug ? String(biz.slug).trim() : "";

  void getDistinctCustomerRecipientsForBusiness(id)
    .then((recipients) =>
      sendClosingPeriodEmailsToCustomers({
        businessName,
        businessSlug,
        startsAt,
        endsAt,
        reason,
        recipients,
      }),
    )
    .then((result) => {
      if (result.delivered > 0) {
        console.log(
          `[closing-email] sent closing notice to ${result.delivered} customer(s) for business ${id}`,
        );
      }
    })
    .catch((err) =>
      console.error("[closing-email] notify customers failed:", err.message),
    );

  return res.status(201).json({ closingDay: mapClosing(doc.toObject()) });
}

/**
 * PUT /api/businesses/:id/closing-days/:closingId
 */
async function updateClosingDay(req, res) {
  const { id, closingId } = req.params;
  await assertBusinessAccess(req, id);
  if (!mongoose.isValidObjectId(closingId)) {
    return res.status(400).json({ message: "Invalid closing id" });
  }
  const doc = await ClosingDay.findOne({
    _id: closingId,
    business: id,
  });
  if (!doc) {
    return res.status(404).json({ message: "Closing period not found" });
  }
  const { startsAt: sIn, endsAt: eIn, reason: rIn } = req.body || {};
  if (sIn != null) {
    const d = new Date(sIn);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: "Invalid startsAt" });
    }
    doc.startsAt = d;
  }
  if (eIn != null) {
    const d = new Date(eIn);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: "Invalid endsAt" });
    }
    doc.endsAt = d;
  }
  if (doc.endsAt <= doc.startsAt) {
    return res.status(400).json({ message: "endsAt must be after startsAt" });
  }
  if (rIn !== undefined) {
    doc.reason = String(rIn ?? "").trim().slice(0, 500);
  }
  await doc.save();
  return res.json({ closingDay: mapClosing(doc.toObject()) });
}

/**
 * DELETE /api/businesses/:id/closing-days/:closingId
 */
async function deleteClosingDay(req, res) {
  const { id, closingId } = req.params;
  await assertBusinessAccess(req, id);
  if (!mongoose.isValidObjectId(closingId)) {
    return res.status(400).json({ message: "Invalid closing id" });
  }
  const result = await ClosingDay.deleteOne({
    _id: closingId,
    business: id,
  });
  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "Closing period not found" });
  }
  return res.json({ ok: true });
}

module.exports = {
  listClosingDays,
  createClosingDay,
  updateClosingDay,
  deleteClosingDay,
};
