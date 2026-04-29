const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Business = require("../models/Business");
const Review = require("../models/Review");
const User = require("../models/User");
const { isAdminRole, normalizeRole } = require("../utils/roleChecks");
const Staff = require("../models/Staff");
const {
  utcDayBounds,
  getStaffEffectiveWindow,
  ymdToIsoString,
  parseYmdParts,
} = require("../utils/bookingAvailability");
const { resolveWorkspaceBusinessIds } = require("../utils/workspaceScope");
const { normalizeCurrency } = require("../utils/currency");

/** Week revenue: sum of service prices for non-cancelled bookings this ISO week (UTC). */
const REVENUE_STATUSES = ["pending", "confirmed", "completed"];

/**
 * Monday 00:00 UTC through following Monday 00:00 UTC (ISO week window).
 */
function getUtcWeekRange() {
  const now = new Date();
  const dow = now.getUTCDay();
  const diffFromMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + diffFromMonday,
      0,
      0,
      0,
      0,
    ),
  );
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return { weekStart: monday, weekEnd: nextMonday };
}

/** Local start time for a booking (matches frontend `isUpcoming` intent). */
function parseBookingStartMs(booking) {
  const raw = booking.date;
  let y;
  let mo;
  let day;
  if (raw instanceof Date) {
    y = raw.getFullYear();
    mo = raw.getMonth();
    day = raw.getDate();
  } else if (typeof raw === "string") {
    const md = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (md) {
      y = parseInt(md[1], 10);
      mo = parseInt(md[2], 10) - 1;
      day = parseInt(md[3], 10);
    }
  }
  if (y == null || Number.isNaN(day)) return null;
  const parts = String(booking.startTime || "00:00").split(":");
  const hh = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  return new Date(y, mo, day, hh, mm, 0, 0).getTime();
}

const UPCOMING_STATUSES = ["pending", "pending_confirmation", "confirmed"];

/** Minimal payload for dashboard countdown (matches list row naming where possible). */
function mapNearestCustomerBooking(b) {
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
  const servicesArr = Array.isArray(b.services) ? b.services : [];
  const servicesOut = servicesArr
    .slice()
    .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
    .map((s) => ({
      name: s.name || "",
    }));
  const primaryName = svc?.name || servicesOut[0]?.name || "Service";
  const combinedName =
    servicesOut.length > 1
      ? servicesOut.map((s) => s.name).filter(Boolean).join(" + ")
      : primaryName;

  return {
    id: b._id.toString(),
    businessName: biz?.name || "",
    serviceName: primaryName,
    servicesLabel: combinedName,
    staffName: stf?.name || "Staff",
    date: b.date,
    startTime: b.startTime,
    duration: Number(b.duration) || 0,
    status: b.status,
  };
}

async function getCustomerOverview(req, res) {
  const customerId = req.userId;
  const [bookings, reviewsWrittenCount, userDoc] = await Promise.all([
    Booking.find({ customer: customerId })
      .populate("business", "name")
      .populate("service", "name")
      .populate("staff", "name")
      .select("date startTime status services duration")
      .lean(),
    Review.countDocuments({ customer: customerId }),
    User.findById(customerId).select("favorites").lean(),
  ]);

  let upcomingBookingsCount = 0;
  let completedVisitsCount = 0;
  const now = Date.now();
  let nearest = null;
  let nearestStartMs = Infinity;

  for (const b of bookings) {
    if (b.status === "completed") completedVisitsCount += 1;
    const startMs = parseBookingStartMs(b);
    const isFutureUpcoming =
      UPCOMING_STATUSES.includes(b.status) &&
      startMs != null &&
      startMs > now;
    if (isFutureUpcoming) {
      upcomingBookingsCount += 1;
      if (startMs < nearestStartMs) {
        nearestStartMs = startMs;
        nearest = b;
      }
    }
  }

  const favoriteBusinessesCount = Array.isArray(userDoc?.favorites)
    ? userDoc.favorites.length
    : 0;

  return res.json({
    scope: "customer",
    upcomingBookingsCount,
    completedVisitsCount,
    reviewsWrittenCount,
    favoriteBusinessesCount,
    nearestUpcomingBooking: nearest ? mapNearestCustomerBooking(nearest) : null,
  });
}

