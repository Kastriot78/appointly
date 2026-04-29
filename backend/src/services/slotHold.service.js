const SlotHold = require("../models/SlotHold");
const {
  utcDayBounds,
  bookingIntervalMinutes,
  rangesOverlap,
  slotWorksForStaff,
} = require("../utils/bookingAvailability");

function slotHoldMinutes() {
  const n = Number(process.env.SLOT_HOLD_MINUTES || 3);
  return Number.isFinite(n) && n >= 1 && n <= 15 ? n : 3;
}

/** @returns {Array<object>} pseudo-bookings for overlap helpers */
function holdsToPseudoBookings(holds) {
  return holds.map((h) => ({
    startTime: h.startTime,
    endTime: h.endTime,
    status: "confirmed",
    fromHold: true,
  }));
}

/**
 * Active holds for staff on calendar day (UTC bounds from ymd).
 * @returns {Map<string, Array<import('mongoose').Document>>}
 */
async function loadHoldsMapForDay(businessId, staffIds, ymd) {
  const { dayStart, dayEnd } = utcDayBounds(ymd);
  const now = new Date();
  if (!staffIds.length) return new Map();
  const rows = await SlotHold.find({
    business: businessId,
    staff: { $in: staffIds },
    date: { $gte: dayStart, $lt: dayEnd },
    expiresAt: { $gt: now },
  }).lean();
  const map = new Map();
  for (const h of rows) {
    const sid = String(h.staff);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(h);
  }
  return map;
}

/**
 * Merge hold intervals into bookings map (mutates copies per staff).
 */
function mergeHoldsIntoBookingsMap(bookingsMap, holdsMap) {
  const out = new Map(bookingsMap);
  for (const [sid, holds] of holdsMap.entries()) {
    const existing = out.get(sid) ? [...out.get(sid)] : [];
    const pseudo = holdsToPseudoBookings(holds);
    out.set(sid, [...existing, ...pseudo]);
  }
  return out;
}

function holdOverlapsList(slotStartMin, durationMin, holdsForStaff) {
  const endMin = slotStartMin + durationMin;
  for (const h of holdsForStaff) {
    const iv = bookingIntervalMinutes({
      startTime: h.startTime,
      endTime: h.endTime,
      status: "confirmed",
    });
    if (!iv) continue;
    if (rangesOverlap(slotStartMin, endMin, iv.start, iv.end)) {
      return true;
    }
  }
  return false;
}

/**
 * True if slot is blocked only by holds (not real bookings).
 */
function slotBlockedOnlyByHolds(
  staff,
  business,
  ymd,
  slotStartMin,
  durationMin,
  bookingsOnly,
  bookingsAndHolds,
) {
  const freeBookings = slotWorksForStaff(
    staff,
    business,
    ymd,
    slotStartMin,
    durationMin,
    bookingsOnly,
  );
  const freeAll = slotWorksForStaff(
    staff,
    business,
    ymd,
    slotStartMin,
    durationMin,
    bookingsAndHolds,
  );
  return freeBookings && !freeAll;
}

module.exports = {
  slotHoldMinutes,
  loadHoldsMapForDay,
  mergeHoldsIntoBookingsMap,
  holdOverlapsList,
  slotBlockedOnlyByHolds,
  holdsToPseudoBookings,
};
