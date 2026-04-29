const mongoose = require("mongoose");

const BOOKING_STATUSES = [
  "pending",
  "pending_confirmation",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "expired",
];

/** Statuses that occupy the calendar / block double-booking */
const BOOKING_STATUSES_BLOCKING = [
  "pending",
  "pending_confirmation",
  "confirmed",
];

/**
 * Snapshot of a single service on a (possibly multi-service) booking.
 * Duration + price are captured so invoices / history stay accurate if the
 * underlying service doc changes later.
 */
const bookingServiceSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    name: { type: String, default: "", trim: true, maxlength: 200 },
    duration: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0, default: null },
    order: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    /**
     * Primary service for back-compat and quick population.
     * For multi-service bookings this equals `services[0].service`.
     */
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    /**
     * Full list of services on this booking (may be a single entry).
     * Present on all bookings created after the multi-service feature;
     * older bookings may have this empty and should fall back to `service`.
     */
    services: {
      type: [bookingServiceSchema],
      default: [],
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    startTime: {
      type: String,
      required: [true, "startTime is required"],
      trim: true,
    },
    endTime: {
      type: String,
      required: [true, "endTime is required"],
      trim: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    /** ISO 4217 — snapshot from business at booking time. */
    currency: {
      type: String,
      default: "EUR",
      trim: true,
      uppercase: true,
      maxlength: 3,
    },
    /** Price before coupon discount (effective list/sale price for the day). */
    originalPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    /** Snapshot when coupon applied (percent off originalPrice) */
    couponDiscountPercent: {
      type: Number,
      min: 1,
      max: 99,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: BOOKING_STATUSES,
        message: `status must be one of: ${BOOKING_STATUSES.join(", ")}`,
      },
      default: "confirmed",
    },
    /** When status is pending_confirmation — client must confirm or decline before this */
    confirmationExpiresAt: {
      type: Date,
      default: null,
    },
    /**
     * If the client asked for a different time than `startTime` (alternative hold),
     * stores the time they originally requested (HH:mm). Empty when not applicable.
     */
    requestedStartTime: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    cancellationReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    /** Set when status becomes `cancelled` — used to restore within the undo window. */
    previousStatusBeforeCancel: {
      type: String,
      default: null,
    },
    /** Wall-clock time when the booking was cancelled (undo window anchor). */
    cancelledAt: {
      type: Date,
      default: null,
    },
    /** Who initiated the cancellation — undo is only offered to the same party. */
    cancellationSource: {
      type: String,
      default: null,
      trim: true,
    },
    /**
     * Timestamp of the automated "how was your visit" email.
     * Null until the review-request job has contacted the customer so the job
     * stays idempotent and we never spam more than once per booking.
     */
    reviewRequestEmailSentAt: {
      type: Date,
      default: null,
    },
    /**
     * Idempotency stamps for the appointment-reminder emails. Each window
     * has its own flag so the reminder job never double-sends.
     * Also set (with the current time) when the booking is skipped —
     * e.g. the tenant has reminders off — so the sweep drops it from
     * future scans.
     */
    reminder24hSentAt: {
      type: Date,
      default: null,
    },
    reminder2hSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

bookingSchema.index({ business: 1, date: 1 });
bookingSchema.index({ business: 1, status: 1, date: 1, startTime: 1 });
bookingSchema.index({ staff: 1, date: 1 });
bookingSchema.index({ customer: 1, date: -1 });
bookingSchema.index(
  { staff: 1, date: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "pending_confirmation", "confirmed"] },
    },
  },
);
bookingSchema.index({ status: 1, confirmationExpiresAt: 1 });
bookingSchema.index({ status: 1, date: 1, reviewRequestEmailSentAt: 1 });
bookingSchema.index({ status: 1, date: 1, reminder24hSentAt: 1 });
bookingSchema.index({ status: 1, date: 1, reminder2hSentAt: 1 });

bookingSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Booking", bookingSchema);
module.exports.BOOKING_STATUSES = BOOKING_STATUSES;
module.exports.BOOKING_STATUSES_BLOCKING = BOOKING_STATUSES_BLOCKING;
