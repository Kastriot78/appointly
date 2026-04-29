const cron = require("node-cron");
const Booking = require("../models/Booking");
const {
  sendAppointmentReminderEmail,
} = require("../services/bookingEmail.service");

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Per-window configuration. `stampField` is the idempotency timestamp on the
 * booking document (set after a successful send OR when the booking is
 * skipped so it drops out of future sweeps).
 */
const WINDOWS = [
  {
    key: "24h",
    windowMs: 24 * MS_PER_HOUR,
    /** Don't send the 24h reminder if we're already inside the 2h window. */
    minRemainingMs: 2 * MS_PER_HOUR + 5 * 60 * 1000,
    stampField: "reminder24hSentAt",
    togglePath: "before24h",
  },
  {
    key: "2h",
    windowMs: 2 * MS_PER_HOUR,
    /** Still worth sending right up until the appointment starts. */
    minRemainingMs: 0,
    stampField: "reminder2hSentAt",
    togglePath: "before2h",
  },
];

/** HH:mm → minutes-since-midnight. */
function parseHmToMinutes(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function computeBookingStart(booking) {
  if (!booking?.date) return null;
  const mins = parseHmToMinutes(booking.startTime);
  if (mins == null) return null;
  const d = new Date(booking.date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function computeBookingEnd(booking) {
  if (!booking?.date) return null;
  const mins = parseHmToMinutes(booking.endTime);
  if (mins == null) return null;
  const d = new Date(booking.date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function formatDateLabel(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildServiceLabel(booking) {
  const list = Array.isArray(booking.services) ? booking.services : [];
  if (list.length > 1) {
    const names = list
      .map((s) => (s?.name ? String(s.name).trim() : ""))
      .filter(Boolean);
    if (names.length > 0) return names.join(" + ");
  }
  if (list[0]?.name) return String(list[0].name).trim();
  return String(booking?.service?.name || "").trim();
}

async function stampBooking(bookingId, field) {
  try {
    await Booking.updateOne(
      { _id: bookingId },
      { $set: { [field]: new Date() } },
    );
  } catch (err) {
    console.error(
      `[reminder] failed to stamp ${field} on booking ${bookingId}:`,
      err.message,
    );
  }
}

/**
 * Decide whether a given booking should receive the reminder for this window.
 * Returns one of:
 *   { action: "send" }              — fire the email now
 *   { action: "skip" }               — stamp so we drop it (e.g. feature off)
 *   { action: "defer" }              — leave untouched, try again next sweep
 *   { action: "stale" }              — target time long-gone, stamp and move on
 */
function decide(now, booking, window) {
  const start = computeBookingStart(booking);
  if (!start) return { action: "skip" };

  const remaining = start.getTime() - now.getTime();

  if (remaining <= 0) {
    return { action: "stale" };
  }

  if (remaining > window.windowMs) {
    return { action: "defer" };
  }

  if (remaining < window.minRemainingMs) {
    return { action: "stale" };
  }

  return { action: "send", start };
}

async function processWindow(now, window) {
  const upperBound = new Date(now.getTime() + window.windowMs + MS_PER_HOUR);

  const candidates = await Booking.find({
    status: { $in: ["confirmed", "pending"] },
    [window.stampField]: null,
    date: { $gte: new Date(now.getTime() - MS_PER_HOUR), $lte: upperBound },
  })
    .populate("business", "name slug address reminders")
    .populate("service", "name")
    .populate("staff", "name")
    .populate("customer", "name email")
    .limit(500);

  let sent = 0;

  for (const b of candidates) {
    const biz = b.business;
    const cust = b.customer;
    if (!biz || !cust?.email) {
      await stampBooking(b._id, window.stampField);
      continue;
    }

    /**
     * Tenant disabled reminders entirely, or disabled just this window.
     * Stamp the booking so we never fetch it again for this window. If the
     * tenant toggles it back on later, only bookings created after that get
     * reminders — we never retroactively blast appointments in progress.
     */
    const rm = biz.reminders || {};
    if (rm.enabled === false || rm[window.togglePath] === false) {
      await stampBooking(b._id, window.stampField);
      continue;
    }

    const decision = decide(now, b, window);
    if (decision.action === "defer") continue;
    if (decision.action === "skip" || decision.action === "stale") {
      await stampBooking(b._id, window.stampField);
      continue;
    }

    const dateLabel = formatDateLabel(b.date);
    const end = computeBookingEnd(b);
    const endTimeStr = end
      ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
      : "";

    const res = await sendAppointmentReminderEmail({
      window: window.key,
      to: cust.email,
      customerName: cust.name || "there",
      businessName: biz.name || "",
      businessAddress: biz.address || "",
      businessSlug: biz.slug || "",
      dateLabel,
      startTime: b.startTime,
      endTime: b.endTime || endTimeStr,
      serviceLabel: buildServiceLabel(b),
      staffName: b.staff?.name || "",
      bookingId: b._id.toString(),
    });

    if (res?.delivered) {
      await stampBooking(b._id, window.stampField);
      sent += 1;
    } else if (res?.reason === "smtp_not_configured") {
      /**
       * SMTP isn't set up — don't stamp so we retry once the operator
       * configures the transport. Short-circuit this sweep to avoid
       * hammering the logs for every booking.
       */
      return { sent, shortCircuited: true };
    }
  }

  return { sent, shortCircuited: false };
}

async function runReminderSweep() {
  const now = new Date();
  let totalSent = 0;
  for (const win of WINDOWS) {
    try {
      const out = await processWindow(now, win);
      totalSent += out.sent;
      if (out.shortCircuited) break;
    } catch (err) {
      console.error(`[reminder] window ${win.key} failed:`, err.message);
    }
  }
  if (totalSent > 0) {
    console.log(`[reminder] Sent ${totalSent} reminder email(s)`);
  }
}

/**
 * Sweep every 5 minutes. Worst-case delay between target time and email
 * going out is therefore ~5 minutes, which is well within "24h before" /
 * "2h before" tolerances.
 */
function startReminderJob() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      await runReminderSweep();
    } catch (e) {
      console.error("[reminder]", e.message);
    }
  });
}

module.exports = {
  startReminderJob,
  runReminderSweep,
};
