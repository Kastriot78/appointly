const mongoose = require("mongoose");

const staffWorkingHoursSchema = new mongoose.Schema(
  {
    open: { type: String, default: "09:00" },
    close: { type: String, default: "18:00" },
  },
  { _id: false },
);

/** Inclusive calendar days off (YYYY-MM-DD) — no bookable slots for this staff. */
const staffTimeOffSchema = new mongoose.Schema(
  {
    startsOn: { type: String, required: true, trim: true },
    endsOn: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true, maxlength: 200 },
  },
  { _id: false },
);

const staffSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Staff name is required"],
      trim: true,
      maxlength: 120,
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    avatar: {
      type: String,
      default: "",
      trim: true,
    },
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],
    workingDays: {
      type: [String],
      default: [],
    },
    workingHours: {
      type: staffWorkingHoursSchema,
      default: () => ({}),
    },
    timeOff: {
      type: [staffTimeOffSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Set when the staff member completes dashboard invite — their login user. */
    linkedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /**
     * One-time dashboard invite token (plain, unguessable). Cleared after use.
     */
    dashboardInviteToken: {
      type: String,
      default: null,
      select: false,
      sparse: true,
      index: true,
    },
    dashboardInviteExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

staffSchema.index({ business: 1, name: 1 });

staffSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Staff", staffSchema);
