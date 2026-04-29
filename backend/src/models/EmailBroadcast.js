const mongoose = require("mongoose");

const emailBroadcastSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    /** Full message text (immutable after send). */
    description: {
      type: String,
      required: true,
      maxlength: 20000,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    recipientCount: {
      type: Number,
      required: true,
      min: 0,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: false },
);

emailBroadcastSchema.index({ business: 1, sentAt: -1 });

module.exports = mongoose.model("EmailBroadcast", emailBroadcastSchema);
