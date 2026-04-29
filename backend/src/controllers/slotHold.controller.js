const mongoose = require("mongoose");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const Booking = require("../models/Booking");
const ClosingDay = require("../models/ClosingDay");
const SlotHold = require("../models/SlotHold");
const {
  parseYmdParts,
  utcDayBounds,
  parseTimeToMinutes,
  minutesToTime,
  staffOffersService,
  slotWorksForStaff,
  slotOverlapsClosing,
} = require("../utils/bookingAvailability");
const {
  slotHoldMinutes,
  loadHoldsMapForDay,
  mergeHoldsIntoBookingsMap,
} = require("../services/slotHold.service");
const {
  sortEligibleStaffForAny,
} = require("../services/anyStaffRanking.service");

const STATUS_NON_BLOCKING = ["cancelled", "expired"];
const MAX_SERVICES_PER_BOOKING = 8;

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
 * POST /api/bookings/slot-hold
 * Body: { businessId, serviceIds|serviceId, staffId, date, startTime, holderKey }
 */
async function createSlotHold(req, res) {
  const {
    businessId,
    serviceId,
    serviceIds,
    staffId: staffIdIn,
    date: dateStr,
    startTime,
    holderKey: hkIn,
  } = req.body || {};

  const holderKey = String(hkIn || "").trim();
  if (holderKey.length < 12) {
    return res.status(400).json({
      message:
        "holderKey is required (send a UUID from the client so the hold can be released).",
    });
  }

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

  const rawStaff = staffIdIn == null ? "" : String(staffIdIn).trim();
  if (!rawStaff || rawStaff === "null" || rawStaff === "undefined") {
    return res.status(400).json({ message: 'staffId is required (or "any")' });
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

  if (eligibleStaff.length === 0) {
    return res.status(400).json({
      message: "No staff available for this selection.",
    });
  }

  if (isAny && eligibleStaff.length > 1) {
    eligibleStaff = await sortEligibleStaffForAny(
      eligibleStaff,
      businessId,
      business,
      ymd,
    );
  }

  const staffIds = eligibleStaff.map((s) => s._id);
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

  if (slotOverlapsClosing(ymd, startM, duration, closings)) {
    return res.status(409).json({
      message: "This time is not available.",
      code: "SLOT_UNAVAILABLE",
    });
  }

  let chosenStaff = null;
  if (isAny) {
    for (const s of eligibleStaff) {
      const sid = String(s._id);
      const list = bookingsWithHolds.get(sid) || [];
      if (slotWorksForStaff(s, business, ymd, startM, duration, list)) {
        chosenStaff = s;
        break;
      }
    }
  } else {
    const s = eligibleStaff[0];
    const sid = String(s._id);
    const list = bookingsWithHolds.get(sid) || [];
    if (slotWorksForStaff(s, business, ymd, startM, duration, list)) {
      chosenStaff = s;
    }
  }

  if (!chosenStaff) {
    return res.status(409).json({
      message: "This slot is being held by another user or was just booked.",
      code: "SLOT_HELD_OR_TAKEN",
    });
  }

  const now = new Date();
  await SlotHold.deleteMany({
    business: businessId,
    holderKey,
    expiresAt: { $gt: now },
  });

  const dayDate = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  const endT = minutesToTime(startM + duration);
  const expiresAt = new Date(now.getTime() + slotHoldMinutes() * 60 * 1000);

  const doc = await SlotHold.create({
    business: businessId,
    staff: chosenStaff._id,
    date: dayDate,
    startTime: startT,
    endTime: endT,
    duration,
    holderKey,
    expiresAt,
  });
  return res.status(201).json({
    holdId: doc._id.toString(),
    staffId: String(chosenStaff._id),
    staffName: chosenStaff.name || "",
    expiresAt: doc.expiresAt.toISOString(),
    holderKey,
    holdMinutes: slotHoldMinutes(),
  });
}

/**
 * DELETE /api/bookings/slot-hold/:id?holderKey=
 */
async function releaseSlotHold(req, res) {
  const { id } = req.params;
  const holderKey = String(req.query.holderKey || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hold id" });
  }
  if (holderKey.length < 12) {
    return res.status(400).json({ message: "holderKey is required" });
  }
  const r = await SlotHold.deleteOne({
    _id: id,
    holderKey,
    expiresAt: { $gt: new Date() },
  });
  if (r.deletedCount === 0) {
    return res
      .status(404)
      .json({ message: "Hold not found or already expired" });
  }
  return res.status(204).send();
}

module.exports = {
  createSlotHold,
  releaseSlotHold,
};
