/**
 * Shared slot / overlap helpers for public availability and booking creation.
 * Availability is gap-based: offered start times are derived from free time
 * between existing bookings (plus optional buffer), not from a fixed day-wide grid.
 */

const SLOT_STEP_MINUTES = 30;

const ALLOWED_TIME_OFFER_STEPS = [5, 10, 15, 30, 45, 60, 90];

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseTimeToMinutes(str) {
  if (str == null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTime(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseYmdParts(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function utcDayBounds({ y, m, d }) {
  const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  return { dayStart, dayEnd };
}

function dayKeyFromYmd({ y, m, d }) {
  const dateUtc = new Date(Date.UTC(y, m - 1, d));
  return SHORT_DAYS[dateUtc.getUTCDay()];
}

function getBusinessDayRow(business, { y, m, d }) {
  const dateUtc = new Date(Date.UTC(y, m - 1, d));
  const longDay = LONG_DAYS[dateUtc.getUTCDay()];
  const rows = Array.isArray(business.workingHours)
    ? business.workingHours
    : [];
  return rows.find((h) => h && h.day === longDay) || null;
}

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;

function ymdToIsoString(ymd) {
  if (!ymd || ymd.y == null || ymd.m == null || ymd.d == null) return "";
  return `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
}

/**
 * If `ymd` falls in a staff time-off range, returns that range (for messaging); else null.
 */
function staffYmdOnTimeOff(staff, ymd) {
  const ranges = staff?.timeOff;
  if (!Array.isArray(ranges) || ranges.length === 0) return null;
  const cur = ymdToIsoString(ymd);
  if (!cur) return null;
  for (const r of ranges) {
    const a = String(r.startsOn || "").trim();
    const b = String(r.endsOn || "").trim();
    if (!ISO_YMD.test(a) || !ISO_YMD.test(b) || a > b) continue;
    if (cur >= a && cur <= b) {
      return { startsOn: a, endsOn: b, note: String(r.note || "").trim() };
    }
  }
  return null;
}

/**
 * Staff must work this weekday; window is intersection of staff hours and business hours for that day.
 * Returns { openM, closeM } or null if staff does not work or intersection is empty.
 */
function getStaffEffectiveWindow(staff, business, ymd) {
  if (staffYmdOnTimeOff(staff, ymd)) return null;
  const key = dayKeyFromYmd(ymd);
  if (!Array.isArray(staff.workingDays) || !staff.workingDays.includes(key)) {
    return null;
  }

  let openM =
    parseTimeToMinutes(staff.workingHours?.open) ?? parseTimeToMinutes("09:00");
  let closeM =
    parseTimeToMinutes(staff.workingHours?.close) ??
    parseTimeToMinutes("18:00");
  if (openM == null || closeM == null || openM >= closeM) {
    return null;
  }

  const brow = getBusinessDayRow(business, ymd);
  if (brow && brow.active) {
    const bo = parseTimeToMinutes(brow.open);
    const bc = parseTimeToMinutes(brow.close);
    if (bo != null && bc != null && bc > bo) {
      openM = Math.max(openM, bo);
      closeM = Math.min(closeM, bc);
    }
  }

  if (openM >= closeM) return null;
  return { openM, closeM };
}

function staffOffersService(staff, serviceId) {
  const sid = String(serviceId);
  const list = staff.services || [];
  return list.some((x) => String(x) === sid);
}

/** Interval [start, end) in minutes overlaps existing booking [bStart, bEnd) */
function rangesOverlap(start, end, bStart, bEnd) {
  return start < bEnd && end > bStart;
}

function bookingIntervalMinutes(b) {
  const a = parseTimeToMinutes(b.startTime);
  const c = parseTimeToMinutes(b.endTime);
  if (a == null || c == null || c <= a) return null;
  return { start: a, end: c };
}

function getBookingBufferMinutes(business) {
  const raw = business?.bookingRules?.bookingBufferMinutes;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(60, Math.round(n));
}

function getTimeOfferStepMinutes(business) {
  const raw = Number(business?.bookingRules?.timeOfferStepMinutes);
  if (Number.isFinite(raw) && ALLOWED_TIME_OFFER_STEPS.includes(raw)) {
    return raw;
  }
  return 5;
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter((i) => i[0] < i[1])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    if (!out.length || a > out[out.length - 1][1]) {
      out.push([a, b]);
    } else {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    }
  }
  return out;
}

/**
 * Blocking intervals for carving free gaps. Confirmed bookings and active checkout holds both
 * extend through end + bookingBufferMinutes so turnover time applies while someone is still
 * checking out (hold) as well as after a completed visit.
 */
function occupiedIntervalsFromBookings(bookings, bufferM) {
  const buf = Math.max(0, Math.min(60, Number(bufferM) || 0));
  const intervals = [];
  for (const b of bookings) {
    if (b.status === "cancelled" || b.status === "expired") continue;
    const iv = bookingIntervalMinutes(b);
    if (!iv) continue;
    intervals.push([iv.start, Math.min(24 * 60, iv.end + buf)]);
  }
  return mergeIntervals(intervals);
}

/**
 * Free gaps inside [openM, closeM) after subtracting merged occupied intervals.
 */
function freeGapsInWorkingWindow(openM, closeM, mergedOccupied) {
  const clipped = mergedOccupied
    .map(([a, b]) => [Math.max(openM, a), Math.min(closeM, b)])
    .filter(([a, b]) => a < b);
  const occ = mergeIntervals(clipped);
  const gaps = [];
  let x = openM;
  for (const [a, b] of occ) {
    if (a > x) gaps.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < closeM) gaps.push([x, closeM]);
  return gaps.filter(([a, b]) => a < b);
}

/**
 * Distinct start minutes where `durationMin` fits in a free gap, unioned across eligible staff.
 * The first offer in each gap is exactly at the gap start (after the previous booking end +
 * buffer). Further offers in that gap are every `roundStep` minutes — so spacing is consistent
 * even when the gap does not align to a global clock grid (e.g. 50 min appointment with 45 min
 * spacing → next starts at 9:50, then 10:35, …). Pass merged bookings + active holds per staff
 * so gaps reflect checkout holds too (otherwise the grid stays 9:00 / 9:45 / 10:30 and never
 * offers 9:50 while someone is mid-checkout).
 */

function collectDynamicOfferStarts({
  business,
  ymd,
  durationMin,
  eligibleStaff,
  bookingsByStaff,
  roundStep,
  bufferM,
}) {
  const stepRaw = Number(roundStep);
  const step =
    Number.isFinite(stepRaw) && ALLOWED_TIME_OFFER_STEPS.includes(stepRaw)
      ? stepRaw
      : 5;
  const buf = Math.max(0, Math.min(60, Number(bufferM) || 0));
  const set = new Set();
  for (const staff of eligibleStaff) {
    const w = getStaffEffectiveWindow(staff, business, ymd);
    if (!w) continue;
    const list = bookingsByStaff.get(String(staff._id)) || [];
    const occ = occupiedIntervalsFromBookings(list, buf);
    const gaps = freeGapsInWorkingWindow(w.openM, w.closeM, occ);
    for (const [g0, g1] of gaps) {
      const gStart = Math.ceil(Number(g0));
      const gEnd = Number(g1);
      if (!Number.isFinite(gStart) || !Number.isFinite(gEnd)) continue;
      for (
        let t = gStart;
        t + durationMin <= gEnd;
        t += step
      ) {
        set.add(t);
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * True if slot [slotStart, slotStart + duration) does not overlap any booking/hold.
 * Bookings and holds both respect busy time after end (buffer).
 */
function isSlotFreeForStaff(
  slotStartMin,
  durationMin,
  bookingsForStaff,
  bufferM = 0,
) {
  const endMin = slotStartMin + durationMin;
  const buf = Math.max(0, Math.min(60, Number(bufferM) || 0));
  for (const b of bookingsForStaff) {
    if (b.status === "cancelled" || b.status === "expired") continue;
    const iv = bookingIntervalMinutes(b);
    if (!iv) continue;
    const blockEnd = Math.min(24 * 60, iv.end + buf);
    if (rangesOverlap(slotStartMin, endMin, iv.start, blockEnd)) {
      return false;
    }
  }
  return true;
}

function slotWorksForStaff(
  staff,
  business,
  ymd,
  slotStartMin,
  durationMin,
  bookingsForStaff,
) {
  const w = getStaffEffectiveWindow(staff, business, ymd);
  if (!w) return false;
  if (slotStartMin < w.openM || slotStartMin + durationMin > w.closeM) {
    return false;
  }
  const buf = getBookingBufferMinutes(business);
  return isSlotFreeForStaff(
    slotStartMin,
    durationMin,
    bookingsForStaff,
    buf,
  );
}

/**
 * Legacy: fixed step on business window (used only where a coarse grid is still needed).
 */
function enumerateGridSlots(
  gridOpen,
  gridClose,
  durationMin,
  step = SLOT_STEP_MINUTES,
) {
  const out = [];
  for (let t = gridOpen; t + durationMin <= gridClose; t += step) {
    out.push(t);
  }
  return out;
}

/**
 * Closing periods block new bookings for overlapping slot intervals (UTC day + minutes).
 * @param {Array<{startsAt: Date|string, endsAt: Date|string}>} closings
 */
function slotOverlapsClosing(ymd, startM, durationMin, closings) {
  if (!closings || closings.length === 0) return false;
  const { dayStart } = utcDayBounds(ymd);
  const slotStart = dayStart.getTime() + startM * 60 * 1000;
  const slotEnd = slotStart + durationMin * 60 * 1000;
  for (const c of closings) {
    const a = new Date(c.startsAt).getTime();
    const b = new Date(c.endsAt).getTime();
    if (slotStart < b && slotEnd > a) return true;
  }
  return false;
}

function findNearestAlternativeSlot(opts) {
  const {
    business,
    ymd,
    duration,
    requestedStartM,
    eligibleStaff,
    bookingsByStaff: bookingsWithHoldsMap,
    isAny,
    closings = [],
  } = opts;

  if (!eligibleStaff.length) return null;

  const roundStep = getTimeOfferStepMinutes(business);
  const bufferM = getBookingBufferMinutes(business);
  const candidates = collectDynamicOfferStarts({
    business,
    ymd,
    durationMin: duration,
    eligibleStaff,
    bookingsByStaff: bookingsWithHoldsMap,
    roundStep,
    bufferM,
  });
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort(
    (a, b) =>
      Math.abs(a - requestedStartM) - Math.abs(b - requestedStartM) || a - b,
  );

  for (const slotStartM of sorted) {
    if (slotOverlapsClosing(ymd, slotStartM, duration, closings)) continue;
    if (isAny) {
      for (const s of eligibleStaff) {
        const list = bookingsWithHoldsMap.get(String(s._id)) || [];
        if (slotWorksForStaff(s, business, ymd, slotStartM, duration, list)) {
          return {
            staff: s,
            startM: slotStartM,
            startTime: minutesToTime(slotStartM),
          };
        }
      }
    } else {
      const s = eligibleStaff[0];
      const list = bookingsWithHoldsMap.get(String(s._id)) || [];
      if (slotWorksForStaff(s, business, ymd, slotStartM, duration, list)) {
        return {
          staff: s,
          startM: slotStartM,
          startTime: minutesToTime(slotStartM),
        };
      }
    }
  }
  return null;
}

function getGridWindowForDay(business, ymd) {
  const brow = getBusinessDayRow(business, ymd);
  const fallback = () => ({
    openM: parseTimeToMinutes("09:00"),
    closeM: parseTimeToMinutes("18:00"),
  });
  if (!brow) {
    const f = fallback();
    return { ...f, businessClosed: false };
  }
  if (brow.active === false) {
    const f = fallback();
    return { ...f, businessClosed: true };
  }
  const openM = parseTimeToMinutes(brow.open) ?? parseTimeToMinutes("09:00");
  const closeM = parseTimeToMinutes(brow.close) ?? parseTimeToMinutes("18:00");
  if (openM == null || closeM == null || openM >= closeM) {
    const f = fallback();
    return { ...f, businessClosed: false };
  }
  return { openM, closeM, businessClosed: false };
}

module.exports = {
  SLOT_STEP_MINUTES,
  getBookingBufferMinutes,
  getTimeOfferStepMinutes,
  collectDynamicOfferStarts,
  mergeIntervals,
  freeGapsInWorkingWindow,
  occupiedIntervalsFromBookings,
  parseTimeToMinutes,
  minutesToTime,
  parseYmdParts,
  utcDayBounds,
  getStaffEffectiveWindow,
  staffYmdOnTimeOff,
  ymdToIsoString,
  staffOffersService,
  isSlotFreeForStaff,
  slotWorksForStaff,
  bookingIntervalMinutes,
  enumerateGridSlots,
  getGridWindowForDay,
  rangesOverlap,
  slotOverlapsClosing,
  findNearestAlternativeSlot,
};
