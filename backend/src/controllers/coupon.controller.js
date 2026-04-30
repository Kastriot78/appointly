const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const Business = require("../models/Business");
const Booking = require("../models/Booking");
const User = require("../models/User");
const Service = require("../models/Service");
const { canManageBusiness } = require("../utils/businessAccess");
const {
  isValidIsoDate,
  getEffectivePrice,
} = require("../utils/servicePromotion");
const {
  normalizeCouponCode,
  validateCouponForBooking,
} = require("../utils/couponValidation");
const { sendCouponOfferEmail } = require("../services/bookingEmail.service");
const { assertBusinessFeature } = require("../utils/subscriptionEnforcement");
const { getPublicSiteBase } = require("../utils/sitePublicUrl");

async function assertManageCoupon(req, businessId) {
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
 * Distinct customer emails for this business (bookings, non-expired), validated format.
 */
async function getDistinctCustomerEmailsForBusiness(businessId) {
  const ids = await Booking.distinct("customer", {
    business: businessId,
    status: { $ne: "expired" },
  });
  const validIds = ids.filter((x) => x != null);
  if (validIds.length === 0) return [];
  const users = await User.find({ _id: { $in: validIds } })
    .select("email")
    .lean();
  const out = new Set();
  for (const u of users) {
    const e = String(u.email || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) out.add(e);
  }
  return [...out].sort();
}

function buildCouponMailContext(business, coupon) {
  const base = getPublicSiteBase();
  const slug = business.slug ? String(business.slug).trim() : "";
  return {
    businessName: business.name || "A business",
    code: coupon.code,
    discountPercent: coupon.discountPercent,
    validFrom: coupon.validFrom,
    validTo: coupon.validTo,
    bookUrl: slug
      ? `${base}/book/${encodeURIComponent(slug)}`
      : `${base}/book`,
  };
}

async function sendCouponToEmails(emails, ctx) {
  let sent = 0;
  let failed = 0;
  for (const to of emails) {
    const result = await sendCouponOfferEmail({ to, ...ctx });
    if (result.delivered) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

function mapCoupon(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: o._id.toString(),
    businessId: String(o.business),
    code: o.code,
    discountPercent: o.discountPercent,
    validFrom: o.validFrom,
    validTo: o.validTo,
    maxUses: o.maxUses,
    usedCount: o.usedCount,
    maxPerCustomer: o.maxPerCustomer ?? 1,
    isActive: o.isActive !== false,
    createdAt: o.createdAt,
  };
}

/**
 * GET /api/businesses/:id/coupons
 */
async function listCoupons(req, res) {
  const { id } = req.params;
  await assertManageCoupon(req, id);
  const rows = await Coupon.find({ business: id })
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ coupons: rows.map(mapCoupon) });
}

/**
 * POST /api/businesses/:id/coupons
 * Body: { code, discountPercent, validFrom, validTo, maxUses?, maxPerCustomer? }
 */
async function createCoupon(req, res) {
  const { id } = req.params;
  await assertManageCoupon(req, id);
  await assertBusinessFeature(req, id, "coupons");

  const codeRaw = String(req.body?.code ?? "").trim();
  const code = normalizeCouponCode(codeRaw);
  if (!code || code.length < 3) {
    return res
      .status(400)
      .json({ message: "Coupon code must be at least 3 characters" });
  }

  const discountPercent = Number(req.body?.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 99) {
    return res.status(400).json({
      message: "discountPercent must be between 1 and 99",
    });
  }

  const validFrom = String(req.body?.validFrom ?? "").trim().slice(0, 10);
  const validTo = String(req.body?.validTo ?? "").trim().slice(0, 10);
  if (!isValidIsoDate(validFrom) || !isValidIsoDate(validTo)) {
    return res.status(400).json({
      message: "validFrom and validTo must be YYYY-MM-DD",
    });
  }
  if (validFrom > validTo) {
    return res.status(400).json({
      message: "End date must be on or after start date",
    });
  }

  let maxUses = req.body?.maxUses;
  if (maxUses === "" || maxUses === null || maxUses === undefined) {
    maxUses = null;
  } else {
    maxUses = Number(maxUses);
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      return res.status(400).json({ message: "maxUses must be a positive number or empty" });
    }
  }

  let maxPerCustomer = Number(req.body?.maxPerCustomer ?? 1);
  if (!Number.isFinite(maxPerCustomer) || maxPerCustomer < 1) {
    maxPerCustomer = 1;
  }

  try {
    const doc = await Coupon.create({
      business: id,
      code,
      discountPercent: Math.round(discountPercent),
      validFrom,
      validTo,
      maxUses,
      maxPerCustomer,
      isActive: true,
    });
    return res.status(201).json({ coupon: mapCoupon(doc) });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({
        message: "A coupon with this code already exists for this business",
      });
    }
    throw e;
  }
}

