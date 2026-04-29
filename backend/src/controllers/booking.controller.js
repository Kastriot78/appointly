const crypto = require("crypto");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const SlotHold = require("../models/SlotHold");
const ClosingDay = require("../models/ClosingDay");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const { canManageBusiness } = require("../utils/businessAccess");
const { isAdminRole } = require("../utils/roleChecks");
const { resolveWorkspaceBusinessIds } = require("../utils/workspaceScope");
const {
  parseYmdParts,
  utcDayBounds,
  minutesToTime,
  parseTimeToMinutes,
  staffOffersService,
  getGridWindowForDay,
  collectDynamicOfferStarts,
  getTimeOfferStepMinutes,
  getBookingBufferMinutes,
  slotWorksForStaff,
  findNearestAlternativeSlot,
  slotOverlapsClosing,
} = require("../utils/bookingAvailability");
const {
  ymdPartsToIso,
  getEffectivePrice,
} = require("../utils/servicePromotion");
const {
  validateCouponForBooking,
  incrementCouponUsedCount,
  decrementCouponUsedCount,
} = require("../utils/couponValidation");
const User = require("../models/User");
const Review = require("../models/Review");
const {
  computeBookingEnd,
  buildServiceLabel,
  formatDateLabel,
} = require("../utils/bookingReviewHelpers");
const { normalizeCurrency } = require("../utils/currency");
const PendingRegistration = require("../models/PendingRegistration");
const {
  sendBookingConfirmedCustomerEmail,
  sendBookingConfirmedBusinessEmail,
  sendBookingCancelledBusinessEmail,
  sendGuestBookingCredentialsEmail,
} = require("../services/bookingEmail.service");
const {
  isTenantNotificationEnabled,
  resolveBusinessNotifyEmail,
} = require("../utils/tenantNotificationPrefs");
const { signAuthToken } = require("../utils/jwt");
const { toPublicUser } = require("../utils/userPublic");
const {
  loadHoldsMapForDay,
  mergeHoldsIntoBookingsMap,
} = require("../services/slotHold.service");
const {
  sortEligibleStaffForAny,
} = require("../services/anyStaffRanking.service");
const {
  loadDynamicPublicSlotsForModal,
} = require("../services/dynamicPublicSlots.service");
const {
  processWaitlistAfterCancellation,
  fulfillWaitlistIfTokenMatches,
} = require("../services/slotWaitlist.service");
const { emitBookingWebhookEvent } = require("../services/webhook.service");
const {
  addBookingRealtimeClient,
  emitBookingRealtimeEvent,
} = require("../services/bookingRealtime.service");
const { verifyAuthToken } = require("../utils/jwt");

/** Bookings that do not block the calendar */
const STATUS_NON_BLOCKING = ["cancelled", "expired"];

/** Match `undoCancelBooking` — client shows countdown until this elapses after cancel. */
const UNDO_CANCEL_WINDOW_MS = 30_000;

/** Omit one active hold when merging (the caller’s own checkout hold). */
function holdsMapExcludingHoldId(holdsMap, excludeHoldId) {
  if (!excludeHoldId) return holdsMap;
  const ex = String(excludeHoldId);
  const out = new Map();
  for (const [sid, holds] of holdsMap.entries()) {
    const filtered = holds.filter((h) => String(h._id) !== ex);
    if (filtered.length) out.set(sid, filtered);
  }
  return out;
}

/** Local start time of the appointment (date + startTime). */
function bookingAppointmentStartDate(booking) {
  const raw = booking.date;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = String(booking.startTime || "00:00").split(":");
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) || 0;
  if (Number.isNaN(hh)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
}

/** Local end time of the appointment (start + duration). */
function bookingAppointmentEndDate(booking) {
  const start = bookingAppointmentStartDate(booking);
  if (!start) return null;
  const dur = Number(booking.duration) || 0;
  return new Date(start.getTime() + dur * 60 * 1000);
}

const GUEST_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Max services a single booking may combine. */
const MAX_SERVICES_PER_BOOKING = 8;

/**
 * Parse request input for one-or-many service selection.
 * Accepts:
 *   - serviceIds: array of ids
 *   - serviceIds: comma-separated string (from query)
 *   - serviceId: legacy single id
 * Returns a de-duplicated ordered list of valid ObjectId strings, or null if invalid.
 */
function parseServiceIdsInput({ serviceIds, serviceId }) {
  let list = [];
  if (Array.isArray(serviceIds)) {
    list = serviceIds;
  } else if (typeof serviceIds === "string" && serviceIds.trim()) {
    list = serviceIds.split(",");
  } else if (serviceId) {
    list = [serviceId];
  }
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (!mongoose.isValidObjectId(s)) return null;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function pendingHoldMinutes() {
  const n = Number(process.env.BOOKING_PENDING_HOLD_MINUTES || 5);
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : 5;
}

async function loadClosingsOverlappingDay(businessId, ymd) {
  const { dayStart, dayEnd } = utcDayBounds(ymd);
  if (!mongoose.isValidObjectId(businessId)) return [];
  return ClosingDay.find({
    business: businessId,
    endsAt: { $gt: dayStart },
    startsAt: { $lt: dayEnd },
  }).lean();
}

async function loadBookingsMapForDay(businessId, staffIds, ymd) {
  const { dayStart, dayEnd } = utcDayBounds(ymd);
  if (!staffIds.length) return new Map();
  const rows = await Booking.find({
    business: businessId,
    staff: { $in: staffIds },
    date: { $gte: dayStart, $lt: dayEnd },
    status: { $nin: STATUS_NON_BLOCKING },
  }).lean();
  const map = new Map();
  for (const b of rows) {
    const sid = String(b.staff);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(b);
  }
  return map;
}

/**
 * Max span for GET /availability-summary (inclusive day count).
 * Must cover tenant “book ahead” windows (bookingRules.maxAdvanceDays, cap ~1825d).
 */
const SUMMARY_MAX_DAYS = 2000;

function ymdFromUtcDateValue(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth() + 1,
    d: x.getUTCDate(),
  };
}

function ymdIsoFromBookedDate(d) {
  const ymd = ymdFromUtcDateValue(d);
  return ymd ? ymdPartsToIso(ymd) : null;
}

