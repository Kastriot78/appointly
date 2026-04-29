const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const SlotHold = require("../models/SlotHold");
const ClosingDay = require("../models/ClosingDay");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const {
  utcDayBounds,
  minutesToTime,
  staffOffersService,
  getGridWindowForDay,
  collectDynamicOfferStarts,
  getTimeOfferStepMinutes,
  getBookingBufferMinutes,
  slotWorksForStaff,
  getStaffEffectiveWindow,
  slotOverlapsClosing,
} = require("../utils/bookingAvailability");
const {
  loadHoldsMapForDay,
  mergeHoldsIntoBookingsMap,
} = require("./slotHold.service");

const STATUS_NON_BLOCKING = ["cancelled", "expired"];

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
 * Shared dynamic slot grid for the public booking modal (GET /availability) and waitlist checks.
 *
 * @param {object} p
 * @param {string} p.businessId
 * @param {string[]} p.idList — validated service ObjectId strings
 * @param {ReturnType<parseYmdParts>} p.ymd
 * @param {string} p.rawStaff — Mongo id or "any"
 * @param {string} [p.excludeBookingId]
 * @param {string} [p.excludeSlotHoldId]
 * @param {string} [p.holderKeyAvail]
 */
async function loadDynamicPublicSlotsForModal(p) {
  const {
    businessId,
    idList,
    ymd,
    rawStaff,
    excludeBookingId,
    excludeSlotHoldId,
    holderKeyAvail,
  } = p;

  const business = await Business.findById(businessId).lean();
  if (!business || !business.isActive) {
    return { ok: false, status: 404, message: "Business not found" };
  }

  const serviceDocs = await Service.find({
    _id: { $in: idList },
    business: businessId,
    isActive: true,
  }).lean();
  if (serviceDocs.length !== idList.length) {
    return { ok: false, status: 404, message: "One or more services not found" };
  }

  const orderedServices = idList.map((id) =>
    serviceDocs.find((s) => String(s._id) === id),
  );
  const duration = orderedServices.reduce(
    (sum, s) => sum + (Number(s.duration) || 0),
    0,
  );
  if (duration <= 0) {
    return { ok: false, status: 400, message: "Invalid total service duration" };
  }

  const grid = getGridWindowForDay(business, ymd);
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
      return { ok: false, status: 400, message: "Invalid staff id" };
    }
    const staff = await Staff.findOne({
      _id: rawStaff,
      business: businessId,
      isActive: true,
    }).lean();
    if (!staff) {
      return { ok: false, status: 404, message: "Staff not found" };
    }
    if (!offersAll(staff)) {
      return {
        ok: false,
        status: 400,
        message:
          idList.length > 1
            ? "This staff member does not offer all selected services"
            : "This staff member does not offer this service",
      };
    }
    eligibleStaff = [staff];
  }

  if (eligibleStaff.length === 0 || grid.businessClosed) {
    return {
      ok: true,
      data: {
        slots: [],
        slotStepMinutes: getTimeOfferStepMinutes(business),
        duration,
        effectiveWindow: null,
        schedulingMode: "dynamic",
      },
    };
  }

  const { dayStart, dayEnd } = utcDayBounds(ymd);
  const staffIds = eligibleStaff.map((s) => s._id);
  let bookings =
    staffIds.length === 0
      ? []
      : await Booking.find({
          business: businessId,
          staff: { $in: staffIds },
          date: { $gte: dayStart, $lt: dayEnd },
          status: { $nin: STATUS_NON_BLOCKING },
        }).lean();

  if (excludeBookingId && mongoose.isValidObjectId(excludeBookingId)) {
    const ex = String(excludeBookingId);
    bookings = bookings.filter((b) => String(b._id) !== ex);
  }

  const bookingsByStaff = new Map();
  for (const b of bookings) {
    const sid = String(b.staff);
    if (!bookingsByStaff.has(sid)) bookingsByStaff.set(sid, []);
    bookingsByStaff.get(sid).push(b);
  }

  let excludeHoldForAvail = null;
  const hkAvail = String(holderKeyAvail || "").trim();
  if (
    excludeSlotHoldId &&
    mongoose.isValidObjectId(String(excludeSlotHoldId)) &&
    hkAvail.length >= 12
  ) {
    const hEx = await SlotHold.findOne({
      _id: excludeSlotHoldId,
      business: businessId,
      holderKey: hkAvail,
      expiresAt: { $gt: new Date() },
    })
      .select("_id")
      .lean();
    if (hEx) excludeHoldForAvail = hEx._id;
  }

  const holdsMapRawAvail =
    staffIds.length === 0
      ? new Map()
      : await loadHoldsMapForDay(businessId, staffIds, ymd);
  const holdsMap = excludeHoldForAvail
    ? holdsMapExcludingHoldId(holdsMapRawAvail, excludeHoldForAvail)
    : holdsMapRawAvail;
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

  const closings = await loadClosingsOverlappingDay(businessId, ymd);

  const slots = candidateStarts.map((slotStartMin) => {
    const time = minutesToTime(slotStartMin);
    if (slotOverlapsClosing(ymd, slotStartMin, duration, closings)) {
      return { time, available: false, unavailableReason: "closed" };
    }
    let available;
    let heldOnly = false;
    if (isAny) {
      let anyWithHolds = false;
      let anyBookingsOnly = false;
      for (const s of eligibleStaff) {
        const sid = String(s._id);
        const listB = bookingsByStaff.get(sid) || [];
        const listH = bookingsWithHolds.get(sid) || [];
        if (
          slotWorksForStaff(s, business, ymd, slotStartMin, duration, listH)
        ) {
          anyWithHolds = true;
        }
        if (
          slotWorksForStaff(s, business, ymd, slotStartMin, duration, listB)
        ) {
          anyBookingsOnly = true;
        }
      }
      available = anyWithHolds;
      heldOnly = !available && anyBookingsOnly;
    } else {
      const s = eligibleStaff[0];
      const sid = String(s._id);
      const listB = bookingsByStaff.get(sid) || [];
      const listH = bookingsWithHolds.get(sid) || [];
      available = slotWorksForStaff(
        s,
        business,
        ymd,
        slotStartMin,
        duration,
        listH,
      );
      if (!available) {
        heldOnly = slotWorksForStaff(
          s,
          business,
          ymd,
          slotStartMin,
          duration,
          listB,
        );
      }
    }
    const row = { time, available };
    if (!available && heldOnly) {
      row.unavailableReason = "held";
    } else if (!available) {
      row.unavailableReason = "full";
    }
    return row;
  });

  let effectiveWindow = null;
  if (!isAny && eligibleStaff.length === 1) {
    const w = getStaffEffectiveWindow(eligibleStaff[0], business, ymd);
    if (w) {
      effectiveWindow = {
        open: minutesToTime(w.openM),
        close: minutesToTime(w.closeM),
      };
    }
  }

  return {
    ok: true,
    data: {
      slots,
      slotStepMinutes: roundStep,
      duration,
      effectiveWindow,
      schedulingMode: "dynamic",
    },
  };
}

module.exports = {
  loadDynamicPublicSlotsForModal,
  loadClosingsOverlappingDay,
  STATUS_NON_BLOCKING,
};
