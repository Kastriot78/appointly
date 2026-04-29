const Booking = require("../models/Booking");
const Business = require("../models/Business");
const Staff = require("../models/Staff");
const { resolveWorkspaceBusinessIds } = require("../utils/workspaceScope");
const { normalizeCurrency } = require("../utils/currency");
const { assertWorkspaceAnalytics } = require("../utils/subscriptionEnforcement");

/** Statuses that count toward revenue / demand (exclude cancelled + expired). */
const COUNTED_STATUSES = [
  "pending",
  "pending_confirmation",
  "confirmed",
  "completed",
];
/** Completed bookings only — strict "earned" revenue. Used alongside counted. */
const COMPLETED_STATUSES = ["completed"];

/** ISO weekday names in the order used by the frontend grid. */
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const GRANULARITIES = new Set(["day", "week", "month"]);

function parseDate(raw, fallback) {
  if (!raw) return fallback;
  const t = Date.parse(String(raw));
  if (Number.isNaN(t)) return fallback;
  return new Date(t);
}

/** Start of UTC day (00:00). */
function utcStartOfDay(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** Add `days` to a date (new instance, UTC-safe). */
function addDays(date, days) {
  const n = new Date(date);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function diffDays(from, to) {
  return Math.max(0, Math.round((to - from) / (24 * 60 * 60 * 1000)));
}

/** Default window: last 30 days (inclusive) with today as the end (exclusive). */
function resolveRange(req, defaultDays = 30) {
  const now = new Date();
  const endDefault = addDays(utcStartOfDay(now), 1); // exclusive (tomorrow 00:00 UTC)
  const startDefault = addDays(endDefault, -defaultDays);

  const start = utcStartOfDay(parseDate(req.query.from, startDefault));
  let end = parseDate(req.query.to, endDefault);
  end = utcStartOfDay(end);
  if (end <= start) end = addDays(start, 1);
  return { start, end };
}

async function getWorkspaceCurrency(businessIds) {
  if (!businessIds.length) return "EUR";
  const rows = await Business.find({ _id: { $in: businessIds } })
    .select("currency")
    .lean();
  const set = new Set(rows.map((b) => normalizeCurrency(b.currency)));
  return set.size === 1 ? [...set][0] : "EUR";
}

/**
 * GET /api/analytics/revenue — revenue + booking count series over time.
 * ?granularity=day|week|month&from&to
 */
async function getRevenueTrend(req, res) {
  await assertWorkspaceAnalytics(req, { advanced: false });
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({ message: scope.error.message });
  }
  const businessIds = scope.businessIds;
  const currency = await getWorkspaceCurrency(businessIds);

  const granularityRaw = String(req.query.granularity || "day").toLowerCase();
  const granularity = GRANULARITIES.has(granularityRaw) ? granularityRaw : "day";
  const { start, end } = resolveRange(req, granularity === "month" ? 365 : 30);

  if (businessIds.length === 0) {
    return res.json({
      granularity,
      from: start.toISOString(),
      to: end.toISOString(),
      currency,
      series: [],
      totals: { revenue: 0, bookings: 0, completedRevenue: 0, completedBookings: 0 },
      previous: { revenue: 0, bookings: 0 },
      changePct: { revenue: null, bookings: null },
    });
  }

  const baseMatch = {
    business: { $in: businessIds },
    date: { $gte: start, $lt: end },
    status: { $in: COUNTED_STATUSES },
  };

  const series = await Booking.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: {
          $dateTrunc: { date: "$date", unit: granularity, timezone: "UTC" },
        },
        revenue: { $sum: "$price" },
        bookings: { $sum: 1 },
        completedRevenue: {
          $sum: {
            $cond: [
              { $in: ["$status", COMPLETED_STATUSES] },
              "$price",
              0,
            ],
          },
        },
        completedBookings: {
          $sum: {
            $cond: [{ $in: ["$status", COMPLETED_STATUSES] }, 1, 0],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        bucket: "$_id",
        revenue: { $round: ["$revenue", 2] },
        bookings: 1,
        completedRevenue: { $round: ["$completedRevenue", 2] },
        completedBookings: 1,
      },
    },
  ]);

  const totals = series.reduce(
    (acc, r) => {
      acc.revenue += Number(r.revenue) || 0;
      acc.bookings += Number(r.bookings) || 0;
      acc.completedRevenue += Number(r.completedRevenue) || 0;
      acc.completedBookings += Number(r.completedBookings) || 0;
      return acc;
    },
    { revenue: 0, bookings: 0, completedRevenue: 0, completedBookings: 0 },
  );

  const windowMs = end - start;
  const prevStart = new Date(start.getTime() - windowMs);
  const prevEnd = start;
  const prevAgg = await Booking.aggregate([
    {
      $match: {
        business: { $in: businessIds },
        date: { $gte: prevStart, $lt: prevEnd },
        status: { $in: COUNTED_STATUSES },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$price" },
        bookings: { $sum: 1 },
      },
    },
  ]);
  const previous = {
    revenue: Math.round((prevAgg[0]?.revenue || 0) * 100) / 100,
    bookings: prevAgg[0]?.bookings || 0,
  };

  const pct = (curr, prev) => {
    if (!prev) return curr > 0 ? null : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };

  return res.json({
    granularity,
    from: start.toISOString(),
    to: end.toISOString(),
    currency,
    series: series.map((r) => ({
      bucket: r.bucket instanceof Date ? r.bucket.toISOString() : r.bucket,
      revenue: r.revenue,
      bookings: r.bookings,
      completedRevenue: r.completedRevenue,
      completedBookings: r.completedBookings,
    })),
    totals: {
      revenue: Math.round(totals.revenue * 100) / 100,
      bookings: totals.bookings,
      completedRevenue: Math.round(totals.completedRevenue * 100) / 100,
      completedBookings: totals.completedBookings,
    },
    previous,
    changePct: {
      revenue: pct(totals.revenue, previous.revenue),
      bookings: pct(totals.bookings, previous.bookings),
    },
  });
}