function ymdCompare(a, b) {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

function addOneDayYmd(ymd) {
  const { dayStart } = utcDayBounds(ymd);
  const next = new Date(dayStart.getTime() + 86400000);
  return {
    y: next.getUTCFullYear(),
    m: next.getUTCMonth() + 1,
    d: next.getUTCDate(),
  };
}

function partitionRowsByYmd(rows) {
  /** @type {Map<string, Map<string, unknown[]>>} */
  const out = new Map();
  for (const row of rows) {
    const ymdIso = ymdIsoFromBookedDate(row.date);
    if (!ymdIso) continue;
    const sid = String(row.staff);
    if (!out.has(ymdIso)) out.set(ymdIso, new Map());
    const inner = out.get(ymdIso);
    if (!inner.has(sid)) inner.set(sid, []);
    inner.get(sid).push(row);
  }
  return out;
}

function bookingsByStaffForDay(partitioned, ymdIso, staffIdStrs) {
  const dayMap = partitioned.get(ymdIso) || new Map();
  const m = new Map();
  for (const sid of staffIdStrs) {
    const s = String(sid);
    const list = dayMap.get(s);
    m.set(s, list ? [...list] : []);
  }
  return m;
}

function closingsOverlappingYmd(allClosings, ymd) {
  const { dayStart, dayEnd } = utcDayBounds(ymd);
  const ds = dayStart.getTime();
  const de = dayEnd.getTime();
  return allClosings.filter((c) => {
    const a = new Date(c.startsAt).getTime();
    const b = new Date(c.endsAt).getTime();
    return b > ds && a < de;
  });
}

async function loadClosingsOverlappingRange(
  businessId,
  rangeStart,
  rangeEndExclusive,
) {
  if (!mongoose.isValidObjectId(businessId)) return [];
  return ClosingDay.find({
    business: businessId,
    endsAt: { $gt: rangeStart },
    startsAt: { $lt: rangeEndExclusive },
  }).lean();
}

function summaryHeatLevel(total, available) {
  if (total <= 0) return 0;
  const r = available / total;
  if (r <= 0) return 1;
  if (r < 0.28) return 2;
  if (r < 0.58) return 3;
  return 4;
}

/**
 * Match getAvailability slot rules; used for calendar heatmap (counts only).
 */
function countSlotsForDay({
  business,
  ymd,
  duration,
  eligibleStaff,
  isAny,
  bookingsByStaff,
  holdsMap,
  closings,
  clientTodayYmdStr,
  clientNowMinutes,
}) {
  const grid = getGridWindowForDay(business, ymd);
  if (grid.businessClosed || eligibleStaff.length === 0) {
    return { total: 0, available: 0, closed: true };
  }

  const bookingsWithHolds = mergeHoldsIntoBookingsMap(
    bookingsByStaff,
    holdsMap,
  );

  const roundStep = getTimeOfferStepMinutes(business);
  const bufferM = getBookingBufferMinutes(business);
  const candidateStarts = collectDynamicOfferStarts({
    business,
    ymd,
    durationMin: duration,
    eligibleStaff,
    bookingsByStaff: bookingsWithHolds,
    roundStep,
    bufferM,
  });
  if (candidateStarts.length === 0) {
    return { total: 0, available: 0, closed: true };
  }

  const ymdIso = ymdPartsToIso(ymd) || "";
  const usePastCutoff =
    clientTodayYmdStr &&
    clientNowMinutes != null &&
    ymdIso === clientTodayYmdStr;

  let total = 0;
  let available = 0;

  for (const slotStartMin of candidateStarts) {
    const pastBlocked = usePastCutoff && slotStartMin <= clientNowMinutes;

    if (slotOverlapsClosing(ymd, slotStartMin, duration, closings)) {
      total += 1;
      continue;
    }

    let slotAvail = false;
    if (isAny) {
      for (const s of eligibleStaff) {
        const sid = String(s._id);
        const listH = bookingsWithHolds.get(sid) || [];
        if (
          slotWorksForStaff(s, business, ymd, slotStartMin, duration, listH)
        ) {
          slotAvail = true;
          break;
        }
      }
    } else {
      const s = eligibleStaff[0];
      const sid = String(s._id);
      const listH = bookingsWithHolds.get(sid) || [];
      slotAvail = slotWorksForStaff(
        s,
        business,
        ymd,
        slotStartMin,
        duration,
        listH,
      );
    }

    total += 1;
    if (slotAvail && !pastBlocked) available += 1;
  }

  return { total, available, closed: false };
}

function formatBookingDateLabel(dayDate) {
  const d = new Date(dayDate);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function emitRealtimeBookingEvent(type, bookingDoc) {
  if (!bookingDoc) return;
  emitBookingRealtimeEvent({
    type,
    bookingId: String(bookingDoc._id || bookingDoc.id || ""),
    businessId: String(bookingDoc.business || ""),
    customerId: String(bookingDoc.customer || ""),
    status: bookingDoc.status || "",
  });
}

async function notifyBookingConfirmedById(bookingId) {
  const populated = await Booking.findById(bookingId)
    .populate(
      "business",
      "name address phone email owner currency tenantNotificationPrefs",
    )
    .populate("service", "name")
    .populate("staff", "name")
    .populate("customer", "name email phone");
  if (!populated || populated.status !== "confirmed") return;
  const cust = populated.customer;
  const biz = populated.business;
  if (!cust?.email) return;
  const dateLabel = formatBookingDateLabel(populated.date);

  const servicesArr =
    Array.isArray(populated.services) && populated.services.length > 0
      ? populated.services
          .slice()
          .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
          .map((s) => ({
            name: s.name || "",
            duration: Number(s.duration) || 0,
            price: Number(s.price) || 0,
          }))
      : [
          {
            name: populated.service?.name || "",
            duration: Number(populated.duration) || 0,
            price: Number(populated.price) || 0,
          },
        ];

  const currency = normalizeCurrency(populated.currency || biz?.currency);

  const payload = {
    customerName: cust.name || "Customer",
    currency,
    business: {
      name: biz?.name,
      address: biz?.address,
      phone: biz?.phone,
      email: biz?.email,
    },
    service: { name: populated.service?.name },
    services: servicesArr,
    totalPrice: Number(populated.price) || 0,
    totalDuration: Number(populated.duration) || 0,
    staff: { name: populated.staff?.name },
    dateLabel,
    startTime: populated.startTime,
    endTime: populated.endTime,
    notes: populated.notes || "",
    bookingId: populated._id.toString(),
  };
  await sendBookingConfirmedCustomerEmail({ to: cust.email, ...payload });
  const bizTo = await resolveBusinessNotifyEmail(biz);
  if (bizTo && isTenantNotificationEnabled(biz, "newBooking")) {
    await sendBookingConfirmedBusinessEmail({
      to: bizTo,
      businessName: biz?.name || "",
      customer: { name: cust.name, email: cust.email, phone: cust.phone },
      service: payload.service,
      services: servicesArr,
      totalPrice: payload.totalPrice,
      totalDuration: payload.totalDuration,
      staff: payload.staff,
      dateLabel,
      startTime: populated.startTime,
      endTime: populated.endTime,
      notes: populated.notes || "",
      bookingId: populated._id.toString(),
      currency: payload.currency,
    });
  }
}

/**
 * GET /api/bookings/availability?businessId=&serviceId=|serviceIds=&date=YYYY-MM-DD&staffId=|any
 * Public — used by booking modal.
 * Multi-service: pass `serviceIds` as a comma-separated list. Availability is
 * computed against the sum of service durations.
 */
async function getAvailability(req, res) {
  const {
    businessId,
    serviceId,
    serviceIds,
    date: dateStr,
    staffId: staffIdIn,
    excludeBookingId,
    excludeSlotHoldId,
    holderKey: holderKeyAvail,
  } = req.query;

  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const idList = parseServiceIdsInput({ serviceIds, serviceId });
  if (!idList || idList.length === 0) {
    return res.status(400).json({ message: "Invalid service id" });
  }
  if (idList.length > MAX_SERVICES_PER_BOOKING) {
    return res.status(400).json({
      message: `Too many services selected (max ${MAX_SERVICES_PER_BOOKING}).`,
    });
  }
  const ymd = parseYmdParts(dateStr);
  if (!ymd) {
    return res.status(400).json({ message: "Invalid date (use YYYY-MM-DD)" });
  }
  const rawStaff = staffIdIn == null ? "" : String(staffIdIn).trim();
  if (!rawStaff || rawStaff === "null" || rawStaff === "undefined") {
    return res.status(400).json({ message: 'staffId is required (or "any")' });
  }

  const slotResult = await loadDynamicPublicSlotsForModal({
    businessId,
    idList,
    ymd,
    rawStaff,
    excludeBookingId,
    excludeSlotHoldId,
    holderKeyAvail,
  });
  if (!slotResult.ok) {
    return res.status(slotResult.status).json({ message: slotResult.message });
  }
  return res.json(slotResult.data);
}

/**
 * GET /api/bookings/availability-summary
 * Public — per-day free vs total slot counts for booking calendar heatmap.
 * Query: businessId, serviceId|serviceIds, staffId|any, from, to (YYYY-MM-DD),
 * optional clientTodayYmd + clientNowMinutes (0–1439) to grey out past times on “today”.
 */
async function getAvailabilitySummary(req, res) {
  const {
    businessId,
    serviceId,
    serviceIds,
    from: fromStr,
    to: toStr,
    staffId: staffIdIn,
    clientTodayYmd: clientTodayRaw,
    clientNowMinutes: clientNowRaw,
  } = req.query;

  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const idList = parseServiceIdsInput({ serviceIds, serviceId });
  if (!idList || idList.length === 0) {
    return res.status(400).json({ message: "Invalid service id" });
  }
  if (idList.length > MAX_SERVICES_PER_BOOKING) {
    return res.status(400).json({
      message: `Too many services selected (max ${MAX_SERVICES_PER_BOOKING}).`,
    });
  }
  const fromYmd = parseYmdParts(fromStr);
  const toYmd = parseYmdParts(toStr);
  if (!fromYmd || !toYmd || ymdCompare(fromYmd, toYmd) > 0) {
    return res.status(400).json({
      message: "Invalid range (from, to as YYYY-MM-DD, from ≤ to)",
    });
  }

  let span = 0;
  for (let c = fromYmd; ymdCompare(c, toYmd) <= 0; c = addOneDayYmd(c)) {
    span += 1;
    if (span > SUMMARY_MAX_DAYS) {
      return res.status(400).json({
        message: `Date range too large (max ${SUMMARY_MAX_DAYS} days)`,
      });
    }
  }

  const rawStaff = staffIdIn == null ? "" : String(staffIdIn).trim();
  if (!rawStaff || rawStaff === "null" || rawStaff === "undefined") {
    return res.status(400).json({ message: 'staffId is required (or "any")' });
  }

  let clientTodayYmdStr = "";
  if (clientTodayRaw != null && String(clientTodayRaw).trim()) {
    const p = parseYmdParts(clientTodayRaw);
    clientTodayYmdStr = p ? ymdPartsToIso(p) || "" : "";
  }
  let clientNowMinutes = null;
  if (clientNowRaw != null && String(clientNowRaw).trim() !== "") {
    const n = Number(clientNowRaw);
    if (!Number.isFinite(n) || n < 0 || n > 1439) {
      return res
        .status(400)
        .json({ message: "clientNowMinutes must be 0–1439" });
    }
    clientNowMinutes = Math.floor(n);
  }

  const business = await Business.findById(businessId).lean();
  if (!business || !business.isActive) {
    return res.status(404).json({ message: "Business not found" });
  }

  const serviceDocs = await Service.find({
    _id: { $in: idList },
    business: businessId,
    isActive: true,
  }).lean();
  if (serviceDocs.length !== idList.length) {
    return res.status(404).json({ message: "One or more services not found" });
  }
  const orderedServices = idList.map((id) =>
    serviceDocs.find((s) => String(s._id) === id),
  );

  const duration = orderedServices.reduce(
    (sum, s) => sum + (Number(s.duration) || 0),
    0,
  );
  if (duration <= 0) {
    return res.status(400).json({ message: "Invalid total service duration" });
  }

  const isAny = rawStaff.toLowerCase() === "any";

  const offersAll = (staff) =>
    orderedServices.every((svc) => staffOffersService(staff, svc._id));

  let eligibleStaff = [];
  if (isAny) {
    const rows = await Staff.find({
      business: businessId,
      isActive: true,
      services: { $all: idList },
    }).lean();
    eligibleStaff = rows.filter(offersAll);
  } else {
    if (!mongoose.isValidObjectId(rawStaff)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }
    const staff = await Staff.findOne({
      _id: rawStaff,
      business: businessId,
      isActive: true,
    }).lean();
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }
    if (!offersAll(staff)) {
      return res.status(400).json({
        message:
          idList.length > 1
            ? "This staff member does not offer all selected services"
            : "This staff member does not offer this service",
      });
    }
    eligibleStaff = [staff];
  }

  const staffIds = eligibleStaff.map((s) => s._id);
  const staffIdStrs = staffIds.map((id) => String(id));

  const rangeStart = utcDayBounds(fromYmd).dayStart;
  const rangeEndExclusive = utcDayBounds(addOneDayYmd(toYmd)).dayStart;

  const [bookingRows, holdRows, closingsAll] = await Promise.all([
    staffIds.length === 0
      ? Promise.resolve([])
      : Booking.find({
          business: businessId,
          staff: { $in: staffIds },
          date: { $gte: rangeStart, $lt: rangeEndExclusive },
          status: { $nin: STATUS_NON_BLOCKING },
        }).lean(),
    staffIds.length === 0
      ? Promise.resolve([])
      : SlotHold.find({
          business: businessId,
          staff: { $in: staffIds },
          date: { $gte: rangeStart, $lt: rangeEndExclusive },
          expiresAt: { $gt: new Date() },
        }).lean(),
    loadClosingsOverlappingRange(businessId, rangeStart, rangeEndExclusive),
  ]);

  const bookingsPartition = partitionRowsByYmd(bookingRows);
  const holdsPartition = partitionRowsByYmd(holdRows);

  const days = [];
  for (
    let cur = fromYmd;
    ymdCompare(cur, toYmd) <= 0;
    cur = addOneDayYmd(cur)
  ) {
    const ymdIso = ymdPartsToIso(cur) || "";
    const bookingsByStaff = bookingsByStaffForDay(
      bookingsPartition,
      ymdIso,
      staffIdStrs,
    );
    const holdsMap = holdsPartition.get(ymdIso) || new Map();
    const closings = closingsOverlappingYmd(closingsAll, cur);
    const { total, available, closed } = countSlotsForDay({
      business,
      ymd: cur,
      duration,
      eligibleStaff,
      isAny,
      bookingsByStaff,
      holdsMap,
      closings,
      clientTodayYmdStr,
      clientNowMinutes,
    });
    const level = closed ? 0 : summaryHeatLevel(total, available);
    days.push({
      date: ymdIso,
      total,
      available,
      closed,
      level,
    });
  }

  return res.json({
    days,
    slotStepMinutes: getTimeOfferStepMinutes(business),
    duration,
    schedulingMode: "dynamic",
  });
}

/**
 * POST /api/bookings — authenticated customer (conflict-safe; may return alternative hold)
 * Accepts either a single `serviceId` or a `serviceIds` array for multi-service bookings.
 */
async function createBooking(req, res) {
  const {
    businessId,
    serviceId,
    serviceIds,
    staffId: staffIdIn,
    date: dateStr,
    startTime,
    notes,
    guestName,
    guestEmail,
  } = req.body || {};

  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const idList = parseServiceIdsInput({ serviceIds, serviceId });
  if (!idList || idList.length === 0) {
    return res.status(400).json({ message: "Invalid service id" });
  }
  if (idList.length > MAX_SERVICES_PER_BOOKING) {
    return res.status(400).json({
      message: `Too many services selected (max ${MAX_SERVICES_PER_BOOKING}).`,
    });
  }
  const ymd = parseYmdParts(dateStr);
  if (!ymd) {
    return res.status(400).json({ message: "Invalid date (use YYYY-MM-DD)" });
  }
  const startT = String(startTime || "").trim();
  if (!startT) {
    return res.status(400).json({ message: "startTime is required" });
  }
  const startM = parseTimeToMinutes(startT);
  if (startM == null) {
    return res.status(400).json({ message: "Invalid startTime" });
  }

  let customerId = req.userId;
  let guestPlainPassword = null;
  let guestUserIdForRollback = null;
  let bookingCreated = false;
  let slotHoldIdToRelease = null;

  if (!customerId) {
    const gn = String(guestName || "").trim();
    const ge = String(guestEmail || "")
      .trim()
      .toLowerCase();
    if (!gn || !ge) {
      return res.status(400).json({
        message:
          "Sign in to book, or enter your full name and email to continue as a guest.",
      });
    }
    if (gn.length < 2) {
      return res.status(400).json({ message: "Please enter your full name." });
    }
    if (!GUEST_EMAIL_REGEX.test(ge)) {
      return res
        .status(400)
        .json({ message: "Please enter a valid email address." });
    }
  }

  try {
    const business = await Business.findById(businessId);
    if (!business || !business.isActive) {
      return res.status(404).json({ message: "Business not found" });
    }

    const serviceDocs = await Service.find({
      _id: { $in: idList },
      business: businessId,
      isActive: true,
    }).lean();
    if (serviceDocs.length !== idList.length) {
      return res
        .status(404)
        .json({ message: "One or more services not found" });
    }
    const orderedServices = idList.map((id) =>
      serviceDocs.find((s) => String(s._id) === id),
    );
    /** Primary service keeps the legacy `service` field populated. */
    const service = orderedServices[0];

    if (!req.userId) {
      const gn = String(guestName || "").trim();
      const ge = String(guestEmail || "")
        .trim()
        .toLowerCase();
      const existing = await User.findOne({ email: ge });
      if (existing) {
        return res.status(409).json({
          message:
            "An account already exists with this email. Please sign in to book.",
          code: "EMAIL_EXISTS",
        });
      }
      const pendingSignup = await PendingRegistration.findOne({ email: ge });
      if (pendingSignup) {
        return res.status(409).json({
          message:
            "This email has a signup in progress. Verify your email from the registration link or sign in.",
          code: "PENDING_SIGNUP",
        });
      }
      guestPlainPassword = crypto.randomBytes(12).toString("base64url");
      try {
        const guestUser = await User.create({
          name: gn.slice(0, 120),
          email: ge,
          password: guestPlainPassword,
          role: "customer",
          isEmailVerified: true,
        });
        customerId = guestUser._id;
        guestUserIdForRollback = guestUser._id;
      } catch (e) {
        if (e.code === 11000) {
          return res.status(409).json({
            message:
              "An account already exists with this email. Please sign in to book.",
            code: "EMAIL_EXISTS",
          });
        }
        throw e;
      }
    }

    if (!customerId) {
      return res.status(400).json({ message: "Unable to identify customer." });
    }

    const bookingDateIsoForCoupon = ymdPartsToIso(ymd);

    /** Per-service effective base price on the booking day (honours time-limited sales). */
    const perServiceBase = orderedServices.map((s) => ({
      service: s,
      basePrice: getEffectivePrice(s, bookingDateIsoForCoupon),
      duration: Number(s.duration) || 0,
    }));
    const totalBasePrice =
      Math.round(
        perServiceBase.reduce((sum, r) => sum + r.basePrice, 0) * 100,
      ) / 100;

    let couponCtx = null;
    if (req.body?.couponCode != null && String(req.body.couponCode).trim()) {
      const v = await validateCouponForBooking({
        businessId,
        couponCodeRaw: req.body.couponCode,
        service,
        bookingDateIso: bookingDateIsoForCoupon,
        customerId,
        checkCustomerUsage: true,
        basePriceOverride: totalBasePrice,
      });
      if (v.error) {
        return res.status(400).json({ message: v.error });
      }
      couponCtx = v;
    }

    const respond = async (status, body) => {
      if (guestPlainPassword && customerId && bookingCreated) {
        const u = await User.findById(customerId);
        if (u) {
          body.guestAccountCreated = true;
          body.token = signAuthToken({
            sub: u._id.toString(),
            email: u.email,
            role: u.role,
          });
          body.user = toPublicUser(u);
          void sendGuestBookingCredentialsEmail(
            u.email,
            u.name,
            guestPlainPassword,
          ).catch((err) =>
            console.error("[guest-credentials-email]", err.message),
          );
        }
      }
      return res.status(status).json(body);
    };

    const duration = perServiceBase.reduce((sum, r) => sum + r.duration, 0);
    if (duration <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid total service duration" });
    }
    const isAny = String(staffIdIn || "").toLowerCase() === "any";

    const offersAll = (staff) =>
      orderedServices.every((svc) => staffOffersService(staff, svc._id));

    let eligibleStaff = [];
    if (isAny) {
      const candidates = await Staff.find({
        business: businessId,
        isActive: true,
        services: { $all: idList },
      }).lean();
      eligibleStaff = candidates.filter(offersAll);
      if (eligibleStaff.length === 0) {
        return res.status(400).json({
          message:
            idList.length > 1
              ? "No staff member offers all selected services."
              : "No staff available for this service.",
        });
      }
      if (eligibleStaff.length > 1) {
        eligibleStaff = await sortEligibleStaffForAny(
          eligibleStaff,
          businessId,
          business,
          ymd,
        );
      }
    } else {
      if (!mongoose.isValidObjectId(staffIdIn)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      const staff = await Staff.findOne({
        _id: staffIdIn,
        business: businessId,
        isActive: true,
      }).lean();
      if (!staff) {
        return res.status(404).json({ message: "Staff not found" });
      }
      if (!offersAll(staff)) {
        return res.status(400).json({
          message:
            idList.length > 1
              ? "This staff member does not offer all selected services"
              : "This staff member does not offer this service",
        });
      }
      eligibleStaff = [staff];
    }

    const slotHoldIdRaw = req.body?.slotHoldId;
    const holderKeyBooking = String(req.body?.holderKey || "").trim();
    if (slotHoldIdRaw != null && String(slotHoldIdRaw).trim()) {
      if (holderKeyBooking.length < 12) {
        return res.status(400).json({
          message: "holderKey is required when slotHoldId is sent.",
        });
      }
      if (!mongoose.isValidObjectId(slotHoldIdRaw)) {
        return res.status(400).json({ message: "Invalid slot hold id" });
      }
      const nowHold = new Date();
      const holdDoc = await SlotHold.findOne({
        _id: slotHoldIdRaw,
        business: businessId,
        expiresAt: { $gt: nowHold },
      }).lean();
      if (!holdDoc) {
        return res.status(400).json({
          message: "Slot hold is missing or expired. Please pick a time again.",
        });
      }
      if (holdDoc.holderKey !== holderKeyBooking) {
        return res.status(400).json({ message: "Invalid slot hold key." });
      }
      const { dayStart } = utcDayBounds(ymd);
      const holdDay =
        holdDoc.date instanceof Date ? holdDoc.date : new Date(holdDoc.date);
      if (holdDay.getTime() !== dayStart.getTime()) {
        return res
          .status(400)
          .json({ message: "Slot hold does not match this date." });
      }
      if (String(holdDoc.startTime || "").trim() !== startT) {
        return res
          .status(400)
          .json({ message: "Slot hold does not match this time." });
      }
      if (Number(holdDoc.duration) !== duration) {
        return res.status(400).json({
          message: "Slot hold does not match selected services.",
        });
      }
      const holdStaffId = String(holdDoc.staff);
      const holdStaffInEligible = eligibleStaff.some(
        (s) => String(s._id) === holdStaffId,
      );
      if (!holdStaffInEligible) {
        return res.status(400).json({
          message: "Slot hold staff is not valid for this booking.",
        });
      }
      if (!isAny && String(staffIdIn) !== holdStaffId) {
        return res.status(400).json({
          message: "Slot hold does not match selected staff.",
        });
      }
      eligibleStaff = eligibleStaff.filter(
        (s) => String(s._id) === holdStaffId,
      );
      slotHoldIdToRelease = holdDoc._id;
    }

    const staffIds = eligibleStaff.map((s) => s._id);
    let bookingsByStaff = await loadBookingsMapForDay(
      businessId,
      staffIds,
      ymd,
    );
    const holdsMapRaw = await loadHoldsMapForDay(businessId, staffIds, ymd);
    const holdsForMerge = slotHoldIdToRelease
      ? holdsMapExcludingHoldId(holdsMapRaw, slotHoldIdToRelease)
      : holdsMapRaw;
    let bookingsWithHolds = mergeHoldsIntoBookingsMap(
      bookingsByStaff,
      holdsForMerge,
    );
    const closings = await loadClosingsOverlappingDay(businessId, ymd);

    const dayDate = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));

    let chosenStaff = null;
    if (isAny) {
      for (const s of eligibleStaff) {
        const list = bookingsWithHolds.get(String(s._id)) || [];
        if (
          slotWorksForStaff(s, business, ymd, startM, duration, list) &&
          !slotOverlapsClosing(ymd, startM, duration, closings)
        ) {
          chosenStaff = s;
          break;
        }
      }
    } else {
      const s = eligibleStaff[0];
      const list = bookingsWithHolds.get(String(s._id)) || [];
      if (
        slotWorksForStaff(s, business, ymd, startM, duration, list) &&
        !slotOverlapsClosing(ymd, startM, duration, closings)
      ) {
        chosenStaff = s;
      }
    }

    const autoConfirm = business.bookingRules?.autoConfirm !== false;
    const finalStatusIfDirect = autoConfirm ? "confirmed" : "pending";

    const makeExpiresAt = () =>
      new Date(Date.now() + pendingHoldMinutes() * 60 * 1000);

    const tryInsert = async (staffObj, slotStartM, status, extra = {}) => {
      const st = minutesToTime(slotStartM);
      const en = minutesToTime(slotStartM + duration);
      const basePrice = totalBasePrice;
      const finalPrice = couponCtx ? couponCtx.finalPrice : basePrice;
      const couponId = couponCtx?.coupon?._id || null;
      const servicesSnapshot = perServiceBase.map((r, i) => ({
        service: r.service._id,
        name: r.service.name || "",
        duration: r.duration,
        price: r.basePrice,
        originalPrice: couponId ? r.basePrice : null,
        order: i,
      }));
      const doc = await Booking.create({
        business: businessId,
        service: service._id,
        services: servicesSnapshot,
        staff: staffObj._id,
        customer: customerId,
        date: dayDate,
        startTime: st,
        endTime: en,
        duration,
        currency: normalizeCurrency(business.currency),
        price: finalPrice,
        originalPrice: couponId ? basePrice : undefined,
        coupon: couponId || undefined,
        couponDiscountPercent: couponId ? couponCtx.discountPercent : undefined,
        status,
        notes: String(notes ?? "")
          .trim()
          .slice(0, 2000),
        ...extra,
      });
      if (couponId) {
        await incrementCouponUsedCount(couponId);
      }
      bookingCreated = true;
      emitRealtimeBookingEvent("booking.created", doc);
      void emitBookingWebhookEvent("booking.created", doc._id).catch((err) =>
        console.error("[webhook booking.created]", err.message),
      );
      const wlTok = String(req.body?.waitlistOfferToken || "").trim();
      if (wlTok) {
        void User.findById(customerId)
          .select("email")
          .lean()
          .then((u) =>
            fulfillWaitlistIfTokenMatches({
              token: wlTok,
              booking: doc,
              customerEmail: u?.email,
            }),
          )
          .catch(() => {});
      }
      return doc;
    };

    if (chosenStaff) {
      try {
        const doc = await tryInsert(chosenStaff, startM, finalStatusIfDirect);
        if (doc.status === "confirmed") {
          await notifyBookingConfirmedById(doc._id);
        }
        return await respond(201, {
          outcome: "confirmed",
          booking: doc.toJSON(),
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        bookingsByStaff = await loadBookingsMapForDay(
          businessId,
          staffIds,
          ymd,
        );
        const holdsRetry = await loadHoldsMapForDay(businessId, staffIds, ymd);
        const holdsRetryMerge = slotHoldIdToRelease
          ? holdsMapExcludingHoldId(holdsRetry, slotHoldIdToRelease)
          : holdsRetry;
        bookingsWithHolds = mergeHoldsIntoBookingsMap(
          bookingsByStaff,
          holdsRetryMerge,
        );
        const alt = findNearestAlternativeSlot({
          business,
          ymd,
          duration,
          requestedStartM: startM,
          eligibleStaff,
          bookingsByStaff: bookingsWithHolds,
          isAny,
          closings,
        });
        if (!alt) {
          return await respond(200, {
            outcome: "no_alternative",
            message:
              "That time was just taken and no nearby slot is available. Please pick another time.",
          });
        }
        try {
          const doc = await tryInsert(
            alt.staff,
            alt.startM,
            "pending_confirmation",
            {
              confirmationExpiresAt: makeExpiresAt(),
              requestedStartTime: startT,
            },
          );
          return await respond(201, {
            outcome: "alternative_suggested",
            booking: doc.toJSON(),
            requestedSlot: { startTime: startT },
            suggestedSlot: {
              startTime: alt.startTime,
              staffId: String(alt.staff._id),
              staffName: alt.staff.name,
            },
            expiresAt: doc.confirmationExpiresAt
              ? doc.confirmationExpiresAt.toISOString()
              : null,
            holdMinutes: pendingHoldMinutes(),
            message:
              "That time was just booked. We held the nearest available slot for you — confirm within a few minutes.",
          });
        } catch (err2) {
          if (err2.code === 11000) {
            return await respond(200, {
              outcome: "no_alternative",
              message: "That slot was just taken. Please choose another time.",
            });
          }
          throw err2;
        }
      }
    }

    const alt = findNearestAlternativeSlot({
      business,
      ymd,
      duration,
      requestedStartM: startM,
      eligibleStaff,
      bookingsByStaff: bookingsWithHolds,
      isAny,
      closings,
    });
    if (!alt) {
      return await respond(200, {
        outcome: "no_alternative",
        message:
          "No staff is available at this time. Please choose another slot.",
      });
    }
    try {
      const doc = await tryInsert(
        alt.staff,
        alt.startM,
        "pending_confirmation",
        {
          confirmationExpiresAt: makeExpiresAt(),
          requestedStartTime: startT,
        },
      );
      return await respond(201, {
        outcome: "alternative_suggested",
        booking: doc.toJSON(),
        requestedSlot: { startTime: startT },
        suggestedSlot: {
          startTime: alt.startTime,
          staffId: String(alt.staff._id),
          staffName: alt.staff.name,
        },
        expiresAt: doc.confirmationExpiresAt
          ? doc.confirmationExpiresAt.toISOString()
          : null,
        holdMinutes: pendingHoldMinutes(),
        message:
          "That time is no longer available. We held the nearest slot for you — confirm within a few minutes.",
      });
    } catch (err) {
      if (err.code === 11000) {
        return await respond(200, {
          outcome: "no_alternative",
          message: "That slot was just taken. Please choose another time.",
        });
      }
      throw err;
    }
  } finally {
    if (slotHoldIdToRelease) {
      await SlotHold.deleteOne({ _id: slotHoldIdToRelease }).catch(() => {});
    }
    if (guestUserIdForRollback && !bookingCreated) {
      await User.deleteOne({ _id: guestUserIdForRollback }).catch(() => {});
    }
  }
}

/** GET /api/bookings/stream?token=...&workspaceId=... — SSE real-time booking events */
async function streamBookings(req, res) {
  const token = String(req.query?.token || "").trim();
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }
  let decoded;
  try {
    decoded = verifyAuthToken(token);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  const user = await User.findById(decoded.sub).select("_id role isEmailVerified");
  if (!user || !user.isEmailVerified) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  res.write(`data: ${JSON.stringify({ type: "stream.ready" })}\n\n`);

  const removeClient = addBookingRealtimeClient({
    res,
    user,
    workspaceId: req.query?.workspaceId,
  });

  req.on("close", () => {
    removeClient();
    try {
      res.end();
    } catch {
      // noop
    }
  });
}

/**
 * POST /api/bookings/:id/confirm-pending — confirm a pending_confirmation hold
 */
async function confirmPendingBooking(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id" });
  }

  const booking = await Booking.findOne({
    _id: id,
    customer: req.userId,
    status: "pending_confirmation",
    confirmationExpiresAt: { $gt: new Date() },
  });
  if (!booking) {
    return res.status(400).json({
      message:
        "This hold is invalid or has expired. Please choose a time again.",
    });
  }

  const business = await Business.findById(booking.business);
  if (!business || !business.isActive) {
    return res.status(404).json({ message: "Business not found" });
  }

  const autoConfirm = business.bookingRules?.autoConfirm !== false;
  booking.status = autoConfirm ? "confirmed" : "pending";
  booking.confirmationExpiresAt = null;
  await booking.save();
  emitRealtimeBookingEvent("booking.updated", booking);

  if (booking.status === "confirmed") {
    await notifyBookingConfirmedById(booking._id);
  }

  const populated = await Booking.findById(booking._id)
    .populate("business", "name logo slug address")
    .populate("service", "name")
    .populate("staff", "name avatar")
    .populate("customer", "name email phone")
    .populate("coupon", "code")
    .lean();

  return res.json({
    outcome: "confirmed",
    booking: mapBookingListItem(populated),
  });
}

/**
 * POST /api/bookings/:id/decline-pending — release a pending_confirmation hold
 */
async function declinePendingBooking(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id" });
  }

  const booking = await Booking.findOne({
    _id: id,
    customer: req.userId,
    status: "pending_confirmation",
  });
  if (!booking) {
    return res.status(404).json({ message: "Hold not found" });
  }

  if (booking.coupon) {
    await decrementCouponUsedCount(booking.coupon);
  }

  booking.status = "expired";
  booking.confirmationExpiresAt = null;
  booking.coupon = undefined;
  booking.originalPrice = undefined;
  booking.couponDiscountPercent = undefined;
  await booking.save();
  emitRealtimeBookingEvent("booking.updated", booking);

  return res.json({ ok: true, outcome: "declined" });
}

