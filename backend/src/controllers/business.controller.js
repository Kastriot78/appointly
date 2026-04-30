const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Location = require("../models/Location");
const User = require("../models/User");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const ClosingDay = require("../models/ClosingDay");
const { slugify } = require("../utils/slugify");
const { isAdminRole } = require("../utils/roleChecks");
const {
  canManageBusiness,
  canAccessBusinessRead,
} = require("../utils/businessAccess");
const { geocodeAddress } = require("../services/geocoding.service");
const { sendBusinessApprovedEmail } = require("../services/email.service");
const { normalizeCurrency } = require("../utils/currency");
const {
  normalizeTenantNotificationPrefsPatch,
} = require("../utils/tenantNotificationPrefs");
const { parseYmdParts } = require("../utils/bookingAvailability");
const {
  filterBusinessIdsWithAvailability,
} = require("../services/publicDiscoverAvailability.service");
const { uploadImageFile } = require("../services/cloudinary.service");
const { assertBusinessFeature } = require("../utils/subscriptionEnforcement");

const BACKEND_ROOT = path.join(__dirname, "..", "..");

/** Upper bound for bookingRules.maxAdvanceDays (abuse / sanity). */
const MAX_BOOKING_ADVANCE_DAYS = 1825;
/** Default when rules are missing — wide enough for seasonal / long-lead bookings. */
const DEFAULT_MAX_BOOKING_ADVANCE_DAYS = 730;

function tryUnlinkStoredImage(storedUrl) {
  if (!storedUrl || typeof storedUrl !== "string") return;
  const u = storedUrl.trim();
  if (!u.startsWith("/images/") && !u.startsWith("/uploads/")) return;
  const abs = path.join(BACKEND_ROOT, u.replace(/^\//, ""));
  fs.unlink(abs, () => {});
}

function parseCreateBody(req) {
  const raw = { ...(req.body || {}) };
  if (typeof raw.workingHours === "string") {
    try {
      raw.workingHours = JSON.parse(raw.workingHours);
    } catch {
      raw.workingHours = [];
    }
  }
  if (typeof raw.bookingRules === "string") {
    try {
      raw.bookingRules = JSON.parse(raw.bookingRules);
    } catch {
      raw.bookingRules = undefined;
    }
  }
  if (typeof raw.reviewRequests === "string") {
    try {
      raw.reviewRequests = JSON.parse(raw.reviewRequests);
    } catch {
      raw.reviewRequests = undefined;
    }
  }
  if (typeof raw.reminders === "string") {
    try {
      raw.reminders = JSON.parse(raw.reminders);
    } catch {
      raw.reminders = undefined;
    }
  }
  if (typeof raw.gallery === "string") {
    try {
      raw.gallery = JSON.parse(raw.gallery);
    } catch {
      raw.gallery = undefined;
    }
  }
  if (typeof raw.coordinates === "string") {
    try {
      raw.coordinates = JSON.parse(raw.coordinates);
    } catch {
      raw.coordinates = undefined;
    }
  }
  return raw;
}

function normalizeWorkingHours(wh) {
  if (!Array.isArray(wh)) return [];
  return wh.map((row) => ({
    day: String(row.day ?? "").trim(),
    open: String(row.open ?? "").trim(),
    close: String(row.close ?? "").trim(),
    active: Boolean(row.active),
  }));
}

const ALLOWED_TIME_OFFER_STEPS = [5, 10, 15, 30, 45, 60, 90];

const SMART_RANKING_KEYS = ["performance", "ratings", "speed"];
const DEFAULT_SMART_RANKING_PRIORITY = ["ratings", "performance", "speed"];

function normalizeSmartStaffRanking(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      enabled: true,
      tieBreakEarliestShift: true,
      priority: [...DEFAULT_SMART_RANKING_PRIORITY],
    };
  }
  const allowed = new Set(SMART_RANKING_KEYS);
  let priority = Array.isArray(raw.priority)
    ? raw.priority.map((x) => String(x).trim())
    : [];
  priority = priority.filter((k) => allowed.has(k));
  const seen = new Set();
  priority = priority.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (const k of DEFAULT_SMART_RANKING_PRIORITY) {
    if (!seen.has(k)) priority.push(k);
  }
  return {
    enabled: raw.enabled !== false,
    tieBreakEarliestShift: raw.tieBreakEarliestShift !== false,
    priority,
  };
}

