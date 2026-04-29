const mongoose = require("mongoose");
const { ICON_KEYS } = require("../constants/categoryIcons");

const categorySchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, hyphens"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 120,
    },
    iconKey: {
      type: String,
      required: true,
      enum: {
        values: ICON_KEYS,
        message: `iconKey must be one of: ${ICON_KEYS.join(", ")}`,
      },
      default: "other",
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

categorySchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Category", categorySchema);
