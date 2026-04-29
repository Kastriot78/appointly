const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "booking_confirmed",
  "booking_cancelled",
  "reminder_24h",
  "reminder_1h",
  "review_request",
  "new_review",
];

const NOTIFICATION_CHANNELS = ["email", "sms"];

const NOTIFICATION_STATUSES = ["pending", "sent", "failed"];

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: NOTIFICATION_TYPES,
    },
    channel: {
      type: String,
      required: true,
      enum: NOTIFICATION_CHANNELS,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: "pending",
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: 1 });

notificationSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_CHANNELS = NOTIFICATION_CHANNELS;
module.exports.NOTIFICATION_STATUSES = NOTIFICATION_STATUSES;