function normalizeBookingRules(br) {
  if (!br || typeof br !== "object") {
    return {
      minAdvanceHours: 2,
      maxAdvanceDays: DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
      autoConfirm: true,
      bookingBufferMinutes: 0,
      timeOfferStepMinutes: 5,
      smartStaffRanking: normalizeSmartStaffRanking(null),
    };
  }
  const rawBuf = Number(br.bookingBufferMinutes);
  const bookingBufferMinutes =
    Number.isFinite(rawBuf) && rawBuf >= 0
      ? Math.min(60, Math.round(rawBuf))
      : 0;
  const rawStep = Number(br.timeOfferStepMinutes);
  const timeOfferStepMinutes =
    Number.isFinite(rawStep) && ALLOWED_TIME_OFFER_STEPS.includes(rawStep)
      ? rawStep
      : 5;
  return {
    minAdvanceHours:
      typeof br.minAdvanceHours === "number" &&
      Number.isFinite(br.minAdvanceHours)
        ? Math.max(0, br.minAdvanceHours)
        : 2,
    maxAdvanceDays:
      typeof br.maxAdvanceDays === "number" &&
      Number.isFinite(br.maxAdvanceDays)
        ? Math.min(
            MAX_BOOKING_ADVANCE_DAYS,
            Math.max(1, Math.round(br.maxAdvanceDays)),
          )
        : DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
    autoConfirm: br.autoConfirm !== false,
    bookingBufferMinutes,
    timeOfferStepMinutes,
    smartStaffRanking: normalizeSmartStaffRanking(br.smartStaffRanking),
  };
}

/** Defaults mirror the schema and keep the feature on for brand-new businesses. */
function normalizeReviewRequests(rr) {
  const DEFAULTS = { enabled: true, delayHours: 2 };
  if (!rr || typeof rr !== "object") {
    return { ...DEFAULTS };
  }
  const rawDelay = Number(rr.delayHours);
  const delayHours =
    Number.isFinite(rawDelay) && rawDelay >= 1
      ? Math.min(168, Math.max(1, Math.round(rawDelay)))
      : DEFAULTS.delayHours;
  return {
    enabled: rr.enabled !== false,
    delayHours,
  };
}

/** Appointment-reminder defaults: reminders on, both 24h and 2h on. */
function normalizeReminders(rm) {
  const DEFAULTS = { enabled: true, before24h: true, before2h: true };
  if (!rm || typeof rm !== "object") {
    return { ...DEFAULTS };
  }
  return {
    enabled: rm.enabled !== false,
    before24h: rm.before24h !== false,
    before2h: rm.before2h !== false,
  };
}

/** Cap at 60 images to keep payload / render costs predictable. */
const GALLERY_MAX_ITEMS = 60;

/**
 * Sanitize user-provided coordinate input (from the "drag the pin" UI or
 * from a programmatic client). Returns `null` when the input is missing,
 * malformed, or outside valid lat/lng ranges, so the caller can decide
 * whether to fall back to auto-geocoding.
 */
function normalizeCoordinateInput(input) {
  if (!input || typeof input !== "object") return null;
  const rawLat = input.lat ?? input.latitude;
  const rawLng = input.lng ?? input.lon ?? input.longitude;
  const lat = typeof rawLat === "string" ? parseFloat(rawLat) : rawLat;
  const lng = typeof rawLng === "string" ? parseFloat(rawLng) : rawLng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    manuallyPlaced: input.manuallyPlaced === true,
  };
}

/**
 * Resolve the city name associated with a business's `location` field
 * (`Location` document id). Returns empty string if unknown — the geocoder
 * still works without a city, just less accurately.
 */
async function resolveCityNameForLocationId(locationId) {
  const id = String(locationId || "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return "";
  const doc = await Location.findById(id).lean();
  return doc && typeof doc.name === "string" ? doc.name : "";
}

/**
 * Fire-and-forget best-effort geocoding. Attaches `coordinates.{lat,lng}`
 * to the business document when Nominatim returns a hit. Never throws —
 * geocoding failures must not block save operations.
 *
 * @param {object} business — mongoose Business document (will be mutated +
 *                            saved by the caller; this helper only sets fields)
 * @param {object} opts
 * @param {boolean} [opts.force=false] — re-geocode even if the cached query
 *                                       string is unchanged (e.g., tenant
 *                                       clicked "Re-locate on map")
 */
async function syncBusinessCoordinates(business, opts = {}) {
  const { force = false } = opts;
  if (!business) return;
  if (business.coordinates?.manuallyPlaced && !force) return;

  const address = String(business.address || "").trim();
  const city = await resolveCityNameForLocationId(business.location);
  if (!address && !city) return;

  const signature = `${address.toLowerCase()}||${city.toLowerCase()}`;
  if (
    !force &&
    business.coordinates?.lastGeocodedQuery === signature &&
    business.coordinates?.lat != null &&
    business.coordinates?.lng != null
  ) {
    return;
  }

  const hit = await geocodeAddress({ address, city });
  if (!hit) {
    business.coordinates = {
      ...(business.coordinates?.toObject
        ? business.coordinates.toObject()
        : business.coordinates || {}),
      lastGeocodedQuery: signature,
    };
    return;
  }

  business.coordinates = {
    lat: hit.lat,
    lng: hit.lng,
    lastGeocodedQuery: signature,
    manuallyPlaced: false,
  };
}

function normalizeGallery(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const url = String(raw.url ?? "").trim();
    if (!url) continue;
    const caption = String(raw.caption ?? "")
      .trim()
      .slice(0, 200);
    const order =
      typeof raw.order === "number" && Number.isFinite(raw.order)
        ? Math.max(0, Math.round(raw.order))
        : cleaned.length;
    cleaned.push({ url, caption, order });
    if (cleaned.length >= GALLERY_MAX_ITEMS) break;
  }
  /** Normalize orders to 0..n-1 in the incoming order so the UI is stable. */
  cleaned.sort((a, b) => a.order - b.order);
  return cleaned.map((g, i) => ({ ...g, order: i }));
}

