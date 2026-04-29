const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    /** When set, this is a staff-only review (not shown on the public business page). */
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    text: {
      type: String,
      required: [true, "Review text is required"],
      trim: true,
      maxlength: 5000,
    },
    reply: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    repliedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

reviewSchema.index({ business: 1, createdAt: -1 });
reviewSchema.index({ customer: 1, createdAt: -1 });
/** One public (business) review per customer per business. */
reviewSchema.index(
  { business: 1, customer: 1 },
  {
    unique: true,
    /** MongoDB does not allow `$exists: false` in partial indexes; `staff: null` matches null or missing. */
    partialFilterExpression: { staff: null },
  },
);
/** At most one staff review per booking (private to the business in the dashboard). */
reviewSchema.index(
  { booking: 1 },
  {
    unique: true,
    partialFilterExpression: {
      staff: { $type: "objectId" },
      booking: { $type: "objectId" },
    },
  },
);

reviewSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Review", reviewSchema);
