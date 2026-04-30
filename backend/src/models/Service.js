const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: 200,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    duration: {
      type: Number,
      required: [true, "Duration in minutes is required"],
      min: 1,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    bufferMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxCapacity: {
      type: Number,
      default: 1,
      min: 1,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Optional time-limited sale (booking price uses salePrice when appointment date ∈ [validFrom, validTo]). */
    promotion: {
      salePrice: { type: Number, min: 0 },
      validFrom: { type: String, trim: true },
      validTo: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

serviceSchema.index({ business: 1, name: 1 });
serviceSchema.index({ business: 1, sortOrder: 1, createdAt: 1 });

serviceSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Service", serviceSchema);