async function assertCategorySlugExists(slug) {
  const s = String(slug || "")
    .trim()
    .toLowerCase();
  const found = await Category.findOne({ slug: s }).lean();
  if (!found) {
    const err = new Error("Unknown category — pick a valid category slug");
    err.statusCode = 400;
    throw err;
  }
}

async function assertLocationIdExists(locationId) {
  const id = String(locationId || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error("Invalid location");
    err.statusCode = 400;
    throw err;
  }
  const found = await Location.findById(id).lean();
  if (!found) {
    const err = new Error("Unknown location — pick a valid city from the list");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * POST /api/businesses — JSON or multipart (logo + cover files optional).
 */
async function createBusiness(req, res) {
  const body = parseCreateBody(req);
  const {
    name,
    slug: slugIn,
    category,
    description,
    phone,
    email,
    address,
    location,
    area,
    workingHours,
    bookingRules,
    reviewRequests,
    reminders,
    gallery,
    coordinates: coordinatesIn,
    isActive: isActiveIn,
    currency: currencyIn,
  } = body || {};

  let logoPath = String(body.logo ?? "").trim();
  let coverPath = String(body.cover ?? "").trim();

  if (req.files?.logo?.[0]) {
    logoPath = await uploadImageFile(req.files.logo[0], "appointly/businesses/logo");
  }
  if (req.files?.cover?.[0]) {
    coverPath = await uploadImageFile(
      req.files.cover[0],
      "appointly/businesses/cover",
    );
  }

  if (!logoPath || !coverPath) {
    return res.status(400).json({
      message: "Logo and cover images are required",
    });
  }

  const n = String(name || "").trim();
  if (!n) {
    return res.status(400).json({ message: "Business name is required" });
  }
  if (!category || !String(category).trim()) {
    return res.status(400).json({ message: "Category is required" });
  }
  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ message: "Phone is required" });
  }

  const catSlug = String(category).trim().toLowerCase();
  await assertCategorySlugExists(catSlug);

  const locRaw = String(location ?? "").trim();
  if (!locRaw) {
    return res.status(400).json({ message: "Location is required" });
  }
  await assertLocationIdExists(locRaw);

  const slug = slugIn ? slugify(slugIn) : slugify(n);

  const isActive =
    isActiveIn === undefined
      ? true
      : isActiveIn === true || isActiveIn === "true";

  const coordsProvided = normalizeCoordinateInput(coordinatesIn);

  const doc = await Business.create({
    owner: req.userId,
    name: n,
    slug,
    category: catSlug,
    description: String(description ?? "").trim(),
    phone: String(phone).trim(),
    email: email != null ? String(email).trim().toLowerCase() : "",
    address: String(address ?? "").trim(),
    location: locRaw,
    area: String(area ?? "").trim(),
    logo: logoPath,
    cover: coverPath,
    workingHours: normalizeWorkingHours(workingHours),
    bookingRules: normalizeBookingRules(bookingRules),
    reviewRequests: normalizeReviewRequests(reviewRequests),
    reminders: normalizeReminders(reminders),
    gallery: normalizeGallery(gallery),
    coordinates: coordsProvided
      ? {
          lat: coordsProvided.lat,
          lng: coordsProvided.lng,
          manuallyPlaced: coordsProvided.manuallyPlaced,
          lastGeocodedQuery: "",
        }
      : undefined,
    isActive,
    isApproved: isAdminRole(req.user.role),
    currency: normalizeCurrency(currencyIn),
  });

  /**
   * Try to auto-fill coordinates from the address when the client didn't
   * supply any. Best-effort — we await it (so the map view gets pins on
   * the very next public load) but swallow any error.
   */
  if (!coordsProvided) {
    try {
      await syncBusinessCoordinates(doc);
      if (doc.isModified("coordinates")) await doc.save();
    } catch {
      /* non-fatal */
    }
  }

  return res.status(201).json({ business: doc.toJSON() });
}

/**
 * GET /api/businesses — tenant: own businesses; staff: linked business;
 * admin: all unless ?scope=mine (then same as tenant, by owner id).
 */
