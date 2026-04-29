const cron = require("node-cron");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const {
  sendReviewRequestEmail,
} = require("../services/bookingEmail.service");
const {
  computeBookingEnd,
  buildServiceLabel,
  formatDateLabel,
} = require("../utils/bookingReviewHelpers");

const MS_PER_HOUR = 60 * 60 * 1000;

/** Fallback delay when a business has no `reviewRequests.delayHours` set. */
const DEFAULT_DELAY_HOURS = 2;

/**
 * Minimum possible delay a tenant can configure (clamped in the model too).
 * Used as the coarse prefilter when fetching candidate bookings from Mongo —
 * the precise per-business delay check happens in JS afterwards.
 */
const MIN_ALLOWED_DELAY_HOURS = 1;

/**
 * How far back we still consider a booking for a review request. Anything
 * older than this that we somehow never processed gets quietly skipped so we
 * don't spam people days/weeks after the fact (e.g. after SMTP downtime).
 */
const REVIEW_REQUEST_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

async function processBookingForReviewRequest(booking) {
  const cust = booking.customer;
  const biz = booking.business;
  if (!cust?.email || !biz?._id) return { skipped: true, reason: "missing" };

  const existing = await Review.findOne({
    business: biz._id,
    customer: cust._id,
    staff: null,
  })
    .select("_id")
    .lean();
  if (existing) {
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { reviewRequestEmailSentAt: new Date() } },
    );
    return { skipped: true, reason: "already_reviewed" };
  }

  const dateLabel = formatDateLabel(booking.date);
  const res = await sendReviewRequestEmail({
    to: cust.email,
    customerName: cust.name || "there",
    businessName: biz.name || "",
    businessSlug: biz.slug || "",
    dateLabel,
    serviceLabel: buildServiceLabel(booking),
    staffName: booking.staff?.name || "",
    bookingId: booking._id.toString(),
  });

  if (res?.delivered) {
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { reviewRequestEmailSentAt: new Date() } },
    );
    return { sent: true };
  }

  if (res?.reason === "smtp_not_configured") {
    return { skipped: true, reason: "smtp_not_configured" };
  }
  return { skipped: true, reason: res?.reason || "send_failed" };
}

function resolveBusinessDelayHours(biz) {
  const configured = Number(biz?.reviewRequests?.delayHours);
  if (Number.isFinite(configured) && configured >= 1) {
    return Math.min(168, Math.max(1, Math.round(configured)));
  }
  return DEFAULT_DELAY_HOURS;
}

async function runReviewRequestSweep() {
  const now = new Date();
  /**
   * Coarse filter: pull any booking whose day is ≥ MIN_ALLOWED_DELAY_HOURS old.
   * We then check the precise per-business delay in JS, since each tenant can
   * configure their own delay and Mongo can't express "compare against a
   * value from the joined business doc" in a single query here.
   */
  const minCutoff = new Date(now.getTime() - MIN_ALLOWED_DELAY_HOURS * MS_PER_HOUR);
  const lookbackStart = new Date(now.getTime() - REVIEW_REQUEST_LOOKBACK_MS);

  const candidates = await Booking.find({
    status: { $in: ["confirmed", "completed"] },
    reviewRequestEmailSentAt: null,
    date: { $gte: lookbackStart, $lte: minCutoff },
  })
    .populate("business", "name slug reviewRequests")
    .populate("service", "name")
    .populate("staff", "name")
    .populate("customer", "name email")
    .limit(200);

  let sent = 0;
  for (const b of candidates) {
    const biz = b.business;
    if (!biz) continue;

    if (biz.reviewRequests && biz.reviewRequests.enabled === false) {
      /**
       * Tenant opted out. Stamp the booking as handled so we don't keep
       * re-fetching it forever; if they flip the toggle back on, only
       * future appointments will trigger emails — which is the behavior we
       * want (no retroactive blast of old customers).
       */
      await Booking.updateOne(
        { _id: b._id },
        { $set: { reviewRequestEmailSentAt: new Date() } },
      );
      continue;
    }

    const end = computeBookingEnd(b);
    if (!end) continue;

    const delayHours = resolveBusinessDelayHours(biz);
    const perBusinessCutoff = new Date(now.getTime() - delayHours * MS_PER_HOUR);
    if (end.getTime() > perBusinessCutoff.getTime()) continue;

    try {
      const out = await processBookingForReviewRequest(b);
      if (out?.sent) sent += 1;
    } catch (err) {
      console.error(
        `[review-request] booking ${b._id} failed:`,
        err.message,
      );
    }
  }
  if (sent > 0) {
    console.log(`[review-request] Sent ${sent} review request email(s)`);
  }
}

/**
 * Poll every 5 minutes for bookings whose appointment ended at least 2 hours
 * ago and nudge the customer to leave a review (once).
 */
function startReviewRequestJob() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      await runReviewRequestSweep();
    } catch (e) {
      console.error("[review-request]", e.message);
    }
  });
}

module.exports = {
  startReviewRequestJob,
  runReviewRequestSweep,
};
