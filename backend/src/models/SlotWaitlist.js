const mongoose = require("mongoose");

const STATUSES = ["active", "offered", "fulfilled", "cancelled"];

const slotWaitlistSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    /** Null when the customer chose “Anyone available”; matches any staff on offer. */
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
      index: true,
    },
    /** UTC midnight for the appointment day (same convention as Booking.date). */
    date: { type: Date, required: true, index: true },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    /** Sorted, comma-separated service ids for matching (deduped). */
    serviceKey: { type: String, required: true, index: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "active",
      index: true,
    },
    offerTokenHash: { type: String, default: null, index: true },
    offerExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

slotWaitlistSchema.index({
  business: 1,
  date: 1,
  startTime: 1,
  serviceKey: 1,
  email: 1,
  status: 1,
});

module.exports = mongoose.model("SlotWaitlist", slotWaitlistSchema);