async function listBusinesses(req, res) {
  const filter = {};
  const admin = isAdminRole(req.user.role);
  const scopeMine = String(req.query.scope || "").trim() === "mine";
  const staffBiz = req.user?.staffBusinessId;

  if (admin && !scopeMine) {
    /* all businesses */
  } else if (req.user?.role === "staff" && staffBiz) {
    filter._id = staffBiz;
  } else {
    filter.owner = req.userId;
  }
  const q = Business.find(filter).sort({ createdAt: -1 });
  const businesses = await q.lean();
  const wantOwner = admin && String(req.query.populateOwner || "") === "1";
  /** Resolve owner names reliably (populate alone can miss with lean in some cases). */
  const ids = businesses.map((b) => b._id);
  let svcMap = new Map();
  let stfMap = new Map();
  let bookingMap = new Map();
  let ownerMap = new Map();
  if (ids.length > 0) {
    const ownerIds =
      wantOwner && businesses.length > 0
        ? [
            ...new Set(
              businesses
                .map((b) => (b.owner != null ? String(b.owner) : null))
                .filter(Boolean),
            ),
          ].filter((id) => mongoose.isValidObjectId(id))
        : [];
    const [users, svcAgg, stfAgg, bookingAgg] = await Promise.all([
      ownerIds.length > 0
        ? User.find({ _id: { $in: ownerIds } })
            .select("name email")
            .lean()
        : Promise.resolve([]),
      Service.aggregate([
        { $match: { business: { $in: ids } } },
        { $group: { _id: "$business", count: { $sum: 1 } } },
      ]),
      Staff.aggregate([
        { $match: { business: { $in: ids } } },
        { $group: { _id: "$business", count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { business: { $in: ids } } },
        { $group: { _id: "$business", count: { $sum: 1 } } },
      ]),
    ]);
    for (const u of users) {
      ownerMap.set(String(u._id), {
        id: String(u._id),
        name: u.name || "",
        email: u.email || "",
      });
    }
    svcMap = new Map(svcAgg.map((x) => [String(x._id), x.count]));
    stfMap = new Map(stfAgg.map((x) => [String(x._id), x.count]));
    bookingMap = new Map(bookingAgg.map((x) => [String(x._id), x.count]));
  }
  res.json({
    businesses: businesses.map((b) => {
      const o = { ...b };
      const bid = String(b._id);
      o.id = bid;
      o.serviceCount = svcMap.get(bid) ?? 0;
      o.staffCount = stfMap.get(bid) ?? 0;
      o.bookingCount = bookingMap.get(bid) ?? 0;
      delete o._id;
      delete o.__v;
      if (wantOwner && b.owner != null) {
        const oid = String(b.owner);
        o.owner = ownerMap.get(oid) || {
          id: oid,
          name: "",
          email: "",
        };
      }
      return o;
    }),
  });
}

/**
 * GET /api/businesses/slug/:slug — public booking page (no auth)
 */
async function getBusinessBySlugPublic(req, res) {
  const slug = String(req.params.slug || "")
    .trim()
    .toLowerCase();
  if (!slug) {
    return res.status(400).json({ message: "Slug is required" });
  }

  const business = await Business.findOne({
    slug,
    isActive: true,
    isApproved: { $ne: false },
  }).lean();
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }

  const cat = await Category.findOne({ slug: business.category }).lean();

  const bid = business._id;
  const now = new Date();
  const [services, staffList, reviewDocs, closingRows] = await Promise.all([
    Service.find({ business: bid, isActive: true })
      .sort({ sortOrder: 1, createdAt: 1, name: 1 })
      .lean(),
    Staff.find({ business: bid, isActive: true })
      .populate("services", "name price duration promotion")
      .sort({ name: 1 })
      .lean(),
    Review.find({
      business: bid,
      staff: null,
    })
      .populate("customer", "name avatar")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    ClosingDay.find({ business: bid, endsAt: { $gt: now } })
      .sort({ startsAt: 1 })
      .limit(25)
      .lean(),
  ]);

  const o = { ...business };
  o.id = o._id.toString();
  delete o._id;
  delete o.__v;
  delete o.owner;
  o.categoryName = cat?.name ?? business.category;
  o.iconKey = cat?.iconKey ?? "other";

  o.services = services.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    price: s.price,
    duration: s.duration,
    description: s.description || "",
    promotion: s.promotion || null,
  }));

  o.staff = staffList.map((m) => ({
    id: m._id.toString(),
    name: m.name,
    role: m.role,
    email: m.email || "",
    phone: m.phone || "",
    avatar: m.avatar || "",
    workingDays: Array.isArray(m.workingDays) ? m.workingDays : [],
    timeOff: Array.isArray(m.timeOff)
      ? m.timeOff.map((r) => ({
          startsOn: String(r.startsOn || "").trim(),
          endsOn: String(r.endsOn || "").trim(),
          note: String(r.note || "")
            .trim()
            .slice(0, 200),
        }))
      : [],
    services: (m.services || []).map((s) => ({
      id: s._id.toString(),
      name: s.name,
      price: s.price,
      duration: s.duration,
      promotion: s.promotion || null,
    })),
  }));

  o.reviews = reviewDocs.map((r) => {
    const cust = r.customer;
    const name =
      cust && typeof cust === "object" && cust.name
        ? String(cust.name).trim()
        : "Anonymous";
    const avatarRaw =
      cust && typeof cust === "object" && cust.avatar
        ? String(cust.avatar).trim()
        : "";
    return {
      id: r._id.toString(),
      rating: r.rating,
      text: r.text || "",
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      customerName: name,
      avatar: avatarRaw,
    };
  });

  o.closingPeriods = closingRows.map((c) => ({
    id: c._id.toString(),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    reason: String(c.reason || "").trim(),
  }));

  o.gallery = Array.isArray(business.gallery)
    ? business.gallery
        .slice()
        .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
        .map((g) => ({
          url: g.url,
          caption: g.caption || "",
          order: typeof g.order === "number" ? g.order : 0,
        }))
    : [];

  o.coordinates =
    business.coordinates &&
    typeof business.coordinates.lat === "number" &&
    typeof business.coordinates.lng === "number"
      ? { lat: business.coordinates.lat, lng: business.coordinates.lng }
      : null;

  o.currency = normalizeCurrency(business.currency);

  return res.json({ business: o });
}