/** YYYY-MM-DD in UTC for a stored booking `date`. */
function bookingDateKeyUtc(dateVal) {
  if (!dateVal) return "";
  const dt = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Per-staff stats for one calendar day: utilization + counts.
 * Sorted by appointments (high → low), then booked minutes, then name.
 */
async function buildStaffScheduleLoad({
  businessIds,
  scopeStaff,
  utilYmd,
}) {
  if (!businessIds.length) return [];

  const staffQuery = {
    business: { $in: businessIds },
    isActive: true,
  };
  if (scopeStaff.staff) {
    staffQuery._id = scopeStaff.staff;
  }

  const [staffRows, businessRows] = await Promise.all([
    Staff.find(staffQuery).lean(),
    Business.find({ _id: { $in: businessIds } }).lean(),
  ]);
  const businessById = new Map(
    businessRows.map((b) => [String(b._id), b]),
  );

  const dateIso = ymdToIsoString(utilYmd);
  const { dayStart } = utcDayBounds(utilYmd);
  const rangeEnd = new Date(dayStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const staffIdSet = new Set(staffRows.map((s) => String(s._id)));
  const bookingMatch = {
    business: { $in: businessIds },
    date: { $gte: dayStart, $lt: rangeEnd },
    status: { $nin: ["cancelled"] },
  };
  if (scopeStaff.staff) {
    bookingMatch.staff = scopeStaff.staff;
  }

  const bookingRows = await Booking.find(bookingMatch)
    .select("staff date duration")
    .lean();

  const bookedByStaff = new Map();
  const countByStaff = new Map();
  for (const b of bookingRows) {
    const sid = b.staff == null ? "" : String(b.staff);
    if (!sid || !staffIdSet.has(sid)) continue;
    const dk = bookingDateKeyUtc(b.date);
    if (dk !== dateIso) continue;
    const dur = Math.max(0, Math.round(Number(b.duration) || 0));
    countByStaff.set(sid, (countByStaff.get(sid) || 0) + 1);
    bookedByStaff.set(sid, (bookedByStaff.get(sid) || 0) + dur);
  }

  function dayPayload(staff, biz) {
    const window = getStaffEffectiveWindow(staff, biz, utilYmd);
    const capacityMinutes = window ? window.closeM - window.openM : 0;
    const isWorkingDay = Boolean(window);
    const sid = String(staff._id);
    const appointmentsCount = countByStaff.get(sid) || 0;
    const bookedMinutes = bookedByStaff.get(sid) || 0;
    let utilizationPercent = null;
    if (capacityMinutes > 0) {
      utilizationPercent = Math.min(
        100,
        Math.round((100 * bookedMinutes) / capacityMinutes),
      );
    }
    return {
      date: dateIso,
      appointmentsCount,
      bookedMinutes,
      capacityMinutes,
      utilizationPercent,
      isWorkingDay,
    };
  }

  const out = [];
  for (const st of staffRows) {
    const biz = businessById.get(String(st.business));
    if (!biz) continue;
    out.push({
      staffId: String(st._id),
      name: String(st.name || "").trim() || "Staff",
      day: dayPayload(st, biz),
    });
  }

  out.sort((a, b) => {
    const c =
      (b.day.appointmentsCount || 0) - (a.day.appointmentsCount || 0);
    if (c !== 0) return c;
    const m = (b.day.bookedMinutes || 0) - (a.day.bookedMinutes || 0);
    if (m !== 0) return m;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}

function weightedBusinessRating(businesses) {
  let sumWeighted = 0;
  let sumReviews = 0;
  let simpleSum = 0;
  let n = 0;
  for (const b of businesses) {
    const r = typeof b.rating === "number" ? b.rating : 0;
    const rc = typeof b.reviewCount === "number" ? b.reviewCount : 0;
    if (rc > 0) {
      sumWeighted += r * rc;
      sumReviews += rc;
    } else {
      simpleSum += r;
      n += 1;
    }
  }
  if (sumReviews > 0) {
    return sumWeighted / sumReviews;
  }
  if (n > 0) {
    return simpleSum / n;
  }
  return 0;
}

/**
 * GET /api/dashboard/overview — tenant/admin workspace KPIs, or customer summary KPIs.
 */
async function getOverview(req, res) {
  if (normalizeRole(req.user?.role) === "customer") {
    return getCustomerOverview(req, res);
  }

  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({
      message: scope.error.message,
      ...(scope.error.code ? { code: scope.error.code } : {}),
    });
  }
  const businessIds = scope.businessIds;

  let workspaceCurrency = "EUR";
  if (businessIds.length > 0) {
    const curRows = await Business.find({ _id: { $in: businessIds } })
      .select("currency")
      .lean();
    const curSet = new Set(
      curRows.map((b) => normalizeCurrency(b.currency)),
    );
    workspaceCurrency = curSet.size === 1 ? [...curSet][0] : "EUR";
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const { dayStart, dayEnd } = utcDayBounds({ y, m: mo, d });
  const { weekStart, weekEnd } = getUtcWeekRange();

  let todayBookingsCount = 0;
  let weekRevenue = 0;
  let totalClients = 0;
  let averageRating = 0;

  const todayYmd = { y, m: mo, d };
  const rawStaffUtil = String(req.query.staffUtilDate || "").trim();
  let utilYmd = todayYmd;
  if (rawStaffUtil) {
    const parsed = parseYmdParts(rawStaffUtil);
    if (parsed) utilYmd = parsed;
  }

  if (businessIds.length === 0) {
    if (isAdminRole(req.user.role)) {
      totalClients = await User.countDocuments({ role: "customer" });
    }
    return res.json({
      todayBookingsCount: 0,
      weekRevenue: 0,
      totalClients,
      averageRating: 0,
      todaySchedule: [],
      topCustomers: [],
      staffScheduleLoad: [],
      staffScheduleDate: null,
      workspaceCurrency,
    });
  }

  const scopeStaff =
    scope.staffId != null
      ? { staff: scope.staffId }
      : {};
  const bizFilter = { business: { $in: businessIds }, ...scopeStaff };
  const activeBooking = { ...bizFilter, status: { $nin: ["cancelled"] } };

  const [todayCount, weekRevenueAgg] = await Promise.all([
    Booking.countDocuments({
      ...bizFilter,
      date: { $gte: dayStart, $lt: dayEnd },
      status: { $nin: ["cancelled"] },
    }),
    Booking.aggregate([
      {
        $match: {
          ...bizFilter,
          date: { $gte: weekStart, $lt: weekEnd },
          status: { $in: REVENUE_STATUSES },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$price" },
        },
      },
    ]),
  ]);
  todayBookingsCount = todayCount;
  weekRevenue = Number(weekRevenueAgg[0]?.total) || 0;

  if (isAdminRole(req.user.role)) {
    const [clientsCount, bizRows] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      Business.find({
        isActive: true,
        isApproved: { $ne: false },
      })
        .select("rating reviewCount")
        .lean(),
    ]);
    totalClients = clientsCount;
    averageRating = weightedBusinessRating(bizRows);
  } else {
    const [distinctCustomers, mineBiz] = await Promise.all([
      Booking.distinct("customer", {
        ...activeBooking,
      }),
      Business.find({ _id: { $in: businessIds } })
        .select("rating reviewCount")
        .lean(),
    ]);
    totalClients = distinctCustomers.filter(Boolean).length;
    averageRating = weightedBusinessRating(mineBiz);
  }

  /** Top customers by booking count (tenant workspace); sum price excludes cancelled/expired. */
  let topCustomers = [];
  const [topAgg, todayRows, staffScheduleLoad] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          ...bizFilter,
          customer: { $exists: true, $ne: null },
          status: { $nin: ["cancelled", "expired"] },
        },
      },
      {
        $group: {
          _id: "$customer",
          reservationCount: { $sum: 1 },
          totalSpent: { $sum: "$price" },
        },
      },
      { $sort: { reservationCount: -1, totalSpent: -1 } },
      { $limit: 5 },
    ]),
    Booking.find({
      ...bizFilter,
      date: { $gte: dayStart, $lt: dayEnd },
      status: { $nin: ["cancelled"] },
    })
      .populate("service", "name")
      .sort({ startTime: 1 })
      .limit(20)
      .lean(),
    buildStaffScheduleLoad({
      businessIds,
      scopeStaff,
      utilYmd,
    }),
  ]);

  const topCustomerIds = topAgg.map((r) => r._id).filter(Boolean);
  if (topCustomerIds.length > 0) {
    const topUsers = await User.find({ _id: { $in: topCustomerIds } })
      .select("name email")
      .lean();
    const userById = new Map(topUsers.map((u) => [String(u._id), u]));
    topCustomers = topAgg.map((row) => {
      const u = userById.get(String(row._id));
      const spent = Number(row.totalSpent) || 0;
      return {
        id: String(row._id),
        name: u?.name?.trim() || "—",
        email: u?.email ? String(u.email).trim() : "—",
        reservationCount: row.reservationCount,
        totalSpent: Math.round(spent * 100) / 100,
      };
    });
  }

  const customerIds = [
    ...new Set(
      todayRows
        .map((b) => (b.customer == null ? null : String(b.customer)))
        .filter(Boolean),
    ),
  ];

  const customerRows =
    customerIds.length > 0
      ? await User.find({ _id: { $in: customerIds } })
          .select("name email")
          .lean()
      : [];

  const customerById = new Map(
    customerRows.map((u) => [String(u._id), u]),
  );

  const todaySchedule = todayRows.map((b) => {
    const u = customerById.get(String(b.customer));
    const name = u?.name?.trim() || "";
    const email = u?.email ? String(u.email).trim() : "";
    const heldTime = b.startTime || "";
    const reqTime = (b.requestedStartTime && String(b.requestedStartTime).trim()) || "";
    return {
      id: b._id.toString(),
      time: heldTime,
      requestedStartTime: reqTime,
      service: b.service?.name || "Service",
      client: name || email || "Customer",
      clientEmail: email,
      status: b.status || "confirmed",
    };
  });

  return res.json({
    todayBookingsCount,
    weekRevenue: Math.round(weekRevenue * 100) / 100,
    totalClients,
    averageRating:
      Math.round(averageRating * 10) / 10 || 0,
    todaySchedule,
    topCustomers,
    staffScheduleLoad,
    staffScheduleDate: ymdToIsoString(utilYmd),
    workspaceCurrency,
  });
}

module.exports = {
  getOverview,
};
