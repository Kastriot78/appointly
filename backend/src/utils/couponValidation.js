const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const Booking = require("../models/Booking");
const { getEffectivePrice } = require("./servicePromotion");

function normalizeCouponCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * @param {object} p
 * @param {string} p.businessId
 * @param {string} p.couponCodeRaw
 * @param {object} p.service - lean service doc
 * @param {string} p.bookingDateIso - YYYY-MM-DD
 * @param {string} [p.customerId] - required when checkCustomerUsage
 * @param {boolean} [p.checkCustomerUsage=true]
 * @returns {Promise<{ error: string } | { coupon: object, basePrice: number, finalPrice: number, discountPercent: number }>}
 */
async function validateCouponForBooking({
  businessId,
  couponCodeRaw,
  service,
  bookingDateIso,
  customerId,
  checkCustomerUsage = true,
  /**
   * Optional precomputed base price — used for multi-service bookings where
   * the base is the sum of effective prices across all selected services.
   * When omitted, the single-service effective price is used.
   */
  basePriceOverride,
}) {
  const code = normalizeCouponCode(couponCodeRaw);
  if (!code) {
    return { error: "Enter a coupon code" };
  }
  if (!mongoose.isValidObjectId(businessId)) {
    return { error: "Invalid business" };
  }

  const coupon = await Coupon.findOne({
    business: businessId,
    code,
    isActive: true,
  }).lean();

  if (!coupon) {
    return { error: "Invalid or inactive coupon code" };
  }

  const vf = String(coupon.validFrom || "").slice(0, 10);
  const vt = String(coupon.validTo || "").slice(0, 10);
  const day = String(bookingDateIso || "").slice(0, 10);
  if (day < vf || day > vt) {
    return {
      error: "This coupon is not valid for this appointment date",
    };
  }

  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { error: "This coupon has reached its usage limit" };
  }

  if (checkCustomerUsage) {
    if (!customerId || !mongoose.isValidObjectId(customerId)) {
      return { error: "Sign in or continue as guest before applying a coupon" };
    }
    const maxPer = coupon.maxPerCustomer ?? 1;
    const usedByCustomer = await Booking.countDocuments({
      business: businessId,
      customer: customerId,
      coupon: coupon._id,
      status: { $nin: ["cancelled", "expired"] },
    });
    if (usedByCustomer >= maxPer) {
      return { error: "You have already used this coupon" };
    }
  }

  const basePrice =
    typeof basePriceOverride === "number" && Number.isFinite(basePriceOverride)
      ? Math.round(basePriceOverride * 100) / 100
      : getEffectivePrice(service, bookingDateIso);
  const pct = Math.min(99, Math.max(1, Number(coupon.discountPercent) || 0));
  const finalPrice = Math.round(basePrice * (1 - pct / 100) * 100) / 100;

  return {
    coupon,
    basePrice,
    finalPrice,
    discountPercent: pct,
  };
}

/**
 * @param {string} couponId
 */
async function incrementCouponUsedCount(couponId) {
  if (!couponId) return;
  await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
}

/**
 * @param {string} couponId
 */
async function decrementCouponUsedCount(couponId) {
  if (!couponId) return;
  await Coupon.updateOne(
    { _id: couponId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
  );
}

module.exports = {
  normalizeCouponCode,
  validateCouponForBooking,
  incrementCouponUsedCount,
  decrementCouponUsedCount,
};