const STATUS_FILTER = [
  "pending",
  "pending_confirmation",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "expired",
];

/** Resolve populated ref or raw ObjectId to a string id (never "null" / invalid). */
function pickRefId(raw) {
  if (raw == null) return "";
  if (typeof raw === "object" && raw._id != null) {
    return String(raw._id);
  }
  if (mongoose.isValidObjectId(raw)) {
    return String(raw);
  }
  return "";
}

function mapBookingListItem(b) {
  const biz =
    b.business && typeof b.business === "object" && "name" in b.business
      ? b.business
      : null;
  const svc =
    b.service && typeof b.service === "object" && "name" in b.service
      ? b.service
      : null;
  const stf =
    b.staff && typeof b.staff === "object" && "name" in b.staff
      ? b.staff
      : null;
  const cust =
    b.customer && typeof b.customer === "object" && "name" in b.customer
      ? b.customer
      : null;
  const cpn =
    b.coupon && typeof b.coupon === "object" && b.coupon.code != null
      ? b.coupon
      : null;

  const servicesArr = Array.isArray(b.services) ? b.services : [];
  const servicesOut = servicesArr
    .slice()
    .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
    .map((s) => ({
      id: pickRefId(s.service),
      name: s.name || "",
      duration: Number(s.duration) || 0,
      price: Number(s.price) || 0,
      originalPrice:
        typeof s.originalPrice === "number" ? s.originalPrice : null,
    }));
  /** Multi-service summary shown in list rows when more than one service was booked. */
  const primaryName = svc?.name || servicesOut[0]?.name || "Service";
  const combinedName =
    servicesOut.length > 1
      ? servicesOut
          .map((s) => s.name)
          .filter(Boolean)
          .join(" + ")
      : primaryName;

  return {
    id: b._id.toString(),
    customerId: pickRefId(b.customer),
    businessId: pickRefId(b.business),
    businessName: biz?.name || "",
    businessLogo: biz?.logo || "",
    serviceId: pickRefId(b.service),
    serviceName: primaryName,
    services: servicesOut,
    servicesLabel: combinedName,
    staffId: pickRefId(b.staff),
    staffName: stf?.name || "Staff",
    staffAvatar: stf?.avatar || "",
    customerName: cust?.name || "Client",
    customerEmail: cust?.email || "",
    customerPhone: cust?.phone || "",
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    duration: b.duration,
    price: b.price,
    originalPrice:
      typeof b.originalPrice === "number" ? b.originalPrice : undefined,
    couponDiscountPercent:
      typeof b.couponDiscountPercent === "number"
        ? b.couponDiscountPercent
        : undefined,
    couponCode: cpn?.code ? String(cpn.code).trim() : undefined,
    status: b.status,
    notes: b.notes || "",
    createdAt: b.createdAt,
    requestedStartTime: b.requestedStartTime || "",
    currency: normalizeCurrency(b.currency),
    cancellationSource:
      b.cancellationSource != null && String(b.cancellationSource).trim() !== ""
        ? String(b.cancellationSource).trim()
        : undefined,
    undoCancelUntil:
      b.status === "cancelled" && b.cancelledAt && b.previousStatusBeforeCancel
        ? new Date(
            new Date(b.cancelledAt).getTime() + UNDO_CANCEL_WINDOW_MS,
          ).toISOString()
        : undefined,
  };
}