/**
 * GET /api/analytics/heatmap — weekday × hour booking counts.
 */
async function getHeatmap(req, res) {
  await assertWorkspaceAnalytics(req, { advanced: false });
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({ message: scope.error.message });
  }
  const businessIds = scope.businessIds;
  const { start, end } = resolveRange(req, 90);

  const rows = businessIds.length
    ? await Booking.aggregate([
        {
          $match: {
            business: { $in: businessIds },
            date: { $gte: start, $lt: end },
            status: { $in: COUNTED_STATUSES },
          },
        },
        {
          $addFields: {
            // Mongo $dayOfWeek: 1=Sunday … 7=Saturday. Remap to 0=Monday … 6=Sunday.
            dow: {
              $mod: [{ $add: [{ $dayOfWeek: "$date" }, 5] }, 7],
            },
            hour: {
              $toInt: { $substrBytes: ["$startTime", 0, 2] },
            },
          },
        },
        {
          $group: {
            _id: { dow: "$dow", hour: "$hour" },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            dow: "$_id.dow",
            hour: "$_id.hour",
            count: 1,
          },
        },
      ])
    : [];

  // Build a dense 7×24 grid so the UI has no gaps.
  const grid = [];
  for (let d = 0; d < 7; d += 1) {
    const row = { day: DAY_NAMES[d], dow: d, hours: [] };
    for (let h = 0; h < 24; h += 1) {
      row.hours.push({ hour: h, count: 0 });
    }
    grid.push(row);
  }
  let maxCount = 0;
  for (const r of rows) {
    if (r.dow < 0 || r.dow > 6 || r.hour < 0 || r.hour > 23) continue;
    grid[r.dow].hours[r.hour].count = r.count;
    if (r.count > maxCount) maxCount = r.count;
  }

  return res.json({
    from: start.toISOString(),
    to: end.toISOString(),
    days: grid,
    maxCount,
  });
}

/**
 * GET /api/analytics/service-popularity — bookings + revenue per service.
 */