/**
 * PUT /api/businesses/:id/coupons/:couponId
 */
async function updateCoupon(req, res) {
  const { id, couponId } = req.params;
  await assertManageCoupon(req, id);
  await assertBusinessFeature(req, id, "coupons");
  if (!mongoose.isValidObjectId(couponId)) {
    return res.status(400).json({ message: "Invalid coupon id" });
  }

  const coupon = await Coupon.findOne({ _id: couponId, business: id });
  if (!coupon) {
    return res.status(404).json({ message: "Coupon not found" });
  }
  if (!coupon.isActive) {
    return res.status(400).json({
      message:
        "Inactive coupons cannot be edited. Remove this coupon or create a new one.",
    });
  }

  if (req.body.isActive === false) {
    coupon.isActive = false;
  } else if (req.body.isActive === true) {
    coupon.isActive = true;
  }

  const vf = req.body.validFrom != null
    ? String(req.body.validFrom).trim().slice(0, 10)
    : null;
  const vt = req.body.validTo != null
    ? String(req.body.validTo).trim().slice(0, 10)
    : null;
  if (vf != null || vt != null) {
    const from = vf != null ? vf : coupon.validFrom;
    const to = vt != null ? vt : coupon.validTo;
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      return res.status(400).json({ message: "Dates must be YYYY-MM-DD" });
    }
    if (from > to) {
      return res.status(400).json({ message: "End date must be on or after start" });
    }
    coupon.validFrom = from;
    coupon.validTo = to;
  }

  if (req.body.discountPercent != null) {
    const d = Number(req.body.discountPercent);
    if (!Number.isFinite(d) || d < 1 || d > 99) {
      return res.status(400).json({ message: "discountPercent must be 1–99" });
    }
    coupon.discountPercent = Math.round(d);
  }

  if (req.body.code != null) {
    const code = normalizeCouponCode(String(req.body.code));
    if (!code || code.length < 3) {
      return res
        .status(400)
        .json({ message: "Coupon code must be at least 3 characters" });
    }
    const dup = await Coupon.findOne({
      business: id,
      code,
      _id: { $ne: coupon._id },
    })
      .select("_id")
      .lean();
    if (dup) {
      return res.status(409).json({
        message: "A coupon with this code already exists for this business",
      });
    }
    coupon.code = code;
  }

  if (req.body.maxUses !== undefined) {
    let maxUses = req.body.maxUses;
    if (maxUses === "" || maxUses === null) {
      coupon.maxUses = null;
    } else {
      maxUses = Number(maxUses);
      if (!Number.isFinite(maxUses) || maxUses < 1) {
        return res
          .status(400)
          .json({ message: "maxUses must be a positive number or empty" });
      }
      coupon.maxUses = maxUses;
    }
  }

  if (req.body.maxPerCustomer != null) {
    const mpc = Number(req.body.maxPerCustomer);
    if (!Number.isFinite(mpc) || mpc < 1) {
      return res.status(400).json({ message: "maxPerCustomer must be at least 1" });
    }
    coupon.maxPerCustomer = mpc;
  }

  await coupon.save();
  return res.json({ coupon: mapCoupon(coupon) });
}

/**
 * DELETE /api/businesses/:id/coupons/:couponId
 * — If coupon is active: soft-deactivate (same as before).
 * — If already inactive: permanently remove the document (tenant cleanup).
 */
async function deleteCoupon(req, res) {
  const { id, couponId } = req.params;
  await assertManageCoupon(req, id);
  await assertBusinessFeature(req, id, "coupons");
  if (!mongoose.isValidObjectId(couponId)) {
    return res.status(400).json({ message: "Invalid coupon id" });
  }
  const coupon = await Coupon.findOne({ _id: couponId, business: id });
  if (!coupon) {
    return res.status(404).json({ message: "Coupon not found" });
  }
  if (coupon.isActive) {
    coupon.isActive = false;
    await coupon.save();
    return res.json({ ok: true, deactivated: true });
  }
  await Coupon.deleteOne({ _id: couponId, business: id });
  return res.json({ ok: true, deleted: true });
}

/**
 * POST /api/businesses/:id/coupons/validate — public (booking modal preview)
 * Body: { code, serviceId | serviceIds, date }
 * `serviceIds` is an array or comma-separated string when previewing multi-service bookings.
 */