/**
 * GET /api/bookings/mine — bookings where the current user is the customer
 */
async function listMyBookings(req, res) {
  const { status: statusQ } = req.query;
  const filter = { customer: req.userId };
  if (statusQ && statusQ !== "all" && STATUS_FILTER.includes(statusQ)) {
    filter.status = statusQ;
  } else {
    filter.status = { $nin: ["expired"] };
  }

  const rows = await Booking.find(filter)
    .populate("business", "name logo slug")
    .populate("service", "name")
    .populate("staff", "name avatar")
    .populate("customer", "name email phone")
    .populate("coupon", "code")
    .sort({ date: 1, startTime: 1 })
    .lean();

  return res.json({ bookings: rows.map(mapBookingListItem) });
}

/**
 * GET /api/bookings/managed — tenant or staff: bookings for their workspace(s).
 */
async function listManagedBookings(req, res) {
  const { businessId: bid, status: statusQ } = req.query;
  const filter = {};
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({
      message: scope.error.message,
      ...(scope.error.code ? { code: scope.error.code } : {}),
    });
  }
  if (scope.businessIds.length === 0) {
    return res.json({ bookings: [] });
  }
  if (bid && mongoose.isValidObjectId(bid)) {
    const allowed = scope.businessIds.some(
      (id) => String(id) === String(bid),
    );
    if (!allowed) {
      return res
        .status(403)
        .json({ message: "Not allowed to view this business" });
    }
    filter.business = bid;
  } else {
    filter.business = { $in: scope.businessIds };
  }

  if (statusQ && statusQ !== "all" && STATUS_FILTER.includes(statusQ)) {
    filter.status = statusQ;
  }

  if (scope.staffId) {
    filter.staff = scope.staffId;
  }

  const rows = await Booking.find(filter)
    .populate("business", "name logo slug")
    .populate("service", "name")
    .populate("staff", "name avatar")
    .populate("customer", "name email phone")
    .populate("coupon", "code")
    .sort({ date: 1, startTime: 1 })
    .lean();

  return res.json({ bookings: rows.map(mapBookingListItem) });
}

