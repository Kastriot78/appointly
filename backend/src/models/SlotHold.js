const mongoose = require("mongoose");

/**
 * Short-lived checkout lock so two browsers don't see the same slot as free.
 * TTL index removes expired docs automatically (eventual).
 */
const slotHoldSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 1 },
    /** Opaque client id (UUID) — required to release or complete booking. */
    holderKey: { type: String, required: true, trim: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

slotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/** Fast lookup for “who is blocking this day” (overlap checked in app code). */
slotHoldSchema.index({ staff: 1, date: 1 });

module.exports = mongoose.model("SlotHold", slotHoldSchema);
