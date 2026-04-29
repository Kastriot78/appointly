const mongoose = require("mongoose");

const WEBHOOK_EVENTS = [
  "booking.created",
  "booking.cancelled",
  "booking.completed",
];

const webhookEndpointSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    events: {
      type: [String],
      default: WEBHOOK_EVENTS,
      validate: {
        validator(value) {
          return (
            Array.isArray(value) &&
            value.length > 0 &&
            value.every((ev) => WEBHOOK_EVENTS.includes(ev))
          );
        },
        message: `events must include at least one of: ${WEBHOOK_EVENTS.join(", ")}`,
      },
    },
    secret: {
      type: String,
      required: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastDeliveredAt: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    lastStatusCode: {
      type: Number,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDeliveries: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

webhookEndpointSchema.index({ business: 1, isActive: 1 });

webhookEndpointSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.secret;
    return ret;
  },
});

module.exports = mongoose.model("WebhookEndpoint", webhookEndpointSchema);
module.exports.WEBHOOK_EVENTS = WEBHOOK_EVENTS;
