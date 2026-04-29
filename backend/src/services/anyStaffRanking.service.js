const mongoose = require("mongoose");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Staff = require("../models/Staff");
const {
  utcDayBounds,
  getStaffEffectiveWindow,
} = require("../utils/bookingAvailability");

const BOOKING_STATUSES_BLOCKING = [
  "pending",
  "pending_confirmation",
  "confirmed",
];

const SMART_RANK_DEFAULT_PRIORITY = ["ratings", "performance", "speed"];
const SMART_RANK_KEYS = new Set(["performance", "ratings", "speed"]);

function normalizeSmartRankingConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      enabled: true,
      tieBreakEarliestShift: true,
      priority: [...SMART_RANK_DEFAULT_PRIORITY],
    };
  }
  let priority = Array.isArray(raw.priority)
    ? raw.priority.map((x) => String(x).trim())
    : [];
  priority = priority.filter((k) => SMART_RANK_KEYS.has(k));
  const seen = new Set();
  priority = priority.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (const k of SMART_RANK_DEFAULT_PRIORITY) {
    if (!seen.has(k)) priority.push(k);
  }
  return {
    enabled: raw.enabled !== false,
    tieBreakEarliestShift: raw.tieBreakEarliestShift !== false,
    priority,
  };
}

function toObjectIds(ids) {
  return ids.map((id) =>
    id instanceof mongoose.Types.ObjectId
      ? id
      : new mongoose.Types.ObjectId(String(id)),
  );
}

/**
 * Average review rating per staff (reviews linked to a booking that names the staff).
 */
async function loadStaffAverageRatingsMap(businessId, staffIds) {
  if (!staffIds.length) return new Map();
  const bid = new mongoose.Types.ObjectId(String(businessId));
  const oids = toObjectIds(staffIds);
  const rows = await Review.aggregate([
    {
      $match: {
        business: bid,
        booking: { $exists: true, $ne: null },
      },
    },
    {
      $lookup: {
        from: "bookings",
        localField: "booking",
        foreignField: "_id",
        as: "b",
      },
    },
    { $unwind: "$b" },
    { $match: { "b.staff": { $in: oids } } },
    {
      $group: {
        _id: "$b.staff",
        avgRating: { $avg: "$rating" },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), Number(r.avgRating) || 0);
  }
  return map;
}

/** Max reviews returned in the tenant feedback modal (newest first). */
const STAFF_FEEDBACK_MODAL_LIMIT = 2000;

/**
 * All review texts for one staff (tenant modal). Same basis as ranking averages:
 * reviews with a booking assigned to that staff member.
 */
async function getStaffRatingFeedbackDetail(businessId, staffId, limit = STAFF_FEEDBACK_MODAL_LIMIT) {
  const bid = new mongoose.Types.ObjectId(String(businessId));
  const sid = new mongoose.Types.ObjectId(String(staffId));
  const cap = Math.min(Math.max(Number(limit) || 0, 1), STAFF_FEEDBACK_MODAL_LIMIT);

  const [pack] = await Review.aggregate([
    {
      $match: {
        business: bid,
        booking: { $exists: true, $ne: null },
      },
    },
    {
      $lookup: {
        from: "bookings",
        localField: "booking",
        foreignField: "_id",
        as: "b",
      },
    },
    { $unwind: "$b" },
    { $match: { "b.staff": sid } },
    {
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              avgRating: { $avg: "$rating" },
              total: { $sum: 1 },
            },
          },
        ],
        items: [
          { $sort: { createdAt: -1 } },
          { $limit: cap },
          {
            $project: {
              _id: 0,
              text: "$text",
              rating: "$rating",
              createdAt: "$createdAt",
            },
          },
        ],
      },
    },
  ]);

  const stats = pack?.stats?.[0];
  const total = stats ? Number(stats.total) || 0 : 0;
  const avgRaw = stats?.avgRating;
  const ratingAverage =
    avgRaw != null && Number.isFinite(Number(avgRaw))
      ? Math.round(Number(avgRaw) * 100) / 100
      : null;

  const rawItems = pack?.items || [];
  const items = rawItems.map((it) => ({
    text: String(it.text || "").trim(),
    rating: Number(it.rating) || 0,
    createdAt: it.createdAt instanceof Date ? it.createdAt.toISOString() : it.createdAt,
  }));

  return {
    ratingAverage,
    totalCount: total,
    items,
    limit: cap,
    truncated: total > items.length,
  };
}

