const crypto = require("crypto");
const mongoose = require("mongoose");
const SlotWaitlist = require("../models/SlotWaitlist");
const Business = require("../models/Business");
const { loadDynamicPublicSlotsForModal } = require("./dynamicPublicSlots.service");
const {
  parseTimeToMinutes,
  minutesToTime,
  parseYmdParts,
  utcDayBounds,
} = require("../utils/bookingAvailability");
const { sendWaitlistSlotOfferEmail } = require("./bookingEmail.service");

const OFFER_TTL_MS = 24 * 60 * 60 * 1000;

function serviceKeyFromIds(idList) {
  return [...new Set(idList.map((x) => String(x)))].sort().join(",");
}

function serviceKeyFromBooking(booking) {
  const ids =
    Array.isArray(booking.services) && booking.services.length > 0
      ? booking.services
          .slice()
          .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
          .map((s) => s.service)
      : [booking.service];
  return serviceKeyFromIds(ids);
}

function ymdFromBookingDate(raw) {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
  };
}

function normalizeSlotTime(slots, startTimeRaw) {
  const t0 = String(startTimeRaw || "").trim();
  let slot = slots.find((s) => s.time === t0);
  if (slot) return slot;
  const m = parseTimeToMinutes(t0);
  if (m == null) return null;
  const canon = minutesToTime(m);
  return slots.find((s) => s.time === canon) || null;
}

async function revertExpiredWaitlistOffers() {
  await SlotWaitlist.updateMany(
    { status: "offered", offerExpiresAt: { $lt: new Date() } },
    { $set: { status: "active", offerTokenHash: null, offerExpiresAt: null } },
  );
}

async function evaluateWaitlistEligibility({
  businessId,
  idList,
  dateStr,
  rawStaff,
  startTime,
}) {
  const ymd = parseYmdParts(dateStr);
  if (!ymd) {
    return { ok: false, status: 400, message: "Invalid date (use YYYY-MM-DD)" };
  }
  const loaded = await loadDynamicPublicSlotsForModal({
    businessId,
    idList,
    ymd,
    rawStaff: String(rawStaff || "").trim(),
  });
  if (!loaded.ok) {
    return { ok: false, status: loaded.status, message: loaded.message };
  }
  const { slots } = loaded.data;
  if (!slots.length) {
    return {
      ok: false,
      status: 400,
      message: "This day has no bookable times for this selection.",
    };
  }
  const slot = normalizeSlotTime(slots, startTime);
  if (!slot) {
    return {
      ok: false,
      status: 400,
      message: "That start time is not offered for this day.",
    };
  }
  if (slot.available) {
    return {
      ok: false,
      status: 400,
      message: "This time is open — you can book it directly.",
    };
  }
  if (slot.unavailableReason === "held") {
    return {
      ok: false,
      status: 400,
      message:
        "This time is temporarily held. Try again in a moment or pick another slot.",
    };
  }
  if (slot.unavailableReason === "closed") {
    return {
      ok: false,
      status: 400,
      message: "This time is not available (closed or outside hours).",
    };
  }
  if (slot.unavailableReason === "past") {
    return { ok: false, status: 400, message: "This time has already passed." };
  }
  const dateUtc = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  const isAny = String(rawStaff || "").trim().toLowerCase() === "any";
  const staffStored = isAny
    ? null
    : new mongoose.Types.ObjectId(String(rawStaff).trim());
  return {
    ok: true,
    slot,
    staffStored,
    dateUtc,
    serviceKey: serviceKeyFromIds(idList),
  };
}

async function createWaitlistEntry({
  businessId,
  idList,
  dateStr,
  rawStaff,
  startTime,
  email,
  name,
  customerId,
}) {
  await revertExpiredWaitlistOffers();
  const ev = await evaluateWaitlistEligibility({
    businessId,
    idList,
    dateStr,
    rawStaff,
    startTime,
  });
  if (!ev.ok) {
    return { ok: false, status: ev.status, message: ev.message };
  }
  const em = String(email || "").trim().toLowerCase();
  const nm = String(name || "").trim();
  const staffQuery = ev.staffStored ? { staff: ev.staffStored } : { staff: null };
  const dupe = await SlotWaitlist.findOne({
    business: businessId,
    date: ev.dateUtc,
    startTime: ev.slot.time,
    serviceKey: ev.serviceKey,
    email: em,
    status: "active",
    ...staffQuery,
  }).lean();
  if (dupe) {
    return { ok: true, alreadyQueued: true };
  }
  await SlotWaitlist.create({
    business: businessId,
    staff: ev.staffStored,
    date: ev.dateUtc,
    startTime: ev.slot.time,
    serviceKey: ev.serviceKey,
    email: em,
    name: nm.slice(0, 200),
    customer: customerId || null,
    status: "active",
  });
  return { ok: true, alreadyQueued: false };
}