/**
 * PATCH /api/bookings/:id/reschedule — new date/time (same service & staff).
 * Only the client who booked may reschedule (not the business tenant).
 * Body: { date: "YYYY-MM-DD", startTime: "HH:mm" }
 */
async function rescheduleBooking(req, res) {
  const { id } = req.params;
  const { date: dateStr, startTime: startTIn } = req.body || {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id" });
  }
  const ymd = parseYmdParts(dateStr);
  if (!ymd) {
    return res.status(400).json({ message: "Invalid date (use YYYY-MM-DD)" });
  }
  const startT = String(startTIn || "").trim();
  if (!startT) {
    return res.status(400).json({ message: "startTime is required" });
  }
  const startM = parseTimeToMinutes(startT);
  if (startM == null) {
    return res.status(400).json({ message: "Invalid startTime" });
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const business = await Business.findById(booking.business);
  if (!business || !business.isActive) {
    return res.status(404).json({ message: "Business not found" });
  }

  const isCustomer = booking.customer.toString() === req.userId.toString();
  if (!isCustomer) {
    return res.status(403).json({
      message: "Only the client who booked can reschedule this appointment",
    });
  }

  if (!["pending", "confirmed"].includes(booking.status)) {
    return res.status(400).json({
      message: "Only pending or confirmed bookings can be rescheduled",
    });
  }

  /**
   * Collect every service on this booking (supports multi-service).
   * Fall back to the legacy single-service field for bookings created
   * before the multi-service feature.
   */
  const bookedServiceIds =
    Array.isArray(booking.services) && booking.services.length > 0
      ? booking.services
          .slice()
          .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
          .map((s) => s.service)
      : [booking.service];

  const serviceDocs = await Service.find({
    _id: { $in: bookedServiceIds },
    business: booking.business,
    isActive: true,
  }).lean();
  if (serviceDocs.length !== bookedServiceIds.length) {
    return res
      .status(404)
      .json({
        message: "One or more services on this booking are no longer available",
      });
  }
  const orderedSvcs = bookedServiceIds.map((id) =>
    serviceDocs.find((s) => String(s._id) === String(id)),
  );
  const service = orderedSvcs[0];
  const duration = orderedSvcs.reduce(
    (sum, s) => sum + (Number(s.duration) || 0),
    0,
  );
  const endM = startM + duration;
  const endTime = minutesToTime(endM);

  const staff = await Staff.findOne({
    _id: booking.staff,
    business: booking.business,
    isActive: true,
  }).lean();
  if (
    !staff ||
    !orderedSvcs.every((svc) => staffOffersService(staff, svc._id))
  ) {
    return res.status(400).json({
      message:
        orderedSvcs.length > 1
          ? "Staff member is no longer available for one or more selected services"
          : "Staff member is no longer available for this service",
    });
  }

  const { dayStart, dayEnd } = utcDayBounds(ymd);
  const list = await Booking.find({
    staff: staff._id,
    date: { $gte: dayStart, $lt: dayEnd },
    status: { $nin: STATUS_NON_BLOCKING },
    _id: { $ne: booking._id },
  }).lean();

  const closings = await loadClosingsOverlappingDay(booking.business, ymd);
  if (slotOverlapsClosing(ymd, startM, duration, closings)) {
    return res.status(409).json({
      message:
        "The business is unavailable during this time. Please choose another slot.",
    });
  }

  if (!slotWorksForStaff(staff, business, ymd, startM, duration, list)) {
    return res.status(409).json({
      message: "This time slot is not available. Please choose another.",
    });
  }

  const slotUtcMs = Date.UTC(
    ymd.y,
    ymd.m - 1,
    ymd.d,
    Math.floor(startM / 60),
    startM % 60,
    0,
    0,
  );
  if (slotUtcMs < Date.now()) {
    return res
      .status(400)
      .json({ message: "Cannot reschedule to a time in the past" });
  }

  const dayDate = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  booking.date = dayDate;
  booking.startTime = startT;
  booking.endTime = endTime;
  booking.duration = duration;
  if (booking.coupon) {
    await decrementCouponUsedCount(booking.coupon);
  }
  booking.coupon = undefined;
  booking.originalPrice = undefined;
  booking.couponDiscountPercent = undefined;
  const newDayIso = ymdPartsToIso(ymd);
  const newPerService = orderedSvcs.map((s, i) => ({
    service: s._id,
    name: s.name || "",
    duration: Number(s.duration) || 0,
    price: getEffectivePrice(s, newDayIso),
    originalPrice: null,
    order: i,
  }));
  booking.price =
    Math.round(newPerService.reduce((sum, r) => sum + r.price, 0) * 100) / 100;
  if (Array.isArray(booking.services) && booking.services.length > 0) {
    booking.services = newPerService;
  }
  booking.requestedStartTime = "";
  await booking.save();
  emitRealtimeBookingEvent("booking.updated", booking);

  const populated = await Booking.findById(booking._id)
    .populate("business", "name logo slug")
    .populate("service", "name")
    .populate("staff", "name avatar")
    .populate("customer", "name email phone")
    .populate("coupon", "code")
    .lean();

  return res.json({ booking: mapBookingListItem(populated) });
}

/**
 * PATCH /api/bookings/:id — { "status": "cancelled" } (customer or manager),
 * or { "status": "completed" | "no_show" } (manager/admin only, after slot end).
 */
async function updateBooking(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id" });
  }

  const { status } = req.body || {};
  const allowed = ["cancelled", "completed", "no_show"];
  if (!allowed.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Use one of: ${allowed.join(", ")}`,
    });
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const business = await Business.findById(booking.business);
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }

  const isCustomer = booking.customer.toString() === req.userId.toString();
  const isManager = canManageBusiness(req.user, business);
  const admin = isAdminRole(req.user.role);

  if (status === "cancelled") {
    if (!isCustomer && !isManager && !admin) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (
      booking.status === "cancelled" ||
      booking.status === "completed" ||
      booking.status === "expired" ||
      booking.status === "no_show"
    ) {
      return res
        .status(400)
        .json({ message: "This booking cannot be cancelled" });
    }

    /**
     * Customers lose the ability to cancel the moment the appointment starts —
     * once the slot is in progress they should talk to the business directly,
     * otherwise no-shows become indistinguishable from silent cancellations.
     *
     * Tenants/admins can cancel up until the slot actually ends (e.g. client
     * walked out, power outage, etc.) — preserves existing tenant behaviour.
     */
    const now = new Date();
    const startAt = bookingAppointmentStartDate(booking);
    const endAt = bookingAppointmentEndDate(booking);

    if (isCustomer && !isManager && !admin) {
      if (startAt && startAt <= now) {
        return res.status(400).json({
          message:
            "The appointment has already started — please contact the business to cancel.",
        });
      }
    }

    if (endAt && endAt <= now) {
      return res.status(400).json({
        message: "This appointment has already ended; it cannot be cancelled",
      });
    }

    booking.previousStatusBeforeCancel = booking.status;
    booking.cancelledAt = new Date();
    booking.cancellationSource =
      isCustomer && !isManager && !admin ? "customer" : "staff";

    if (booking.coupon) {
      await decrementCouponUsedCount(booking.coupon);
    }

    booking.status = "cancelled";
    await booking.save();
    emitRealtimeBookingEvent("booking.updated", booking);
    void emitBookingWebhookEvent("booking.cancelled", booking._id, {
      cancellationSource: booking.cancellationSource || "",
    }).catch((err) =>
      console.error("[webhook booking.cancelled]", err.message),
    );
    void processWaitlistAfterCancellation(booking);

    const populated = await Booking.findById(booking._id)
      .populate(
        "business",
        "name logo slug email owner tenantNotificationPrefs",
      )
      .populate("service", "name")
      .populate("staff", "name avatar")
      .populate("customer", "name email phone")
      .populate("coupon", "code")
      .lean();

    try {
      const bizDoc = populated?.business;
      if (bizDoc && isTenantNotificationEnabled(bizDoc, "bookingCancelled")) {
        const bizTo = await resolveBusinessNotifyEmail(bizDoc);
        if (bizTo) {
          const dateLabel = formatBookingDateLabel(populated.date);
          const cancelledBy =
            isCustomer && !isManager && !admin ? "customer" : "business";
          await sendBookingCancelledBusinessEmail({
            to: bizTo,
            businessName: bizDoc.name || "",
            customer: populated.customer,
            dateLabel,
            startTime: populated.startTime,
            endTime: populated.endTime,
            bookingId: populated._id.toString(),
            serviceName: populated.service?.name || "",
            staffName: populated.staff?.name || "",
            cancelledBy,
          });
        }
      }
    } catch (err) {
      console.error("[booking] cancellation notify:", err.message);
    }

    return res.json({ booking: mapBookingListItem(populated) });
  }

  /* completed | no_show — business managers only */
  if (status === "completed" || status === "no_show") {
    if (!isManager && !admin) {
      return res.status(403).json({
        message: "Only the business can mark a booking as completed or no-show",
      });
    }
    if (booking.status !== "confirmed" && booking.status !== "expired") {
      return res.status(400).json({
        message:
          "Only confirmed appointments or expired time holds can be marked completed or no-show",
      });
    }
    const endAt = bookingAppointmentEndDate(booking);
    if (!endAt || endAt > new Date()) {
      return res.status(400).json({
        message:
          "You can only mark the outcome after the appointment time has ended",
      });
    }
    booking.status = status;
    await booking.save();
    emitRealtimeBookingEvent("booking.updated", booking);
    if (status === "completed") {
      void emitBookingWebhookEvent("booking.completed", booking._id).catch(
        (err) => console.error("[webhook booking.completed]", err.message),
      );
    }

    const populated = await Booking.findById(booking._id)
      .populate("business", "name logo slug")
      .populate("service", "name")
      .populate("staff", "name avatar")
      .populate("customer", "name email phone")
      .populate("coupon", "code")
      .lean();

    return res.json({ booking: mapBookingListItem(populated) });
  }

  return res.status(400).json({ message: "Invalid request" });
}

/**
 * POST /api/bookings/:id/undo-cancel — restore a just-cancelled booking (same actor, ≤30s).
 */
async function undoCancelBooking(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id" });
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (booking.status !== "cancelled") {
    return res
      .status(400)
      .json({ message: "Only a cancelled booking can be restored" });
  }
  if (!booking.cancelledAt || !booking.previousStatusBeforeCancel) {
    return res.status(400).json({
      message: "This cancellation cannot be undone",
    });
  }

  const elapsed = Date.now() - booking.cancelledAt.getTime();
  if (elapsed > UNDO_CANCEL_WINDOW_MS) {
    return res.status(400).json({
      message: "The 30-second undo window has expired",
    });
  }

  const allowedPrev = ["pending", "pending_confirmation", "confirmed"];
  if (!allowedPrev.includes(booking.previousStatusBeforeCancel)) {
    return res
      .status(400)
      .json({ message: "Cannot restore this booking state" });
  }

  const src = String(booking.cancellationSource || "").trim();
  if (src !== "customer" && src !== "staff") {
    return res
      .status(400)
      .json({ message: "This cancellation cannot be undone" });
  }

  const business = await Business.findById(booking.business);
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }

  const isCustomer = booking.customer.toString() === req.userId.toString();
  const isManager = canManageBusiness(req.user, business);
  const admin = isAdminRole(req.user.role);

  if (src === "customer") {
    if (!isCustomer) {
      return res.status(403).json({
        message: "Only the customer who cancelled can undo this",
      });
    }
  } else if (!isManager && !admin) {
    return res.status(403).json({
      message: "Only the business can undo this cancellation",
    });
  }

  const prev = booking.previousStatusBeforeCancel;
  const couponId = booking.coupon || null;
  booking.status = prev;
  booking.previousStatusBeforeCancel = null;
  booking.cancelledAt = null;
  booking.cancellationSource = null;

  try {
    await booking.save();
    emitRealtimeBookingEvent("booking.updated", booking);
  } catch (err) {
    const dup =
      err &&
      (err.code === 11000 ||
        err.code === "11000" ||
        /E11000 duplicate key/i.test(String(err.message || "")));
    if (dup) {
      return res.status(409).json({
        message:
          "That time slot was taken by another booking. Undo is no longer available.",
      });
    }
    throw err;
  }

  if (couponId) {
    await incrementCouponUsedCount(couponId);
  }

  const populated = await Booking.findById(booking._id)
    .populate("business", "name logo slug email owner tenantNotificationPrefs")
    .populate("service", "name")
    .populate("staff", "name avatar")
    .populate("customer", "name email phone")
    .populate("coupon", "code")
    .lean();

  return res.json({ booking: mapBookingListItem(populated) });
}

/**
 * GET /api/bookings/mine/service-suggestions?businessId=optional
 * Ranks services from completed visits by frequency, then recency.
 * With businessId: only suggestions for that business (e.g. booking page).
 */
async function listMyServiceSuggestions(req, res) {
  const rawBid = req.query.businessId;
  const customerId = req.userId;
  const filter = {
    customer: customerId,
    status: "completed",
  };
  if (rawBid && mongoose.isValidObjectId(String(rawBid))) {
    filter.business = rawBid;
  }

  const rows = await Booking.find(filter)
    .select("business service services date")
    .populate("business", "name slug")
    .sort({ date: -1 })
    .lean();

  const agg = new Map();

  for (const b of rows) {
    const bizDoc = b.business;
    const bizId =
      bizDoc && typeof bizDoc === "object" && bizDoc._id != null
        ? String(bizDoc._id)
        : String(b.business);
    const date = b.date instanceof Date ? b.date : new Date(b.date);
    if (Number.isNaN(date.getTime())) continue;

    const ids = [];
    if (Array.isArray(b.services) && b.services.length > 0) {
      for (const snap of b.services) {
        if (snap?.service) ids.push(String(snap.service));
      }
    } else if (b.service) {
      ids.push(String(b.service));
    }
    for (const sid of ids) {
      const key = `${bizId}:${sid}`;
      const prev = agg.get(key);
      if (!prev) {
        agg.set(key, {
          count: 1,
          lastDate: date,
          business: bizDoc,
        });
      } else {
        prev.count += 1;
        if (date > prev.lastDate) prev.lastDate = date;
      }
    }
  }

  const list = Array.from(agg.entries()).map(([key, v]) => {
    const [bizId, svcId] = key.split(":");
    const name =
      v.business && typeof v.business === "object" && v.business.name
        ? v.business.name
        : "";
    const slug =
      v.business && typeof v.business === "object" && v.business.slug
        ? v.business.slug
        : "";
    return {
      businessId: bizId,
      serviceId: svcId,
      bookCount: v.count,
      lastBookedAt: v.lastDate.toISOString(),
      businessName: name,
      businessSlug: slug,
    };
  });

  list.sort((a, b) => {
    if (b.bookCount !== a.bookCount) return b.bookCount - a.bookCount;
    return new Date(b.lastBookedAt) - new Date(a.lastBookedAt);
  });

  const candidates = list.slice(0, 48);
  const serviceIdList = [...new Set(candidates.map((c) => c.serviceId))];

  if (serviceIdList.length === 0) {
    return res.json({
      suggestions: [],
      basis: "Based on completed visits.",
    });
  }

  const oidList = serviceIdList.filter((id) => mongoose.isValidObjectId(id));
  const svcDocs = await Service.find({
    _id: { $in: oidList },
    isActive: true,
  })
    .select("name business")
    .lean();

  const valid = new Map(
    svcDocs.map((s) => [
      String(s._id),
      { name: s.name, business: String(s.business) },
    ]),
  );

  const scoped = rawBid && mongoose.isValidObjectId(String(rawBid));
  const maxOut = scoped ? 8 : 10;

  const out = [];
  for (const c of candidates) {
    const s = valid.get(c.serviceId);
    if (!s || s.business !== c.businessId) continue;
    out.push({
      businessId: c.businessId,
      businessName: c.businessName,
      businessSlug: c.businessSlug,
      serviceId: c.serviceId,
      serviceName: s.name,
      bookCount: c.bookCount,
      lastBookedAt: c.lastBookedAt,
    });
    if (out.length >= maxOut) break;
  }

  return res.json({
    suggestions: out,
    basis:
      "Based on your completed visits. Services that are no longer offered are hidden.",
  });
}

/**
 * GET /api/bookings/mine/staff-review-eligible?businessId=
 * Past confirmed/completed visits the customer can still leave a private staff review for.
 */
async function listStaffReviewEligibleBookings(req, res) {
  const rawBid = req.query.businessId;
  if (!rawBid || !mongoose.isValidObjectId(String(rawBid))) {
    return res.status(400).json({ message: "businessId is required" });
  }
  const customerId = req.userId;
  const now = new Date();

  const rows = await Booking.find({
    customer: customerId,
    business: rawBid,
    status: { $in: ["confirmed", "completed"] },
  })
    .select("business staff service services date endTime")
    .populate("staff", "name")
    .populate("service", "name")
    .sort({ date: -1 })
    .limit(200)
    .lean();

  const past = [];
  for (const b of rows) {
    const end = computeBookingEnd(b);
    if (!end || end.getTime() > now.getTime()) continue;
    past.push(b);
  }

  if (past.length === 0) {
    return res.json({ eligible: [] });
  }

  const bookingIds = past.map((b) => b._id);
  const already = await Review.find({
    booking: { $in: bookingIds },
    staff: { $type: "objectId" },
  })
    .select("booking")
    .lean();
  const reviewed = new Set(already.map((x) => String(x.booking)));

  const eligible = [];
  for (const b of past) {
    if (reviewed.has(String(b._id))) continue;
    const staffId = b.staff?._id ? String(b.staff._id) : String(b.staff);
    const staffName =
      b.staff && typeof b.staff === "object" && b.staff.name
        ? String(b.staff.name).trim()
        : "Staff";
    eligible.push({
      bookingId: String(b._id),
      staffId,
      staffName,
      dateLabel: formatDateLabel(b.date),
      serviceLabel: buildServiceLabel(b) || "Appointment",
    });
  }

  return res.json({ eligible });
}

/**
 * GET /api/bookings/my-spending
 * Authenticated user — total amount spent per business (as the customer).
 * Counts bookings with status completed only (final charged price).
 */
async function getCustomerSpendingByBusiness(req, res) {
  const customerId = req.userId;
  const pipeline = [
    {
      $match: {
        customer: new mongoose.Types.ObjectId(customerId),
        status: "completed",
      },
    },
    {
      $group: {
        _id: "$business",
        totalSpent: { $sum: "$price" },
        bookingCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "businesses",
        localField: "_id",
        foreignField: "_id",
        as: "biz",
      },
    },
    {
      $unwind: { path: "$biz", preserveNullAndEmptyArrays: true },
    },
    {
      $project: {
        businessId: { $toString: "$_id" },
        businessName: {
          $ifNull: ["$biz.name", "Business"],
        },
        logo: { $ifNull: ["$biz.logo", ""] },
        slug: { $ifNull: ["$biz.slug", ""] },
        currency: { $ifNull: ["$biz.currency", "EUR"] },
        totalSpent: { $round: ["$totalSpent", 2] },
        bookingCount: 1,
      },
    },
    { $sort: { totalSpent: -1 } },
  ];

  const rows = await Booking.aggregate(pipeline);
  const grandTotal = rows.reduce((s, r) => s + (Number(r.totalSpent) || 0), 0);
  return res.json({
    businesses: rows,
    grandTotal: Math.round(grandTotal * 100) / 100,
    /** Shown in UI — explains which visits count */
    basis:
      "Totals use only completed visits (the price stored on each booking).",
  });
}

module.exports = {
  streamBookings,
  getAvailability,
  getAvailabilitySummary,
  createBooking,
  confirmPendingBooking,
  declinePendingBooking,
  listMyBookings,
  listManagedBookings,
  listMyServiceSuggestions,
  listStaffReviewEligibleBookings,
  getCustomerSpendingByBusiness,
  rescheduleBooking,
  updateBooking,
  undoCancelBooking,
};
