const mongoose = require("mongoose");
const Review = require("../models/Review");
const Business = require("../models/Business");
const Booking = require("../models/Booking");
const { computeBookingEnd } = require("../utils/bookingReviewHelpers");
const { canManageBusiness } = require("../utils/businessAccess");
const { resolveWorkspaceBusinessIds } = require("../utils/workspaceScope");
const { normalizeRole } = require("../utils/roleChecks");
const {
  isTenantNotificationEnabled,
  resolveBusinessNotifyEmail,
} = require("../utils/tenantNotificationPrefs");
const { sendNewReviewBusinessEmail } = require("../services/bookingEmail.service");

async function updateBusinessReviewStats(businessId) {
  const bid = new mongoose.Types.ObjectId(businessId);
  const agg = await Review.aggregate([
    {
      $match: {
        business: bid,
        staff: null,
      },
    },
    {
      $group: {
        _id: null,
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  const avg = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
  const count = agg.length ? agg[0].count : 0;
  await Business.findByIdAndUpdate(businessId, {
    rating: avg,
    reviewCount: count,
  });
}

/**
 * POST /api/reviews — authenticated customers (and others except self-review)
 * Body: { businessId, rating, text } — public business review
 * Body: { businessId, rating, text, staffId, bookingId } — private staff review (tenant-only visibility)
 */
async function createReview(req, res) {
  const { businessId, rating, text, staffId, bookingId } = req.body;
  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    return res.status(400).json({ message: "Rating must be a whole number from 1 to 5" });
  }
  const body = String(text ?? "").trim();
  if (body.length < 1) {
    return res.status(400).json({ message: "Review text is required" });
  }
  if (body.length > 5000) {
    return res.status(400).json({ message: "Review is too long" });
  }

  const business = await Business.findById(businessId)
    .select("isActive owner name email tenantNotificationPrefs")
    .lean();
  if (!business || !business.isActive) {
    return res.status(404).json({ message: "Business not found" });
  }

  const ownerId = business.owner?.toString?.() ?? String(business.owner);
  if (ownerId === req.userId.toString()) {
    return res.status(403).json({ message: "You cannot review your own business" });
  }

  const staffIdRaw = staffId != null ? String(staffId).trim() : "";
  const bookingIdRaw = bookingId != null ? String(bookingId).trim() : "";
  const isStaffReview =
    staffIdRaw.length > 0 || bookingIdRaw.length > 0;

  if (isStaffReview) {
    if (!mongoose.isValidObjectId(staffIdRaw) || !mongoose.isValidObjectId(bookingIdRaw)) {
      return res.status(400).json({
        message: "Staff reviews require valid staffId and bookingId",
      });
    }

    const booking = await Booking.findById(bookingIdRaw)
      .select("business customer staff status date endTime")
      .populate("staff", "name")
      .lean();

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (String(booking.business) !== String(businessId)) {
      return res.status(400).json({ message: "Booking does not match this business" });
    }
    if (String(booking.customer) !== req.userId.toString()) {
      return res.status(403).json({ message: "Not your booking" });
    }
    if (String(booking.staff?._id ?? booking.staff) !== staffIdRaw) {
      return res.status(400).json({ message: "Staff does not match this booking" });
    }
    if (!["confirmed", "completed"].includes(booking.status)) {
      return res.status(400).json({
        message: "Only completed or confirmed visits can be reviewed",
      });
    }
    const end = computeBookingEnd(booking);
    if (!end || end.getTime() > Date.now()) {
      return res.status(400).json({
        message: "You can review this staff member after the appointment has ended",
      });
    }

    const dup = await Review.findOne({
      booking: bookingIdRaw,
      staff: { $type: "objectId" },
    })
      .select("_id")
      .lean();
    if (dup) {
      return res.status(409).json({ message: "You have already reviewed this visit" });
    }

    const staffName =
      booking.staff && typeof booking.staff === "object" && booking.staff.name
        ? String(booking.staff.name).trim()
        : "";

    try {
      await Review.create({
        business: businessId,
        customer: req.userId,
        staff: staffIdRaw,
        booking: bookingIdRaw,
        rating: r,
        text: body,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: "You have already reviewed this visit" });
      }
      throw err;
    }

    try {
      if (isTenantNotificationEnabled(business, "newReview")) {
        const to = await resolveBusinessNotifyEmail(business);
        if (to) {
          const excerpt =
            body.length > 280 ? `${body.slice(0, 277)}…` : body;
          await sendNewReviewBusinessEmail({
            to,
            businessName: business.name,
            customerName: req.user.name || "Customer",
            rating: r,
            excerpt,
            staffName,
            isStaffReview: true,
          });
        }
      }
    } catch (err) {
      console.error("[review] owner notify (staff):", err.message);
    }

    return res.status(201).json({ ok: true });
  }

  const existing = await Review.findOne({
    business: businessId,
    customer: req.userId,
    staff: null,
  })
    .select("_id")
    .lean();
  if (existing) {
    return res.status(409).json({ message: "You have already reviewed this business" });
  }

  try {
    await Review.create({
      business: businessId,
      customer: req.userId,
      rating: r,
      text: body,
      booking: null,
      staff: null,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already reviewed this business" });
    }
    throw err;
  }

  await updateBusinessReviewStats(businessId);

  try {
    if (isTenantNotificationEnabled(business, "newReview")) {
      const to = await resolveBusinessNotifyEmail(business);
      if (to) {
        const excerpt =
          body.length > 280 ? `${body.slice(0, 277)}…` : body;
        await sendNewReviewBusinessEmail({
          to,
          businessName: business.name,
          customerName: req.user.name || "Customer",
          rating: r,
          excerpt,
        });
      }
    }
  } catch (err) {
    console.error("[review] owner notify:", err.message);
  }

  return res.status(201).json({ ok: true });
}

/**
 * GET /api/reviews/mine — reviews written by the current user (customer-facing list).
 */
async function listMyReviews(req, res) {
  const rows = await Review.find({ customer: req.userId })
    .populate("business", "name logo slug cover")
    .populate("staff", "name role")
    .sort({ createdAt: -1 })
    .lean();

  const reviews = rows.map((r) => ({
    id: String(r._id),
    rating: r.rating,
    text: r.text,
    reply: (r.reply && String(r.reply).trim()) || "",
    repliedAt: r.repliedAt || null,
    createdAt: r.createdAt,
    isStaffReview: !!(r.staff && String(r.staff).length),
    staff: r.staff
      ? {
          id: String(r.staff._id ?? r.staff),
          name:
            typeof r.staff === "object" && r.staff.name
              ? String(r.staff.name).trim()
              : "",
          role:
            typeof r.staff === "object" && r.staff.role
              ? String(r.staff.role).trim()
              : "",
        }
      : null,
    business: r.business
      ? {
          id: String(r.business._id),
          name: r.business.name,
          logo: r.business.logo || "",
          slug: r.business.slug,
          cover: r.business.cover || "",
        }
      : null,
  }));

  return res.json({ reviews });
}

/**
 * GET /api/reviews/managed — reviews on businesses the user owns (tenant); all (admin).
 */
async function listManagedReviews(req, res) {
  if (normalizeRole(req.user?.role) === "staff") {
    return res.status(403).json({
      message: "Reviews management is not available for staff accounts",
    });
  }
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({
      message: scope.error.message,
      ...(scope.error.code ? { code: scope.error.code } : {}),
    });
  }
  const filter = {};
  if (scope.businessIds.length === 0) {
    return res.json({ reviews: [] });
  }
  filter.business = { $in: scope.businessIds };

  const rows = await Review.find(filter)
    .populate("business", "name logo slug")
    .populate("customer", "name email")
    .populate("staff", "name role")
    .sort({ createdAt: -1 })
    .lean();

  const reviews = rows.map((r) => ({
    id: String(r._id),
    rating: r.rating,
    text: r.text,
    reply: (r.reply && String(r.reply).trim()) || "",
    repliedAt: r.repliedAt || null,
    createdAt: r.createdAt,
    isStaffReview: !!(r.staff && String(r.staff).length),
    staff: r.staff
      ? {
          id: String(r.staff._id ?? r.staff),
          name:
            typeof r.staff === "object" && r.staff.name
              ? String(r.staff.name).trim()
              : "",
          role:
            typeof r.staff === "object" && r.staff.role
              ? String(r.staff.role).trim()
              : "",
        }
      : null,
    business: r.business
      ? {
          id: String(r.business._id),
          name: r.business.name,
          logo: r.business.logo || "",
          slug: r.business.slug,
        }
      : null,
    customer: r.customer
      ? {
          id: String(r.customer._id),
          name: r.customer.name || "",
          email: r.customer.email || "",
        }
      : null,
  }));

  return res.json({ reviews });
}

/**
 * PATCH /api/reviews/:id/reply — business owner (or admin) replies to a review.
 */
async function replyToReview(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid review id" });
  }
  const body = String(req.body?.text ?? "").trim();
  if (body.length < 1) {
    return res.status(400).json({ message: "Reply text is required" });
  }
  if (body.length > 5000) {
    return res.status(400).json({ message: "Reply is too long" });
  }

  const review = await Review.findById(id);
  if (!review) {
    return res.status(404).json({ message: "Review not found" });
  }

  const business = await Business.findById(review.business)
    .select("owner name email tenantNotificationPrefs")
    .lean();
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }

  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to reply to this review" });
  }

  review.reply = body;
  review.repliedAt = new Date();
  await review.save();

  const out = review.toJSON();
  return res.json({ review: out });
}

module.exports = {
  createReview,
  updateBusinessReviewStats,
  listMyReviews,
  listManagedReviews,
  replyToReview,
};
