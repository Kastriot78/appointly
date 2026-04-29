const cron = require("node-cron");
const Business = require("../models/Business");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const {
  sendTenantDailySummaryEmail,
  sendTenantWeeklyReportEmail,
} = require("../services/bookingEmail.service");
const { resolveBusinessNotifyEmail } = require("../utils/tenantNotificationPrefs");
const { formatMoneyAmount, normalizeCurrency } = require("../utils/currency");

const DAILY_SCHEDULE_STATUSES = [
  "pending",
  "pending_confirmation",
  "confirmed",
];

function utcTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Monday YYYY-MM-DD (UTC) for the week that contains `d`. */
function utcMondayKey(d = new Date()) {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = x.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + delta);
  return x.toISOString().slice(0, 10);
}

function utcDayBoundsForKey(ymd) {
  const [y, m, day] = ymd.split("-").map((v) => parseInt(v, 10));
  const start = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, day + 1, 0, 0, 0, 0));
  return { start, end };
}

async function runDailySummaries() {
  const todayKey = utcTodayKey();
  const { start, end } = utcDayBoundsForKey(todayKey);

  const rows = await Business.find({
    "tenantNotificationPrefs.dailySummary": true,
    "tenantDigestMeta.lastDailySummaryDate": { $ne: todayKey },
  })
    .select("name email owner tenantDigestMeta")
    .lean();

  const dateLabel = new Date(start).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  for (const biz of rows) {
    const to = await resolveBusinessNotifyEmail(biz);
    if (!to) {
      await Business.updateOne(
        { _id: biz._id },
        { $set: { "tenantDigestMeta.lastDailySummaryDate": todayKey } },
      );
      continue;
    }

    const bookings = await Booking.find({
      business: biz._id,
      date: { $gte: start, $lt: end },
      status: { $in: DAILY_SCHEDULE_STATUSES },
    })
      .sort({ startTime: 1 })
      .populate("customer", "name")
      .populate("service", "name")
      .populate("staff", "name")
      .lean();

    const lines = bookings.map((b) => {
      const cust = b.customer?.name || "Customer";
      const svc = b.service?.name || "";
      const stf = b.staff?.name || "";
      return [b.startTime, cust, svc, stf].filter(Boolean).join(" — ");
    });

    const result = await sendTenantDailySummaryEmail({
      to,
      businessName: biz.name,
      dateLabel,
      lines,
      bookingCount: bookings.length,
    });

    if (result.delivered) {
      await Business.updateOne(
        { _id: biz._id },
        { $set: { "tenantDigestMeta.lastDailySummaryDate": todayKey } },
      );
    }
  }
}

async function runWeeklyReports() {
  const mondayKey = utcMondayKey();
  const thisMonday = new Date(`${mondayKey}T00:00:00.000Z`);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const weekEnd = new Date(thisMonday);
  const lastDay = new Date(weekEnd.getTime() - 86400000);
  const periodLabel = `${lastMonday.toISOString().slice(0, 10)} → ${lastDay.toISOString().slice(0, 10)}`;

  const rows = await Business.find({
    "tenantNotificationPrefs.weeklyReport": true,
    "tenantDigestMeta.lastWeeklyReportWeek": { $ne: mondayKey },
  })
    .select("name email owner currency tenantDigestMeta")
    .lean();

  for (const biz of rows) {
    const to = await resolveBusinessNotifyEmail(biz);
    if (!to) {
      await Business.updateOne(
        { _id: biz._id },
        { $set: { "tenantDigestMeta.lastWeeklyReportWeek": mondayKey } },
      );
      continue;
    }

    const bookings = await Booking.find({
      business: biz._id,
      date: { $gte: lastMonday, $lt: weekEnd },
      status: { $nin: ["cancelled", "expired"] },
    }).lean();

    const currency = normalizeCurrency(biz.currency);
    const revenue = bookings.reduce(
      (s, b) => s + (Number(b.price) || 0),
      0,
    );
    const newReviewsCount = await Review.countDocuments({
      business: biz._id,
      createdAt: { $gte: lastMonday, $lt: weekEnd },
    });

    const result = await sendTenantWeeklyReportEmail({
      to,
      businessName: biz.name,
      periodLabel,
      bookingCount: bookings.length,
      revenueLabel: formatMoneyAmount(revenue, currency),
      newReviewsCount,
    });

    if (result.delivered) {
      await Business.updateOne(
        { _id: biz._id },
        { $set: { "tenantDigestMeta.lastWeeklyReportWeek": mondayKey } },
      );
    }
  }
}

function startTenantDigestJob() {
  cron.schedule(
    "15 6 * * *",
    () => {
      runDailySummaries().catch((err) =>
        console.error("[tenant-digest] daily:", err),
      );
    },
    { timezone: "UTC" },
  );

  cron.schedule(
    "20 7 * * 1",
    () => {
      runWeeklyReports().catch((err) =>
        console.error("[tenant-digest] weekly:", err),
      );
    },
    { timezone: "UTC" },
  );
}

module.exports = { startTenantDigestJob, runDailySummaries, runWeeklyReports };
