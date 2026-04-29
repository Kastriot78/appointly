const mongoose = require("mongoose");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const Booking = require("../models/Booking");
const ClosingDay = require("../models/ClosingDay");
const {
  utcDayBounds,
  staffOffersService,
  slotWorksForStaff,
  getGridWindowForDay,
  collectDynamicOfferStarts,
  getTimeOfferStepMinutes,
  getBookingBufferMinutes,
  slotOverlapsClosing,
} = require("../utils/bookingAvailability");
const {
  loadHoldsMapForDay,
  mergeHoldsIntoBookingsMap,
} = require("./slotHold.service");

const STATUS_NON_BLOCKING = ["cancelled", "expired"];

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

async function loadClosingsOverlappingDay(businessId, ymd) {
  const { dayStart, dayEnd } = utcDayBounds(ymd);
  if (!mongoose.isValidObjectId(businessId)) return [];
  return ClosingDay.find({
    business: businessId,
    endsAt: { $gt: dayStart },
    startsAt: { $lt: dayEnd },
  }).lean();
}

/**
 * Whether the business has at least one bookable slot on `ymd` for at least
 * one active service (any staff who offers that service).
 *
 * @param {object} businessLean - Business .lean() doc (workingHours, etc.)
 * @param {{ y: number, m: number, d: number }} ymd
 * @param {{ clientNowMinutes?: number|null }} opts - If set, slot starts ≤ this
 *   minute-of-day (client local) are skipped — use for “today” from the user’s clock.
 */
async function businessHasFreeSlotOnDate(businessLean, ymd, opts = {}) {
  const { clientNowMinutes = null } = opts;
  const businessId = businessLean._id;

  const services = await Service.find({
    business: businessId,
    isActive: true,
    duration: { $gt: 0 },
  }).lean();
  if (!services.length) return false;

  const staffRows = await Staff.find({
    business: businessId,
    isActive: true,
  }).lean();
  if (!staffRows.length) return false;

  const staffIds = staffRows.map((s) => s._id);
  const bookingsByStaff = await loadBookingsMapForDay(
    businessId,
    staffIds,
    ymd,
  );
  const holdsMap = await loadHoldsMapForDay(businessId, staffIds, ymd);
  const bookingsWithHolds = mergeHoldsIntoBookingsMap(
    bookingsByStaff,
    holdsMap,
  );
  const closings = await loadClosingsOverlappingDay(businessId, ymd);

  const grid = getGridWindowForDay(businessLean, ymd);
  if (grid.businessClosed) return false;

  const nowM =
    clientNowMinutes != null &&
    Number.isFinite(clientNowMinutes) &&
    clientNowMinutes >= 0 &&
    clientNowMinutes < 24 * 60
      ? Math.floor(clientNowMinutes)
      : null;

  const roundStep = getTimeOfferStepMinutes(businessLean);
  const bufferM = getBookingBufferMinutes(businessLean);

  for (const svc of services) {
    const duration = Number(svc.duration) || 0;
    if (duration <= 0) continue;

    const eligibleStaff = staffRows.filter((s) =>
      staffOffersService(s, svc._id),
    );
    if (!eligibleStaff.length) continue;

    const candidateStarts = collectDynamicOfferStarts({
      business: businessLean,
      ymd,
      durationMin: duration,
      eligibleStaff,
      bookingsByStaff: bookingsWithHolds,
      roundStep,
      bufferM,
    });

    for (const slotStartMin of candidateStarts) {
      if (nowM != null && slotStartMin <= nowM) continue;
      if (slotOverlapsClosing(ymd, slotStartMin, duration, closings)) continue;

      for (const s of eligibleStaff) {
        const list = bookingsWithHolds.get(String(s._id)) || [];
        if (
          slotWorksForStaff(
            s,
            businessLean,
            ymd,
            slotStartMin,
            duration,
            list,
          )
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

const BATCH = 6;

async function filterBusinessIdsWithAvailability(businessDocs, ymd, clientNowMinutes) {
  const kept = [];
  for (let i = 0; i < businessDocs.length; i += BATCH) {
    const chunk = businessDocs.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((b) =>
        businessHasFreeSlotOnDate(b, ymd, { clientNowMinutes }),
      ),
    );
    for (let j = 0; j < chunk.length; j++) {
      if (results[j]) kept.push(chunk[j]);
    }
  }
  return kept;
}

module.exports = {
  businessHasFreeSlotOnDate,
  filterBusinessIdsWithAvailability,
};
