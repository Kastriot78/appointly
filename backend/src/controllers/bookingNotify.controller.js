const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Business = require("../models/Business");
const { canAccessBusinessRead } = require("../utils/businessAccess");
const { resolveWorkspaceBusinessIds } = require("../utils/workspaceScope");
const { parseYmdParts, utcDayBounds } = require("../utils/bookingAvailability");
const { sendTenantCustomerBookingNotices } = require("../services/bookingEmail.service");

const NOTIFY_STATUSES = ["confirmed", "pending", "pending_confirmation"];

function formatBookingDateLabel(dayDate) {
  const d = new Date(dayDate);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function bookingServiceLabel(booking) {
  const servicesArr = Array.isArray(booking.services) ? booking.services : [];
  if (servicesArr.length > 1) {
    return servicesArr
      .slice()
      .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
      .map((s) => s.name)
      .filter(Boolean)
      .join(" + ");
  }
  if (booking.service && typeof booking.service === "object" && booking.service.name) {
    return String(booking.service.name);
  }
  if (servicesArr[0]?.name) return String(servicesArr[0].name);
  return "Service";
}

function staffNameFromBooking(booking) {
  if (booking.staff && typeof booking.staff === "object" && booking.staff.name) {
    return String(booking.staff.name);
  }
  return "Staff";
}

function customerNameFromBooking(booking) {
  if (booking.customer && typeof booking.customer === "object" && booking.customer.name) {
    return String(booking.customer.name).trim() || "Client";
  }
  return "Client";
}

function formatAppointmentDetailLine(booking) {
  const svc = bookingServiceLabel(booking);
  const dateLabel = formatBookingDateLabel(booking.date);
  const stf = staffNameFromBooking(booking);
  return `${svc} · ${dateLabel} · ${booking.startTime} – ${booking.endTime} · ${stf}`;
}

/** Local start/end (same idea as dashboard list) — true once the scheduled slot has finished. */
function bookingSlotHasEnded(booking) {
  const raw = booking.date;
  const st = String(booking.startTime || "00:00").trim();
  const timeParts = st.split(":");
  const hh = parseInt(timeParts[0], 10);
  const mm = parseInt(timeParts[1], 10) || 0;
  if (Number.isNaN(hh)) return true;

  let y;
  let mo;
  let day;
  if (typeof raw === "string") {
    const md = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (md) {
      y = parseInt(md[1], 10);
      mo = parseInt(md[2], 10) - 1;
      day = parseInt(md[3], 10);
    }
  }
  if (y == null || Number.isNaN(day)) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) return true;
    y = d.getFullYear();
    mo = d.getMonth();
    day = d.getDate();
  }
  const start = new Date(y, mo, day, hh, mm, 0, 0);
  const end = new Date(
    start.getTime() + (Number(booking.duration) || 0) * 60 * 1000,
  );
  return end <= new Date();
}

async function assertCanNotifyBooking(req, booking) {
  const biz = await Business.findById(booking.business).lean();
  if (!biz) {
    const err = new Error("Business not found");
    err.statusCode = 404;
    throw err;
  }
  const allowed = await canAccessBusinessRead(req.user, biz);
  if (!allowed) {
    const err = new Error("Not allowed");
    err.statusCode = 403;
    throw err;
  }
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    const err = new Error(scope.error.message);
    err.statusCode = scope.error.status;
    if (scope.error.code) err.code = scope.error.code;
    throw err;
  }
  if (scope.staffId && String(booking.staff) !== String(scope.staffId)) {
    const err = new Error("You can only notify customers for your own appointments");
    err.statusCode = 403;
    throw err;
  }
  return biz;
}

/**
 * POST /api/bookings/managed/notify-day
 * Body: { date: "YYYY-MM-DD", subject, description, businessId?: string } — businessId required for admins with many businesses
 */