/**
 * DELETE /api/businesses/:id — owner or admin
 */
async function deleteBusiness(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const business = await Business.findById(id);
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  if (!canManageBusiness(req.user, business)) {
    return res
      .status(403)
      .json({ message: "Not allowed to delete this business" });
  }

  tryUnlinkStoredImage(business.logo);
  tryUnlinkStoredImage(business.cover);

  await Staff.deleteMany({ business: id });
  await Service.deleteMany({ business: id });
  await Business.findByIdAndDelete(id);
  return res.status(204).send();
}

/**
 * GET /api/businesses/:id
 */
async function getBusiness(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const business = await Business.findById(id);
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  const canRead = await canAccessBusinessRead(req.user, business);
  if (!canRead) {
    return res
      .status(403)
      .json({ message: "Not allowed to view this business" });
  }
  const [serviceCount, staffCount, bookingCount] = await Promise.all([
    Service.countDocuments({ business: id }),
    Staff.countDocuments({ business: id }),
    Booking.countDocuments({ business: id }),
  ]);
  const json = business.toJSON();
  json.serviceCount = serviceCount;
  json.staffCount = staffCount;
  json.bookingCount = bookingCount;
  return res.json({ business: json });
}

/**
 * PUT /api/businesses/:id
 */
async function updateBusiness(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const business = await Business.findById(id);
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  if (!canManageBusiness(req.user, business)) {
    return res
      .status(403)
      .json({ message: "Not allowed to update this business" });
  }

  const body = req.body;
  const allowed = [
    "name",
    "slug",
    "category",
    "description",
    "phone",
    "email",
    "address",
    "location",
    "area",
    "logo",
    "cover",
    "workingHours",
    "bookingRules",
    "reviewRequests",
    "reminders",
    "gallery",
    "coordinates",
    "isActive",
    "currency",
    "tenantNotificationPrefs",
  ];

  for (const key of allowed) {
    if (body[key] === undefined) continue;
    switch (key) {
      case "name":
        business.name = String(body.name).trim() || business.name;
        break;
      case "slug":
        business.slug = slugify(body.slug);
        break;
      case "category": {
        const catSlug = String(body.category).trim().toLowerCase();
        /**
         * Only hit the DB when the value actually changed — round-trips from
         * the edit page re-send every field, and legacy businesses may have
         * categories that no longer exist; we don't want to reject a
         * gallery/hours-only save because of that.
         */
        if (
          catSlug !==
          String(business.category || "")
            .trim()
            .toLowerCase()
        ) {
          await assertCategorySlugExists(catSlug);
          business.category = catSlug;
        }
        break;
      }
      case "description":
        business.description = String(body.description ?? "").trim();
        break;
      case "phone":
        business.phone = String(body.phone ?? "").trim();
        break;
      case "email":
        business.email = String(body.email ?? "")
          .trim()
          .toLowerCase();
        break;
      case "address":
        business.address = String(body.address ?? "").trim();
        break;
      case "location": {
        const loc = String(body.location ?? "").trim();
        if (!loc) {
          return res.status(400).json({ message: "Location is required" });
        }
        /**
         * Only validate against the Location collection when the value
         * actually changed. Legacy businesses created before the Location
         * model stored free-text city names ("Prishtinë") that fail the
         * ObjectId check; we preserve them as-is unless the tenant picks
         * a new city from the dropdown.
         */
        if (loc !== String(business.location || "").trim()) {
          await assertLocationIdExists(loc);
          business.location = loc;
        }
        break;
      }
      case "area":
        business.area = String(body.area ?? "").trim();
        break;
      case "logo":
        business.logo = String(body.logo ?? "").trim();
        break;
      case "cover":
        business.cover = String(body.cover ?? "").trim();
        break;
      case "workingHours":
        business.workingHours = normalizeWorkingHours(body.workingHours);
        break;
      case "bookingRules": {
        const prev =
          business.bookingRules &&
          typeof business.bookingRules.toObject === "function"
            ? business.bookingRules.toObject()
            : business.bookingRules || {};
        const merged = normalizeBookingRules({
          ...prev,
          ...body.bookingRules,
        });
        const prevS = JSON.stringify(prev.smartStaffRanking || {});
        const nextS = JSON.stringify(merged.smartStaffRanking || {});
        if (prevS !== nextS) {
          await assertBusinessFeature(req, id, "smartRanking");
        }
        business.bookingRules = merged;
        break;
      }
      case "reviewRequests": {
        const prev =
          business.reviewRequests &&
          typeof business.reviewRequests.toObject === "function"
            ? business.reviewRequests.toObject()
            : business.reviewRequests || {};
        business.reviewRequests = normalizeReviewRequests({
          ...prev,
          ...body.reviewRequests,
        });
        break;
      }
      case "reminders": {
        const prev =
          business.reminders &&
          typeof business.reminders.toObject === "function"
            ? business.reminders.toObject()
            : business.reminders || {};
        business.reminders = normalizeReminders({
          ...prev,
          ...body.reminders,
        });
        break;
      }
      case "gallery": {
        /**
         * Replacement semantics — the client sends the full desired list.
         * We also remove files that were dropped so disk doesn't grow forever.
         */
        const prev = Array.isArray(business.gallery)
          ? business.gallery.map((g) =>
              g && typeof g.toObject === "function" ? g.toObject() : g,
            )
          : [];
        const next = normalizeGallery(body.gallery);

        const nextUrls = new Set(next.map((g) => g.url));
        for (const old of prev) {
          if (!nextUrls.has(old.url)) {
            tryUnlinkStoredImage(old.url);
          }
        }
        business.gallery = next;
        break;
      }
      case "coordinates": {
        const coords = normalizeCoordinateInput(body.coordinates);
        if (coords) {
          business.coordinates = {
            lat: coords.lat,
            lng: coords.lng,
            manuallyPlaced: coords.manuallyPlaced,
            lastGeocodedQuery: business.coordinates?.lastGeocodedQuery || "",
          };
        } else if (body.coordinates === null) {
          /**
           * Tenant cleared the pin — wipe lat/lng so the business falls back
           * to automatic geocoding on the next address change.
           */
          business.coordinates = {
            lat: null,
            lng: null,
            manuallyPlaced: false,
            lastGeocodedQuery: "",
          };
        }
        break;
      }
      case "isActive":
        business.isActive = Boolean(body.isActive);
        break;
      case "currency":
        business.currency = normalizeCurrency(body.currency);
        break;
      case "tenantNotificationPrefs": {
        const prev =
          business.tenantNotificationPrefs &&
          typeof business.tenantNotificationPrefs.toObject === "function"
            ? business.tenantNotificationPrefs.toObject()
            : business.tenantNotificationPrefs || {};
        const patch = normalizeTenantNotificationPrefsPatch(
          body.tenantNotificationPrefs,
        );
        business.tenantNotificationPrefs = { ...prev, ...patch };
        break;
      }
      default:
        break;
    }
  }

  /**
   * When the address or city changes, refresh the pin via Nominatim — unless
   * the tenant already has a manually-placed pin (the helper checks that).
   * We run this after all other field updates so the new address is already
   * applied on the document.
   */
  const addressChanged =
    body.address !== undefined || body.location !== undefined;
  if (addressChanged) {
    try {
      await syncBusinessCoordinates(business);
    } catch {
      /* non-fatal */
    }
  }

  await business.save();
  const [serviceCount, staffCount, bookingCount] = await Promise.all([
    Service.countDocuments({ business: id }),
    Staff.countDocuments({ business: id }),
    Booking.countDocuments({ business: id }),
  ]);
  const json = business.toJSON();
  json.serviceCount = serviceCount;
  json.staffCount = staffCount;
  json.bookingCount = bookingCount;
  return res.json({ business: json });
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseTimeToMinutes(timeStr) {
  if (timeStr == null || typeof timeStr !== "string") return null;
  const t = timeStr.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (
    Number.isNaN(h) ||
    Number.isNaN(min) ||
    h < 0 ||
    h > 23 ||
    min < 0 ||
    min > 59
  ) {
    return null;
  }
  return h * 60 + min;
}

/** True when current local time is within today's open–close window. */
function isCurrentlyOpenFromRow(row) {
  if (!row || row.active !== true) return false;
  const openM = parseTimeToMinutes(row.open);
  const closeM = parseTimeToMinutes(row.close);
  if (openM === null || closeM === null) return false;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  if (closeM <= openM) {
    return nowM >= openM || nowM < closeM;
  }
  return nowM >= openM && nowM < closeM;
}

function isBusinessOpenNow(workingHours) {
  if (!Array.isArray(workingHours) || workingHours.length === 0) return false;
  const todayIndex = new Date().getDay();
  const todayName = DAY_NAMES[todayIndex];
  const row = workingHours.find((h) => h.day === todayName);
  return isCurrentlyOpenFromRow(row);
}

/**
 * GET /api/businesses/public — discover page (no auth, active businesses only)
 * Query (optional):
 * - priceMin, priceMax — include businesses whose active service price range overlaps [priceMin, priceMax] (list prices, not promos).
 * - availableOn=YYYY-MM-DD — only businesses with ≥1 bookable slot that day (staff, bookings, holds, hours, closings).
 * - clientNowMinutes=0–1439 — with availableOn, skip slot starts ≤ this (send user’s local “now” when filtering “today”).
 */
async function listPublicBusinesses(req, res) {
  let availableOnYmd = null;
  let clientNowMinutes = null;
  if (req.query.availableOn != null && String(req.query.availableOn).trim()) {
    availableOnYmd = parseYmdParts(String(req.query.availableOn).trim());
    if (!availableOnYmd) {
      return res
        .status(400)
        .json({ message: "Invalid availableOn (use YYYY-MM-DD)" });
    }
    if (
      req.query.clientNowMinutes != null &&
      String(req.query.clientNowMinutes).trim() !== ""
    ) {
      const n = Number(req.query.clientNowMinutes);
      if (!Number.isFinite(n) || n < 0 || n >= 24 * 60) {
        return res
          .status(400)
          .json({ message: "Invalid clientNowMinutes (use 0–1439)" });
      }
      clientNowMinutes = Math.floor(n);
    }
  }

  let priceMin = null;
  let priceMax = null;
  if (req.query.priceMin != null && String(req.query.priceMin).trim() !== "") {
    const n = Number(req.query.priceMin);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ message: "Invalid priceMin" });
    }
    priceMin = n;
  }
  if (req.query.priceMax != null && String(req.query.priceMax).trim() !== "") {
    const n = Number(req.query.priceMax);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ message: "Invalid priceMax" });
    }
    priceMax = n;
  }
  if (priceMin != null && priceMax != null && priceMin > priceMax) {
    return res
      .status(400)
      .json({ message: "priceMin cannot be greater than priceMax" });
  }

  let businesses = await Business.find({
    isActive: true,
    isApproved: { $ne: false },
  })
    .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
    .lean();

  const allIds = businesses.map((b) => b._id);
  const priceBoundsMap = new Map();
  if (allIds.length > 0) {
    const boundsRows = await Service.aggregate([
      {
        $match: {
          business: { $in: allIds },
          isActive: true,
        },
      },
      {
        $group: {
          _id: "$business",
          minP: { $min: "$price" },
          maxP: { $max: "$price" },
        },
      },
    ]);
    for (const row of boundsRows) {
      priceBoundsMap.set(String(row._id), {
        min: Number(row.minP) || 0,
        max: Number(row.maxP) || 0,
      });
    }
  }

  if (priceMin != null || priceMax != null) {
    const pMin = priceMin ?? 0;
    const pMax = priceMax ?? Number.MAX_SAFE_INTEGER;
    businesses = businesses.filter((b) => {
      const pb = priceBoundsMap.get(String(b._id));
      if (!pb) return false;
      return pb.max >= pMin && pb.min <= pMax;
    });
  }

  if (availableOnYmd) {
    businesses = await filterBusinessIdsWithAvailability(
      businesses,
      availableOnYmd,
      clientNowMinutes,
    );
  }

  const ids = businesses.map((b) => b._id);
  let servicesByBiz = new Map();
  /** Total active services per business (preview list below is capped at 3). */
  let serviceCountByBiz = new Map();
  if (ids.length > 0) {
    const [countRows, serviceRows] = await Promise.all([
      Service.aggregate([
        {
          $match: {
            business: { $in: ids },
            isActive: true,
          },
        },
        { $group: { _id: "$business", count: { $sum: 1 } } },
      ]),
      Service.find({
        business: { $in: ids },
        isActive: true,
      })
        .sort({ sortOrder: 1, createdAt: 1, name: 1 })
        .lean(),
    ]);
    for (const row of countRows) {
      serviceCountByBiz.set(String(row._id), row.count);
    }

    for (const s of serviceRows) {
      const bid = String(s.business);
      if (!servicesByBiz.has(bid)) servicesByBiz.set(bid, []);
      const arr = servicesByBiz.get(bid);
      if (arr.length < 3) {
        arr.push({
          name: s.name,
          price: s.price,
          promotion: s.promotion || null,
        });
      }
    }
  }

  const out = businesses.map((b) => {
    const bid = String(b._id);
    const services = servicesByBiz.get(bid) ?? [];
    const serviceCount = serviceCountByBiz.get(bid) ?? services.length;
    const rating = b.rating ?? 0;
    const reviewCount = b.reviewCount ?? 0;
    const coords =
      b.coordinates &&
      typeof b.coordinates.lat === "number" &&
      typeof b.coordinates.lng === "number"
        ? { lat: b.coordinates.lat, lng: b.coordinates.lng }
        : null;
    return {
      id: bid,
      slug: b.slug,
      name: b.name,
      category: b.category,
      phone: String(b.phone ?? "").trim(),
      address: String(b.address ?? "").trim(),
      location: b.location || "",
      area: b.area || "",
      rating,
      reviewCount,
      image: b.cover || b.logo || "",
      logo: b.logo || "",
      services,
      serviceCount,
      isOpen: isBusinessOpenNow(b.workingHours),
      featured: rating >= 4.75 && reviewCount >= 40,
      createdAt: b.createdAt ? b.createdAt.toISOString() : null,
      coordinates: coords,
      currency: normalizeCurrency(b.currency),
    };
  });

  res.json({ businesses: out });
}