async function validateCouponPublic(req, res) {
  const { id } = req.params;
  const { code, serviceId, serviceIds, date: dateStr } = req.body || {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const biz = await Business.findById(id).select("isActive").lean();
  if (!biz || !biz.isActive) {
    return res.status(404).json({ message: "Business not found" });
  }

  let idList = [];
  if (Array.isArray(serviceIds)) {
    idList = serviceIds;
  } else if (typeof serviceIds === "string" && serviceIds.trim()) {
    idList = serviceIds.split(",");
  } else if (serviceId) {
    idList = [serviceId];
  }
  const cleanIds = [];
  const seen = new Set();
  for (const raw of idList) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (!mongoose.isValidObjectId(s)) {
      return res.status(400).json({ message: "Invalid service id" });
    }
    if (seen.has(s)) continue;
    seen.add(s);
    cleanIds.push(s);
  }
  if (cleanIds.length === 0) {
    return res.status(400).json({ message: "Invalid service id" });
  }

  const services = await Service.find({
    _id: { $in: cleanIds },
    business: id,
    isActive: true,
  }).lean();
  if (services.length !== cleanIds.length) {
    return res.status(404).json({ message: "One or more services not found" });
  }
  const ordered = cleanIds.map((sid) =>
    services.find((s) => String(s._id) === sid),
  );
  const primary = ordered[0];

  const bookingDateIso = String(dateStr || "").trim().slice(0, 10);
  if (!isValidIsoDate(bookingDateIso)) {
    return res.status(400).json({ message: "Invalid date" });
  }

  const totalBase =
    Math.round(
      ordered.reduce(
        (sum, s) => sum + getEffectivePrice(s, bookingDateIso),
        0,
      ) * 100,
    ) / 100;

  const result = await validateCouponForBooking({
    businessId: id,
    couponCodeRaw: code,
    service: primary,
    bookingDateIso,
    customerId: null,
    checkCustomerUsage: false,
    basePriceOverride: totalBase,
  });

  if (result.error) {
    return res.status(400).json({ valid: false, message: result.error });
  }

  return res.json({
    valid: true,
    discountPercent: result.discountPercent,
    basePrice: result.basePrice,
    finalPrice: result.finalPrice,
  });
}

/**
 * POST /api/businesses/:id/coupons/:couponId/send-email
 * Body (one of):
 * - { to: "email" } — single
 * - { sendToAllCustomers: true } — everyone who booked (with email)
 * - { emails: ["a@b.com", ...] } — subset of customer emails only (validated server-side)
 */
async function sendCouponEmail(req, res) {
  const { id, couponId } = req.params;
  const business = await assertManageCoupon(req, id);
  await assertBusinessFeature(req, id, "coupons");
  if (!mongoose.isValidObjectId(couponId)) {
    return res.status(400).json({ message: "Invalid coupon id" });
  }

  const coupon = await Coupon.findOne({
    _id: couponId,
    business: id,
    isActive: true,
  }).lean();
  if (!coupon) {
    return res.status(404).json({ message: "Coupon not found" });
  }

  const ctx = buildCouponMailContext(business, coupon);
  const allowedEmails = await getDistinctCustomerEmailsForBusiness(id);
  const allowedSet = new Set(allowedEmails);

  if (req.body?.sendToAllCustomers === true) {
    if (allowedEmails.length === 0) {
      return res.status(400).json({
        message:
          "No customers with email addresses yet. Bookings need to exist first.",
      });
    }
    const { sent, failed } = await sendCouponToEmails(allowedEmails, ctx);
    if (sent === 0) {
      return res.status(503).json({
        message:
          failed > 0
            ? "Could not send emails. Check SMTP configuration."
            : "No messages sent.",
        sent: 0,
        failed,
        total: allowedEmails.length,
      });
    }
    return res.json({
      ok: true,
      sent,
      failed,
      total: allowedEmails.length,
    });
  }

  if (Array.isArray(req.body?.emails)) {
    const raw = req.body.emails;
    const requested = [
      ...new Set(
        raw
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
      ),
    ];
    if (requested.length === 0) {
      return res.status(400).json({
        message: "Select at least one valid email address.",
      });
    }
    for (const e of requested) {
      if (!allowedSet.has(e)) {
        return res.status(400).json({
          message:
            "One or more addresses are not customers of this business.",
        });
      }
    }
    const { sent, failed } = await sendCouponToEmails(requested, ctx);
    if (sent === 0) {
      return res.status(503).json({
        message:
          "Could not send emails. Check SMTP configuration.",
        sent: 0,
        failed,
        total: requested.length,
      });
    }
    return res.json({
      ok: true,
      sent,
      failed,
      total: requested.length,
    });
  }

  const to = String(req.body?.to ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ message: "Valid email address required" });
  }

  const result = await sendCouponOfferEmail({ to, ...ctx });

  if (!result.delivered) {
    return res.status(503).json({
      message:
        result.reason === "smtp_not_configured"
          ? "Email is not configured on the server (SMTP)."
          : "Could not send email.",
    });
  }

  return res.json({ ok: true, delivered: true, sent: 1, failed: 0, total: 1 });
}

module.exports = {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCouponPublic,
  sendCouponEmail,
};