async function getServicePopularity(req, res) {
  await assertWorkspaceAnalytics(req, { advanced: false });
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({ message: scope.error.message });
  }
  const businessIds = scope.businessIds;
  const currency = await getWorkspaceCurrency(businessIds);
  const { start, end } = resolveRange(req, 90);
  const limit = Math.max(1, Math.min(25, parseInt(req.query.limit, 10) || 10));

  const rows = businessIds.length
    ? await Booking.aggregate([
        {
          $match: {
            business: { $in: businessIds },
            date: { $gte: start, $lt: end },
            status: { $in: COUNTED_STATUSES },
          },
        },
        {
          $addFields: {
            lineItems: {
              $cond: [
                {
                  $and: [
                    { $isArray: "$services" },
                    { $gt: [{ $size: { $ifNull: ["$services", []] } }, 0] },
                  ],
                },
                "$services",
                [
                  {
                    service: "$service",
                    name: "",
                    price: "$price",
                  },
                ],
              ],
            },
          },
        },
        { $unwind: "$lineItems" },
        {
          $group: {
            _id: "$lineItems.service",
            bookings: { $sum: 1 },
            revenue: { $sum: "$lineItems.price" },
            snapshotName: { $last: "$lineItems.name" },
          },
        },
        {
          $lookup: {
            from: "services",
            localField: "_id",
            foreignField: "_id",
            as: "svc",
          },
        },
        {
          $addFields: {
            svcDoc: { $arrayElemAt: ["$svc", 0] },
          },
        },
        {
          $project: {
            _id: 0,
            id: { $toString: "$_id" },
            name: {
              $ifNull: ["$svcDoc.name", { $ifNull: ["$snapshotName", "Service"] }],
            },
            bookings: 1,
            revenue: { $round: ["$revenue", 2] },
          },
        },
        { $sort: { bookings: -1, revenue: -1 } },
        { $limit: limit },
      ])
    : [];

  const totals = rows.reduce(
    (acc, r) => {
      acc.bookings += r.bookings;
      acc.revenue += Number(r.revenue) || 0;
      return acc;
    },
    { bookings: 0, revenue: 0 },
  );

  return res.json({
    from: start.toISOString(),
    to: end.toISOString(),
    currency,
    services: rows,
    totals: {
      bookings: totals.bookings,
      revenue: Math.round(totals.revenue * 100) / 100,
    },
  });
}

/** Minutes from "HH:mm" difference (close - open). Returns null on bad input. */
function minutesBetween(open, close) {
  const re = /^(\d{1,2}):(\d{2})$/;
  const a = re.exec(String(open || "").trim());
  const b = re.exec(String(close || "").trim());
  if (!a || !b) return null;
  const aMin = Number(a[1]) * 60 + Number(a[2]);
  const bMin = Number(b[1]) * 60 + Number(b[2]);
  if (bMin <= aMin) return null;
  return bMin - aMin;
}

/** Count business days in [start, end) where the weekday name is in `allowed`. */
function countDaysInRange(start, end, allowedNames) {
  if (!allowedNames?.length) return 0;
  const allowed = new Set(allowedNames);
  let n = 0;
  const cur = new Date(start);
  while (cur < end) {
    const idx = cur.getUTCDay(); // 0=Sunday..6=Saturday
    const name = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][idx];
    if (allowed.has(name)) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
}

/**
 * GET /api/analytics/staff-utilization — booked minutes / available minutes.
 */
async function getStaffUtilization(req, res) {
  await assertWorkspaceAnalytics(req, { advanced: false });
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({ message: scope.error.message });
  }
  const businessIds = scope.businessIds;
  const { start, end } = resolveRange(req, 30);

  if (businessIds.length === 0) {
    return res.json({ from: start.toISOString(), to: end.toISOString(), staff: [] });
  }

  const [staffList, bookingAgg] = await Promise.all([
    Staff.find({ business: { $in: businessIds }, isActive: true })
      .select("name role avatar workingDays workingHours business")
      .lean(),
    Booking.aggregate([
      {
        $match: {
          business: { $in: businessIds },
          date: { $gte: start, $lt: end },
          status: { $in: COUNTED_STATUSES },
        },
      },
      {
        $group: {
          _id: "$staff",
          bookedMinutes: { $sum: "$duration" },
          bookings: { $sum: 1 },
          revenue: { $sum: "$price" },
        },
      },
    ]),
  ]);

  const byStaff = new Map(
    bookingAgg.map((r) => [String(r._id), r]),
  );

  const out = staffList.map((s) => {
    const perDay = minutesBetween(
      s.workingHours?.open,
      s.workingHours?.close,
    );
    const workingDays = Array.isArray(s.workingDays) ? s.workingDays : [];
    const workDaysInRange = countDaysInRange(start, end, workingDays);
    const availableMinutes =
      perDay != null ? perDay * workDaysInRange : 0;
    const b = byStaff.get(String(s._id));
    const bookedMinutes = Number(b?.bookedMinutes) || 0;
    const utilization =
      availableMinutes > 0
        ? Math.min(999, Math.round((bookedMinutes / availableMinutes) * 1000) / 10)
        : null;
    return {
      id: String(s._id),
      name: s.name,
      role: s.role,
      avatar: s.avatar || "",
      bookings: b?.bookings || 0,
      bookedMinutes,
      availableMinutes,
      utilization,
      revenue: Math.round((Number(b?.revenue) || 0) * 100) / 100,
    };
  });

  out.sort((a, c) => (c.utilization ?? -1) - (a.utilization ?? -1));

  return res.json({
    from: start.toISOString(),
    to: end.toISOString(),
    staff: out,
  });
}