/**
 * GET /api/businesses/admin/pending-count — admin only
 */
async function getPendingBusinessCount(req, res) {
  const pendingCount = await Business.countDocuments({ isApproved: false });
  res.json({ pendingCount });
}

/**
 * PUT /api/businesses/:id/approval — admin only, body: { approved: boolean }
 */
async function setBusinessApproval(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const { approved } = req.body;
  const business = await Business.findById(id);
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  /** Only notify when moving from “not approved” → approved (avoid duplicate mails). */
  const wasNotApproved = business.isApproved !== true;
  business.isApproved = approved === true || approved === "true";
  await business.save();

  if (business.isApproved === true && wasNotApproved) {
    const publicBase = (
      process.env.FRONTEND_URL ||
      process.env.APP_PUBLIC_URL ||
      process.env.CLIENT_URL ||
      "http://localhost:5173"
    ).replace(/\/$/, "");
    const slug = String(business.slug || "").trim();
    const publicProfileUrl = slug
      ? `${publicBase}/book/${encodeURIComponent(slug)}`
      : "";

    User.findById(business.owner)
      .select("email name")
      .lean()
      .then((owner) => {
        if (!owner?.email) return undefined;
        return sendBusinessApprovedEmail(
          owner.email,
          (owner.name && String(owner.name).trim()) || "there",
          business.name,
          publicProfileUrl,
        );
      })
      .catch((e) => {
        console.error("[email] business approved notify:", e.message);
      });
  }

  return res.json({ business: business.toJSON() });
}