async function processWaitlistAfterCancellation(booking) {
  try {
    await revertExpiredWaitlistOffers();
    const ymd = ymdFromBookingDate(booking.date);
    if (!ymd) return;
    const { dayStart, dayEnd } = utcDayBounds(ymd);
    const serviceKey = serviceKeyFromBooking(booking);
    const startTime = String(booking.startTime || "").trim();
    const q = {
      business: booking.business,
      date: { $gte: dayStart, $lt: dayEnd },
      startTime,
      serviceKey,
      status: "active",
      $or: [{ staff: null }, { staff: booking.staff }],
    };
    const token = crypto.randomBytes(24).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const offerExpiresAt = new Date(Date.now() + OFFER_TTL_MS);
    const entry = await SlotWaitlist.findOneAndUpdate(
      { ...q, status: "active" },
      {
        $set: {
          status: "offered",
          offerTokenHash: hash,
          offerExpiresAt,
        },
      },
      { sort: { createdAt: 1 }, new: true },
    ).lean();
    if (!entry) return;
    const biz = await Business.findById(booking.business)
      .select("name slug")
      .lean();
    if (!biz || !biz.slug) {
      await SlotWaitlist.findByIdAndUpdate(entry._id, {
        $set: {
          status: "active",
          offerTokenHash: null,
          offerExpiresAt: null,
        },
      });
      return;
    }
    const dateLabel = `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
    await sendWaitlistSlotOfferEmail({
      to: entry.email,
      customerName: entry.name,
      businessName: biz.name || "Business",
      businessSlug: biz.slug,
      token,
      dateLabel,
      startTime: entry.startTime,
    });
  } catch (err) {
    console.error("[waitlist] process after cancel:", err.message);
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function getWaitlistOfferForToken(rawToken) {
  await revertExpiredWaitlistOffers();
  const hash = hashToken(rawToken);
  const entry = await SlotWaitlist.findOne({
    offerTokenHash: hash,
    status: "offered",
    offerExpiresAt: { $gt: new Date() },
  })
    .select("business staff serviceKey startTime date offerExpiresAt name")
    .lean();
  if (!entry) {
    return { ok: false, reason: "invalid_or_expired" };
  }
  const biz = await Business.findById(entry.business)
    .select("slug name isActive")
    .lean();
  if (!biz || !biz.isActive) {
    return { ok: false, reason: "business_unavailable" };
  }
  const ymd = ymdFromBookingDate(entry.date);
  const dateStr = ymd
    ? `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`
    : "";
  const serviceIds = String(entry.serviceKey || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ok: true,
    offer: {
      businessId: String(entry.business),
      businessSlug: biz.slug,
      businessName: biz.name || "",
      serviceIds,
      staffId: entry.staff ? String(entry.staff) : "any",
      date: dateStr,
      startTime: entry.startTime,
      greetingName: entry.name || "",
    },
  };
}

async function fulfillWaitlistIfTokenMatches({
  token,
  booking,
  customerEmail,
}) {
  if (!token || !booking) return;
  await revertExpiredWaitlistOffers();
  const hash = hashToken(token);
  const entry = await SlotWaitlist.findOne({
    offerTokenHash: hash,
    status: "offered",
  });
  if (!entry) return;
  if (entry.offerExpiresAt && entry.offerExpiresAt <= new Date()) return;
  const bBiz = String(booking.business);
  const eBiz = String(entry.business);
  if (bBiz !== eBiz) return;
  const email = String(customerEmail || "").trim().toLowerCase();
  if (!email || email !== String(entry.email || "").trim().toLowerCase()) {
    return;
  }
  const ymd = ymdFromBookingDate(booking.date);
  const ymdE = ymdFromBookingDate(entry.date);
  if (
    !ymd ||
    !ymdE ||
    ymd.y !== ymdE.y ||
    ymd.m !== ymdE.m ||
    ymd.d !== ymdE.d
  ) {
    return;
  }
  if (
    String(booking.startTime || "").trim() !==
    String(entry.startTime || "").trim()
  ) {
    return;
  }
  if (serviceKeyFromBooking(booking) !== entry.serviceKey) return;
  const staffMatch =
    !entry.staff || String(entry.staff) === String(booking.staff);
  if (!staffMatch) return;
  entry.status = "fulfilled";
  entry.offerTokenHash = null;
  entry.offerExpiresAt = null;
  await entry.save();
}

module.exports = {
  createWaitlistEntry,
  evaluateWaitlistEligibility,
  processWaitlistAfterCancellation,
  getWaitlistOfferForToken,
  fulfillWaitlistIfTokenMatches,
  revertExpiredWaitlistOffers,
  serviceKeyFromBooking,
};