/** Year-month key like "2026-04". */
function ymKey(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Add `months` months to a UTC "YYYY-MM" key and return a new one. */
function addMonthsKey(key, months) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return ymKey(d);
}

/**
 * GET /api/analytics/retention-cohorts — monthly customer retention grid.
 * Rows: month of customer's first booking in this workspace.
 * Cols: M0..M(n-1) — share of the cohort who booked again in that offset month.
 */
async function getRetentionCohorts(req, res) {
  await assertWorkspaceAnalytics(req, { advanced: true });
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({ message: scope.error.message });
  }
  const businessIds = scope.businessIds;
  const months = Math.max(2, Math.min(12, parseInt(req.query.months, 10) || 6));

  if (businessIds.length === 0) {
    return res.json({ months, cohorts: [] });
  }

  // Start of the cohort range: `months - 1` full months ago, at day 1 UTC.
  const now = new Date();
  const cohortStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
  );
  // Data window extends to now — cells beyond "today" remain empty/null.
  const dataEnd = addDays(utcStartOfDay(now), 1);

  const rows = await Booking.aggregate([
    {
      $match: {
        business: { $in: businessIds },
        customer: { $exists: true, $ne: null },
        date: { $lt: dataEnd },
        status: { $in: COUNTED_STATUSES },
      },
    },
    {
      $group: {
        _id: "$customer",
        firstDate: { $min: "$date" },
        dates: { $push: "$date" },
      },
    },
    { $match: { firstDate: { $gte: cohortStart } } },
  ]);

  // Build cohort keys (oldest first for readability)
  const cohortKeys = [];
  for (let i = 0; i < months; i += 1) {
    cohortKeys.push(addMonthsKey(ymKey(cohortStart), i));
  }

  const byCohort = new Map(
    cohortKeys.map((k) => [k, { total: 0, counts: new Array(months).fill(0) }]),
  );

  for (const r of rows) {
    const cohortKey = ymKey(r.firstDate);
    const cohort = byCohort.get(cohortKey);
    if (!cohort) continue;
    cohort.total += 1;
    const visited = new Set();
    for (const d of r.dates) {
      const offsetMonths =
        (d.getUTCFullYear() - r.firstDate.getUTCFullYear()) * 12 +
        (d.getUTCMonth() - r.firstDate.getUTCMonth());
      if (offsetMonths < 0 || offsetMonths >= months) continue;
      if (visited.has(offsetMonths)) continue;
      visited.add(offsetMonths);
      cohort.counts[offsetMonths] += 1;
    }
  }

  const cohorts = cohortKeys.map((key, idx) => {
    const c = byCohort.get(key);
    const total = c.total;
    // Only compute cells whose "calendar month" is in the past or present
    // (beyond-now offsets get `null` so the UI can dim them).
    const monthsElapsed = months - 1 - idx;
    const cells = c.counts.map((count, i) => {
      if (i > monthsElapsed) return { count: null, pct: null };
      if (!total) return { count: 0, pct: 0 };
      return {
        count,
        pct: Math.round((count / total) * 1000) / 10,
      };
    });
    return {
      cohort: key,
      total,
      cells,
    };
  });

  return res.json({
    months,
    offsetLabels: cohortKeys.map((_, i) => `M${i}`),
    cohorts,
  });
}

module.exports = {
  getRevenueTrend,
  getHeatmap,
  getServicePopularity,
  getStaffUtilization,
  getRetentionCohorts,
};