async function notifyBookingsForDay(req, res) {
  const dateStr = String(req.body?.date ?? "").trim();
  const ymd = parseYmdParts(dateStr);
  if (!ymd) {
    return res.status(400).json({ message: "Invalid date (use YYYY-MM-DD)" });
  }

  const subjectIn = String(req.body?.subject ?? "").trim();
  const descriptionIn = String(req.body?.description ?? "").trim();
  if (!subjectIn) {
    return res.status(400).json({ message: "Subject is required" });
  }
  if (!descriptionIn) {
    return res.status(400).json({ message: "Description is required" });
  }
  if (subjectIn.length > 300) {
    return res.status(400).json({ message: "Subject is too long" });
  }
  if (descriptionIn.length > 20000) {
    return res.status(400).json({ message: "Description is too long" });
  }

  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    return res.status(scope.error.status).json({
      message: scope.error.message,
      ...(scope.error.code ? { code: scope.error.code } : {}),
    });
  }

  let businessIds = scope.businessIds;
  const bidBody = String(req.body?.businessId ?? "").trim();
  if (bidBody) {
    if (!mongoose.isValidObjectId(bidBody)) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const allowed = businessIds.some((id) => String(id) === bidBody);
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed for this business" });
    }
    businessIds = [new mongoose.Types.ObjectId(bidBody)];
  }

  if (businessIds.length !== 1) {
    return res.status(400).json({
      message:
        "Choose one business: set X-Workspace-Id or include businessId in the request body",
    });
  }

  const businessId = businessIds[0];
  const biz = await Business.findById(businessId).lean();
  if (!biz) {
    return res.status(404).json({ message: "Business not found" });
  }
  const canRead = await canAccessBusinessRead(req.user, biz);
  if (!canRead) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const { dayStart, dayEnd } = utcDayBounds(ymd);
  const filter = {
    business: businessId,
    date: { $gte: dayStart, $lt: dayEnd },
    status: { $in: NOTIFY_STATUSES },
  };
  if (scope.staffId) {
    filter.staff = scope.staffId;
  }

  const rows = await Booking.find(filter)
    .populate("customer", "name email")
    .populate("service", "name")
    .populate("staff", "name")
    .lean();

  const notEndedRows = rows.filter((b) => !bookingSlotHasEnded(b));
  const skippedEndedSlots = rows.length - notEndedRows.length;

  /** @type {Map<string, { email: string, name: string, lines: string[] }>} */
  const byEmail = new Map();
  let skippedNoEmail = 0;

  for (const b of notEndedRows) {
    const cust = b.customer;
    const email = cust?.email ? String(cust.email).trim().toLowerCase() : "";
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }
    const line = formatAppointmentDetailLine(b);
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        name: customerNameFromBooking(b),
        lines: [line],
      });
    } else {
      byEmail.get(email).lines.push(line);
    }
  }

  const recipients = [...byEmail.values()].map((r) => ({
    email: r.email,
    name: r.name,
    appointmentDetailLines: r.lines,
  }));

  if (recipients.length === 0) {
    let message = "No active bookings on that date to notify";
    if (rows.length > 0 && notEndedRows.length === 0) {
      message =
        "All appointments on that date have already ended — email is only available before each slot ends.";
    } else if (skippedNoEmail > 0) {
      message =
        "No customers with an email address found for bookings that can still be notified";
    }
    return res.status(400).json({
      message,
      bookingCount: rows.length,
      skippedNoEmail,
      skippedEndedSlots,
    });
  }

  const result = await sendTenantCustomerBookingNotices({
    businessName: biz.name || "Your business",
    subject: subjectIn,
    description: descriptionIn,
    recipients,
  });

  if (result.reason === "smtp_not_configured") {
    return res.status(503).json({
      message:
        "Email is not configured on this server (SMTP). Contact your administrator.",
    });
  }

  if (result.delivered === 0) {
    return res.status(500).json({
      message: "No emails were delivered. Check SMTP settings or try again later.",
      failed: result.failed,
      skippedNoEmail: result.skippedNoEmail + skippedNoEmail,
    });
  }

  return res.status(200).json({
    delivered: result.delivered,
    failed: result.failed,
    uniqueRecipients: recipients.length,
    bookingCount: notEndedRows.length,
    skippedNoEmail: skippedNoEmail + result.skippedNoEmail,
    skippedEndedSlots,
  });
}

/**
 * POST /api/bookings/:id/notify-customer
 * Body: { subject, description }
 */
async function notifySingleBooking(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id" });
  }

  const subjectIn = String(req.body?.subject ?? "").trim();
  const descriptionIn = String(req.body?.description ?? "").trim();
  if (!subjectIn) {
    return res.status(400).json({ message: "Subject is required" });
  }
  if (!descriptionIn) {
    return res.status(400).json({ message: "Description is required" });
  }
  if (subjectIn.length > 300) {
    return res.status(400).json({ message: "Subject is too long" });
  }
  if (descriptionIn.length > 20000) {
    return res.status(400).json({ message: "Description is too long" });
  }

  const booking = await Booking.findById(id)
    .populate("customer", "name email")
    .populate("service", "name")
    .populate("staff", "name")
    .lean();

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (!NOTIFY_STATUSES.includes(booking.status)) {
    return res.status(400).json({
      message: "Only confirmed, pending, or pending-confirmation bookings can be notified",
    });
  }

  if (bookingSlotHasEnded(booking)) {
    return res.status(400).json({
      message:
        "This appointment has already ended. You can only email the client until the scheduled slot is over.",
    });
  }

  const biz = await assertCanNotifyBooking(req, booking);

  const cust = booking.customer;
  const email = cust?.email ? String(cust.email).trim().toLowerCase() : "";
  if (!email) {
    return res.status(400).json({ message: "This customer has no email on file" });
  }

  const result = await sendTenantCustomerBookingNotices({
    businessName: biz.name || "Your business",
    subject: subjectIn,
    description: descriptionIn,
    recipients: [
      {
        email,
        name: customerNameFromBooking(booking),
        appointmentDetailLines: [formatAppointmentDetailLine(booking)],
      },
    ],
  });

  if (result.reason === "smtp_not_configured") {
    return res.status(503).json({
      message:
        "Email is not configured on this server (SMTP). Contact your administrator.",
    });
  }

  if (result.delivered === 0) {
    return res.status(500).json({
      message: "Email could not be sent. Check SMTP settings or try again later.",
      failed: result.failed,
    });
  }

  return res.status(200).json({
    delivered: result.delivered,
    failed: result.failed,
  });
}

module.exports = {
  notifyBookingsForDay,
  notifySingleBooking,
};
