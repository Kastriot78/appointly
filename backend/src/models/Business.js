const mongoose = require("mongoose");

const workingHourSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, trim: true },
    open: { type: String, default: "" },
    close: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const smartStaffRankingSchema = new mongoose.Schema(
  {
    /**
     * When customers choose “Anyone available”, we try staff in ranked order until
     * one fits the slot.
     */
    enabled: { type: Boolean, default: true },
    /**
     * If true, staff whose shift starts earlier that day are tried first when
     * smart metrics tie (recommended for fairness).
     */
    tieBreakEarliestShift: { type: Boolean, default: true },
    /**
     * Comparison order: first entry is the strongest signal. Must be a permutation
     * of performance, ratings, speed (normalized on save).
     */
    priority: {
      type: [String],
      default: () => ["ratings", "performance", "speed"],
    },
  },
  { _id: false },
);

const bookingRulesSchema = new mongoose.Schema(
  {
    minAdvanceHours: { type: Number, default: 2, min: 0 },
    maxAdvanceDays: { type: Number, default: 730, min: 1 },
    autoConfirm: { type: Boolean, default: true },
    /** Extra minutes after each booking before another may start (turnover / cleanup). */
    bookingBufferMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 60,
    },
    /**
     * Rounding for suggested start times on the public picker (gaps are carved from
     * real availability; this only controls which starts we offer in the UI).
     */
    timeOfferStepMinutes: {
      type: Number,
      default: 5,
      enum: [5, 10, 15, 30, 45, 60, 90],
    },
    smartStaffRanking: {
      type: smartStaffRankingSchema,
      default: () => ({}),
    },
  },
  { _id: false },
);

/**
 * Per-tenant controls for the automated "how was your visit?" email.
 * - enabled: on/off switch (tenants can opt out entirely)
 * - delayHours: how long after the appointment ends we wait before sending
 */
const reviewRequestsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    delayHours: { type: Number, default: 2, min: 1, max: 168 },
  },
  { _id: false },
);

/**
 * Per-tenant controls for appointment-reminder emails.
 * - enabled: master on/off switch
 * - before24h: send a reminder ~24 hours before the appointment
 * - before2h: send a heads-up ~2 hours before the appointment
 */
const remindersSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    before24h: { type: Boolean, default: true },
    before2h: { type: Boolean, default: true },
  },
  { _id: false },
);

/**
 * A single item in a business's before/after gallery.
 * Stored as a relative path (e.g. /images/businesses/xxx.jpg) — same format
 * as logo/cover so `resolveMediaUrl` on the frontend handles absolute vs
 * relative paths consistently.
 */
const galleryItemSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 500 },
    caption: { type: String, default: "", trim: true, maxlength: 200 },
    order: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/**
 * Geographic pin for the business. Stored as plain lat/lng — we use Haversine
 * for distance math instead of GeoJSON + $near queries because the dataset is
 * small and the app layer already needs the numeric coordinates to render
 * pins, calculate card distances, etc.
 */
const coordinatesSchema = new mongoose.Schema(
  {
    lat: { type: Number, default: null, min: -90, max: 90 },
    lng: { type: Number, default: null, min: -180, max: 180 },
    lastGeocodedQuery: { type: String, default: "" },
    manuallyPlaced: { type: Boolean, default: false },
  },
  { _id: false },
);

const businessSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase letters, numbers, hyphens",
      ],
    },
    /** Category slug (matches Category.slug in DB). */
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 10000,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    /** `Location` document id (Mongo ObjectId string). */
    location: {
      type: String,
      default: "",
      trim: true,
    },
    /**
     * Resolved geographic coordinates for the business, used by the map
     * search / "find near me" feature. `null` lat/lng means geocoding
     * failed or hasn't been attempted yet — the map view simply hides
     * businesses without a pin.
     */
    coordinates: {
      type: coordinatesSchema,
      default: () => ({}),
    },
    area: {
      type: String,
      default: "",
      trim: true,
    },
    /**
     * ISO 4217 code for all service prices and booking totals for this tenant.
     * Chosen per business (e.g. CHF in Switzerland, TRY in Turkey).
     */
    currency: {
      type: String,
      default: "EUR",
      trim: true,
      uppercase: true,
      maxlength: 3,
    },
    logo: {
      type: String,
      default: "",
      trim: true,
    },
    cover: {
      type: String,
      default: "",
      trim: true,
    },
    workingHours: {
      type: [workingHourSchema],
      default: [],
    },
    bookingRules: {
      type: bookingRulesSchema,
      default: () => ({}),
    },
    reviewRequests: {
      type: reviewRequestsSchema,
      default: () => ({}),
    },
    reminders: {
      type: remindersSchema,
      default: () => ({}),
    },
    gallery: {
      type: [galleryItemSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** When false, business is hidden from /book until an admin approves. Default true for legacy rows. */
    isApproved: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Email notifications to the business (profile/owner). Customer-facing
     * automation (reminders, review requests) uses separate fields.
     */
    tenantNotificationPrefs: {
      type: new mongoose.Schema(
        {
          newBooking: { type: Boolean, default: true },
          bookingCancelled: { type: Boolean, default: true },
          newReview: { type: Boolean, default: true },
          dailySummary: { type: Boolean, default: false },
          weeklyReport: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** Idempotency for scheduled digest emails (UTC date / week keys). */
    tenantDigestMeta: {
      type: new mongoose.Schema(
        {
          lastDailySummaryDate: { type: String, default: "" },
          lastWeeklyReportWeek: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { timestamps: true },
);

businessSchema.index({ owner: 1, slug: 1 });
businessSchema.index({ isActive: 1, isApproved: 1, rating: -1, reviewCount: -1, createdAt: -1 });
/**
 * Simple index on lat + lng for coarse bounding-box queries. We intentionally
 * avoid a 2dsphere index here because our coordinates shape isn't GeoJSON —
 * distance math happens in the app layer (Haversine) and the radius queries
 * are bounded by city, so the dataset stays small.
 */
businessSchema.index({ "coordinates.lat": 1, "coordinates.lng": 1 });

businessSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Business", businessSchema);
