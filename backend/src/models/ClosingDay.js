const mongoose = require("mongoose");

const closingDaySchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

closingDaySchema.index({ business: 1, startsAt: 1 });

module.exports = mongoose.model("ClosingDay", closingDaySchema);