/**
 * GET /api/businesses/:id/customers — customers who booked this business, with counts.
 * Tenant: own businesses only. Admin: any business.
 */
async function listBusinessCustomers(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const business = await Business.findById(id).lean();
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const businessOid = new mongoose.Types.ObjectId(id);

  const rows = await Booking.aggregate([
    {
      $match: {
        business: businessOid,
        status: { $ne: "expired" },
      },
    },
    {
      $group: {
        _id: "$customer",
        reservationCount: { $sum: 1 },
        completedCount: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        noShowCount: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDoc",
      },
    },
    { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        customerId: { $toString: "$_id" },
        name: { $ifNull: ["$userDoc.name", ""] },
        email: { $ifNull: ["$userDoc.email", ""] },
        reservationCount: 1,
        completedCount: 1,
        noShowCount: 1,
      },
    },
    { $sort: { name: 1, email: 1 } },
  ]);

  return res.json({ customers: rows });
}

/**
 * GET /api/businesses/:id/customers/:customerId/service-history
 * Chronological service history for one customer at this business (tenant/admin).
 */
async function getCustomerServiceHistory(req, res) {
  const { id: businessId, customerId } = req.params;
  if (
    !mongoose.isValidObjectId(businessId) ||
    !mongoose.isValidObjectId(customerId)
  ) {
    return res.status(400).json({ message: "Invalid business or customer id" });
  }

  const business = await Business.findById(businessId).lean();
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const userExists = await User.findById(customerId).select("_id").lean();
  if (!userExists) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const rows = await Booking.find({
    business: businessId,
    customer: customerId,
    status: { $ne: "expired" },
  })
    .populate("staff", "name")
    .populate("service", "name")
    .sort({ date: -1, startTime: -1 })
    .lean();

  const items = rows.map((b) => {
    const stf =
      b.staff && typeof b.staff === "object" && b.staff !== null
        ? b.staff
        : null;
    const svc =
      b.service && typeof b.service === "object" && b.service !== null
        ? b.service
        : null;
    const servicesArr = Array.isArray(b.services) ? b.services : [];
    const servicesOut = servicesArr
      .slice()
      .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
      .map((s) => ({
        name: String(s.name || "").trim() || "Service",
        duration: Number(s.duration) || 0,
        price: Number(s.price) || 0,
      }));
    const primaryName =
      String(svc?.name || "").trim() || servicesOut[0]?.name || "Service";
    const servicesLabel =
      servicesOut.length > 1
        ? servicesOut
            .map((s) => s.name)
            .filter(Boolean)
            .join(" + ")
        : primaryName;
    const services =
      servicesOut.length > 0
        ? servicesOut
        : [
            {
              name: primaryName,
              duration: Number(b.duration) || 0,
              price: Number(b.price) || 0,
            },
          ];

    return {
      id: String(b._id),
      date: b.date,
      startTime: b.startTime || "",
      endTime: b.endTime || "",
      duration: Number(b.duration) || 0,
      status: b.status || "confirmed",
      servicesLabel,
      services,
      price: Number(b.price) || 0,
      currency: normalizeCurrency(b.currency),
      staff: {
        id: stf?._id ? String(stf._id) : "",
        name: String(stf?.name || "").trim() || "Staff",
      },
      notes: String(b.notes || "").trim(),
      cancellationReason:
        b.status === "cancelled"
          ? String(b.cancellationReason || "").trim()
          : "",
      requestedStartTime: String(b.requestedStartTime || "").trim(),
    };
  });

  return res.json({ items });
}

module.exports = {
  createBusiness,
  listBusinesses,
  listPublicBusinesses,
  getBusinessBySlugPublic,
  getBusiness,
  updateBusiness,
  deleteBusiness,
  getPendingBusinessCount,
  setBusinessApproval,
  listBusinessCustomers,
  getCustomerServiceHistory,
};
