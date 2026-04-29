const mongoose = require("mongoose");

const newsletterSubscriptionSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    /** Optional hint where the signup came from (e.g. footer). */
    source: {
      type: String,
      default: "footer",
      trim: true,
      maxlength: 64,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "NewsletterSubscription",
  newsletterSubscriptionSchema,
);