/**
 * Blocking booking counts per staff from the start of `ymd` for `numDays` calendar days.
 */
async function loadStaffBookingCountsWindow(businessId, staffIds, ymd, numDays) {
  if (!staffIds.length) return new Map();
  const { dayStart } = utcDayBounds(ymd);
  const windowEnd = new Date(
    dayStart.getTime() + Number(numDays) * 24 * 60 * 60 * 1000,
  );
  const bid = new mongoose.Types.ObjectId(String(businessId));
  const oids = toObjectIds(staffIds);
  const rows = await Booking.aggregate([
    {
      $match: {
        business: bid,
        staff: { $in: oids },
        date: { $gte: dayStart, $lt: windowEnd },
        status: { $in: BOOKING_STATUSES_BLOCKING },
      },
    },
    { $group: { _id: "$staff", n: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), r.n);
  }
  return map;
}

/**
 * Share of past visits marked completed vs no-show (last 90 days before `beforeDayStart`).
 */
async function loadStaffPerformanceScores(businessId, staffIds, beforeDayStart) {
  if (!staffIds.length) return new Map();
  const bid = new mongoose.Types.ObjectId(String(businessId));
  const oids = toObjectIds(staffIds);
  const windowStart = new Date(
    beforeDayStart.getTime() - 90 * 24 * 60 * 60 * 1000,
  );
  const rows = await Booking.aggregate([
    {
      $match: {
        business: bid,
        staff: { $in: oids },
        date: { $gte: windowStart, $lt: beforeDayStart },
        status: { $in: ["completed", "no_show"] },
      },
    },
    {
      $group: {
        _id: "$staff",
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    const c = Number(r.completed) || 0;
    const n = Number(r.noShow) || 0;
    const denom = c + n;
    const score = denom > 0 ? c / denom : 0.5;
    map.set(String(r._id), score);
  }
  return map;
}

function legacySortEligibleStaffForAny(
  eligibleStaff,
  business,
  ymd,
  ratingMap,
  countMap,
) {
  return [...eligibleStaff].sort((a, b) => {
    const wa = getStaffEffectiveWindow(a, business, ymd);
    const wb = getStaffEffectiveWindow(b, business, ymd);
    const openA = wa ? wa.openM : 24 * 60;
    const openB = wb ? wb.openM : 24 * 60;
    if (openA !== openB) return openA - openB;

    const ra = ratingMap.get(String(a._id)) ?? 0;
    const rb = ratingMap.get(String(b._id)) ?? 0;
    if (ra !== rb) return rb - ra;

    const ca = countMap.get(String(a._id)) ?? 0;
    const cb = countMap.get(String(b._id)) ?? 0;
    if (ca !== cb) return ca - cb;

    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
  });
}

function smartSortEligibleStaffForAny(
  eligibleStaff,
  business,
  ymd,
  ratingMap,
  countMap,
  perfMap,
  cfg,
) {
  return [...eligibleStaff].sort((a, b) => {
    if (cfg.tieBreakEarliestShift) {
      const wa = getStaffEffectiveWindow(a, business, ymd);
      const wb = getStaffEffectiveWindow(b, business, ymd);
      const openA = wa ? wa.openM : 24 * 60;
      const openB = wb ? wb.openM : 24 * 60;
      if (openA !== openB) return openA - openB;
    }

    for (const key of cfg.priority) {
      if (key === "ratings") {
        const ra = ratingMap.get(String(a._id));
        const rb = ratingMap.get(String(b._id));
        const va = ra != null && Number.isFinite(ra) ? ra : 2.5;
        const vb = rb != null && Number.isFinite(rb) ? rb : 2.5;
        if (vb > va) return 1;
        if (vb < va) return -1;
      } else if (key === "performance") {
        const pa = perfMap.get(String(a._id));
        const pb = perfMap.get(String(b._id));
        const va = pa != null && Number.isFinite(pa) ? pa : 0.5;
        const vb = pb != null && Number.isFinite(pb) ? pb : 0.5;
        if (vb > va) return 1;
        if (vb < va) return -1;
      } else if (key === "speed") {
        const ca = countMap.get(String(a._id)) ?? 0;
        const cb = countMap.get(String(b._id)) ?? 0;
        if (ca !== cb) return ca - cb;
      }
    }

    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
  });
}

/**
 * Order staff for `staffId: "any"` so the first free match follows tenant
 * smart-ranking settings (performance, ratings, speed) or legacy rules.
 */
async function sortEligibleStaffForAny(eligibleStaff, businessId, business, ymd) {
  if (!eligibleStaff || eligibleStaff.length <= 1) {
    return eligibleStaff;
  }
  const staffIds = eligibleStaff.map((s) => s._id);
  const { dayStart } = utcDayBounds(ymd);
  const cfg = normalizeSmartRankingConfig(business?.bookingRules?.smartStaffRanking);

  const [ratingMap, countMap, perfMap] = await Promise.all([
    loadStaffAverageRatingsMap(businessId, staffIds),
    loadStaffBookingCountsWindow(businessId, staffIds, ymd, 7),
    loadStaffPerformanceScores(businessId, staffIds, dayStart),
  ]);

  if (!cfg.enabled) {
    return legacySortEligibleStaffForAny(
      eligibleStaff,
      business,
      ymd,
      ratingMap,
      countMap,
    );
  }

  return smartSortEligibleStaffForAny(
    eligibleStaff,
    business,
    ymd,
    ratingMap,
    countMap,
    perfMap,
    cfg,
  );
}

function ymdUtcToday() {
  const now = new Date();
  return {
    y: now.getUTCFullYear(),
    m: now.getUTCMonth() + 1,
    d: now.getUTCDate(),
  };
}

function ymdToIso(ymd) {
  return `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
}

/**
 * Tenant dashboard — how staff rank for “Anyone available” today (UTC reference day).
 */
async function getStaffRankingPreview(businessId, business) {
  const ymd = ymdUtcToday();
  const { dayStart } = utcDayBounds(ymd);
  const cfg = normalizeSmartRankingConfig(
    business?.bookingRules?.smartStaffRanking,
  );

  const staff = await Staff.find({ business: businessId, isActive: true })
    .select("name role")
    .sort({ name: 1 })
    .lean();

  if (!staff.length) {
    return {
      referenceDate: ymdToIso(ymd),
      referenceNote:
        "Reference day is today (UTC). Performance uses completed vs. no-show visits in the 90 days before this date.",
      smartStaffRanking: cfg,
      staff: [],
    };
  }

  const staffIds = staff.map((s) => s._id);
  const [ratingMap, perfMap] = await Promise.all([
    loadStaffAverageRatingsMap(businessId, staffIds),
    loadStaffPerformanceScores(businessId, staffIds, dayStart),
  ]);

  const sorted = await sortEligibleStaffForAny(
    staff,
    businessId,
    business,
    ymd,
  );
  const rankById = new Map(
    sorted.map((s, i) => [String(s._id), i + 1]),
  );

  const rows = staff.map((s) => {
    const sid = String(s._id);
    const rAvg = ratingMap.get(sid);
    const perf = perfMap.get(sid) ?? 0.5;
    return {
      id: sid,
      name: s.name,
      role: s.role,
      performanceRate: Math.round(perf * 1000) / 10,
      ratingAverage:
        rAvg != null && Number.isFinite(rAvg) ? Math.round(rAvg * 100) / 100 : null,
      assignmentRank: rankById.get(sid) ?? staff.length,
    };
  });
  rows.sort((a, b) => a.assignmentRank - b.assignmentRank);

  return {
    referenceDate: ymdToIso(ymd),
    referenceNote:
      "Reference day is today (UTC). Performance uses completed vs. no-show in the prior 90 days.",
    smartStaffRanking: cfg,
    staff: rows,
  };
}

module.exports = {
  sortEligibleStaffForAny,
  loadStaffAverageRatingsMap,
  loadStaffBookingCountsWindow,
  loadStaffPerformanceScores,
  getStaffRankingPreview,
  getStaffRatingFeedbackDetail,
};
