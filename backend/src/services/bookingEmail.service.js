const nodemailer = require("nodemailer");
const { formatMoneyAmount, normalizeCurrency } = require("../utils/currency");
const {
  escapeHtml,
  descriptionToHtmlParagraphs,
  buildGradientCtaHtml,
  buildAppointlyEmailDocument,
  footerParagraph,
} = require("./emailLayout.service");

function resolveSmtpEnv() {
  const host =
    process.env.SMTP_HOST ||
    process.env.EMAIL_HOST ||
    process.env.MAIL_HOST ||
    "";
  const user =
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    process.env.MAIL_USER ||
    "";
  const pass =
    process.env.SMTP_PASS ||
    process.env.EMAIL_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.MAIL_PASSWORD ||
    "";
  return { host: host.trim(), user: user.trim(), pass };
}

function getTransporter() {
  const { host, user, pass } = resolveSmtpEnv();
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
    secure:
      process.env.SMTP_SECURE === "true" || process.env.EMAIL_SECURE === "true",
    auth: user && pass ? { user, pass } : undefined,
  });
}

/**
 * Tenant/staff → customer notice (subject + body + optional lines).
 * @param {object} p — businessName, customerName, headline, description, appointmentDetailLines?, manageUrl?
 */
function buildAppointlyCustomerNoticeHtml(p) {
  const bizPlain = String(p.businessName || "Business").trim();
  const name = escapeHtml(String(p.customerName || "there").trim());
  const head = String(p.headline || "Message").trim();
  const bodyBlocks =
    descriptionToHtmlParagraphs(p.description) ||
    `<p style="margin:0;color:#64748b;">(No message body)</p>`;

  const lines = Array.isArray(p.appointmentDetailLines)
    ? p.appointmentDetailLines.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  let detailSection = "";
  if (lines.length > 0) {
    const lis = lines
      .map(
        (line) =>
          `<li style="color:#202124;font-size:14px;font-weight:400;line-height:1.5;margin-bottom:6px;">${escapeHtml(line)}</li>`,
      )
      .join("");
    detailSection = `
      <p style="color:#202124;font-size:14px;font-weight:600;margin:24px 0 8px 0;">Your appointment details</p>
      <ul style="padding-left:22px;margin:0 0 8px 0;">${lis}</ul>`;
  }

  const manageUrl = p.manageUrl ? String(p.manageUrl).trim() : "";
  const ctaBlock = manageUrl ? buildGradientCtaHtml(manageUrl, "View your bookings") : "";

  const contentHtml = `
    <p style="color:#475569;margin:0 0 12px 0;font-size:15px;">Hi ${name},</p>
    ${bodyBlocks}
    ${detailSection}
    ${ctaBlock}`;

  return buildAppointlyEmailDocument({
    headerSubtitle: bizPlain,
    headline: head,
    contentHtml,
    signOffName: bizPlain,
    footerHtml: footerParagraph(
      `You are receiving this because you have an appointment with ${bizPlain} through Appointly.`,
    ),
  });
}

/**
 * Tenant/staff: notify one or more customers (same template; subject + body from tenant).
 * @param {object} p
 * @param {string} p.businessName
 * @param {string} p.subject
 * @param {string} p.description
 * @param {Array<{ email: string, name?: string, appointmentDetailLines?: string[] }>} p.recipients
 * @returns {{ delivered: number, failed: number, skippedNoEmail: number, reason?: string }}
 */
async function sendTenantCustomerBookingNotices(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = String(p.subject || "").trim();
  const description = String(p.description || "").trim();
  const businessName = String(p.businessName || "Business").trim();
  const list = Array.isArray(p.recipients) ? p.recipients : [];

  if (!subject || !description) {
    return {
      delivered: 0,
      failed: 0,
      skippedNoEmail: list.length,
      reason: "missing_subject_or_body",
    };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[booking-notice-email] SMTP not configured — ${list.length} notice(s) not sent`,
    );
    return {
      delivered: 0,
      failed: list.length,
      skippedNoEmail: 0,
      reason: "smtp_not_configured",
    };
  }

  const base = appBaseUrl();
  const manageUrl = `${base}/dashboard/bookings`;

  let delivered = 0;
  let failed = 0;
  let skippedNoEmail = 0;

  for (const r of list) {
    const to = String(r.email || "").trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      skippedNoEmail += 1;
      continue;
    }
    const name = r.name || "there";
    const detailLines = Array.isArray(r.appointmentDetailLines)
      ? r.appointmentDetailLines
      : [];

    const textLines = [
      `Hi ${name},`,
      "",
      subject,
      "",
      description,
      "",
      ...(detailLines.length > 0
        ? ["Your appointment(s):", ...detailLines.map((l) => `• ${l}`), ""]
        : []),
      `Manage bookings: ${manageUrl}`,
      "",
      `— ${businessName}`,
    ];
    const text = textLines.join("\n");

    const html = buildAppointlyCustomerNoticeHtml({
      businessName,
      customerName: name,
      headline: subject,
      description,
      appointmentDetailLines: detailLines,
      manageUrl,
    });

    try {
      await transporter.sendMail({ from, to, subject, text, html });
      delivered += 1;
    } catch (err) {
      failed += 1;
      console.error(`[booking-notice-email] ${to}:`, err.message);
    }
  }

  return { delivered, failed, skippedNoEmail };
}

function appBaseUrl() {
  return (
    process.env.FRONTEND_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

/**
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.customerName
 * @param {object} p.business — name, address, phone, email
 * @param {object} p.service — name
 * @param {object} p.staff — name
 * @param {string} p.dateLabel
 * @param {string} p.startTime
 * @param {string} p.endTime
 * @param {string} p.notes
 * @param {string} p.bookingId
 */
function buildServicesLines(services) {
  const list = Array.isArray(services) ? services.filter(Boolean) : [];
  return list.map((s) => {
    const name = s.name || "Service";
    const dur = Number(s.duration) || 0;
    const bits = [name];
    if (dur > 0) bits.push(`${dur} min`);
    return `• ${bits.join(" · ")}`;
  });
}

function buildServicesHtmlRows(services, currencyCode = "EUR") {
  const code = normalizeCurrency(currencyCode);
  const list = Array.isArray(services) ? services.filter(Boolean) : [];
  if (list.length === 0) return "";
  const rows = list
    .map((s) => {
      const name = escapeHtml(s.name || "Service");
      const dur = Number(s.duration) || 0;
      const price = Number(s.price) || 0;
      const money = escapeHtml(formatMoneyAmount(price, code));
      return `<li style="margin:2px 0;">${name} <span style="color:#94a3b8;">· ${escapeHtml(String(dur))} min · ${money}</span></li>`;
    })
    .join("");
  return `<ul style="margin:4px 0 0 0;padding-left:18px;">${rows}</ul>`;
}

async function sendBookingConfirmedCustomerEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = `Booking confirmed — ${p.business?.name || "Your appointment"}`;
  const base = appBaseUrl();
  const manageUrl = `${base}/dashboard/bookings`;
  const currency = normalizeCurrency(p.currency);

  const servicesArr = Array.isArray(p.services) ? p.services : [];
  const hasMulti = servicesArr.length > 1;
  const serviceLines = buildServicesLines(servicesArr);
  const serviceSingleName = servicesArr[0]?.name || p.service?.name || "";
  const totalPriceLabel =
    p.totalPrice != null && Number.isFinite(Number(p.totalPrice))
      ? formatMoneyAmount(p.totalPrice, currency)
      : "";

  const text = [
    `Hi ${p.customerName},`,
    "",
    `Your appointment is confirmed.`,
    "",
    hasMulti ? `Services:` : `Service: ${serviceSingleName}`,
    ...(hasMulti ? serviceLines : []),
    hasMulti && p.totalDuration
      ? `Total: ${p.totalDuration} min${totalPriceLabel ? ` · ${totalPriceLabel}` : ""}`
      : "",
    `Staff: ${p.staff?.name || ""}`,
    `When: ${p.dateLabel} at ${p.startTime} – ${p.endTime}`,
    `Location: ${p.business?.address || "See business profile"}`,
    p.notes ? `Notes: ${p.notes}` : "",
    "",
    `Manage or reschedule: ${manageUrl}`,
    "",
    "Thank you for using Appointly.",
  ]
    .filter(Boolean)
    .join("\n");

  const serviceCellHtml = hasMulti
    ? `${buildServicesHtmlRows(servicesArr, currency)}<div style="margin-top:6px;color:#475569;font-size:13px;">Total: ${escapeHtml(String(p.totalDuration || 0))} min${totalPriceLabel ? ` · <strong>${escapeHtml(totalPriceLabel)}</strong>` : ""}</div>`
    : escapeHtml(serviceSingleName);

  const bizName = String(p.business?.name || "Your appointment").trim();
  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(p.customerName)},</p>
    <p style="margin:0 0 14px 0;"><strong>Your appointment is confirmed.</strong></p>
    <table style="border-collapse:collapse;font-size:14px;color:#334155;max-width:480px;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">${hasMulti ? "Services" : "Service"}</td><td>${serviceCellHtml}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Staff</td><td>${escapeHtml(p.staff?.name || "")}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td>${escapeHtml(p.dateLabel)} · ${escapeHtml(p.startTime)} – ${escapeHtml(p.endTime)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Location</td><td>${escapeHtml(p.business?.address || "—")}</td></tr>
      ${p.notes ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Notes</td><td>${escapeHtml(p.notes)}</td></tr>` : ""}
    </table>
    ${buildGradientCtaHtml(manageUrl, "View in your dashboard")}`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: bizName,
    headline: "Booking confirmed",
    contentHtml,
    signOffName: bizName,
    footerHtml: footerParagraph(
      "You're receiving this because you made a booking through Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[booking-email] SMTP not configured — customer confirmation not sent to ${p.to}`);
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[booking-email] customer send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * @param {object} p
 * @param {string} p.to — business notification email
 * @param {string} p.businessName
 * @param {object} p.customer — name, email, phone
 * @param {object} p.service
 * @param {object} p.staff
 * @param {string} p.dateLabel
 * @param {string} p.startTime
 * @param {string} p.endTime
 * @param {string} p.notes
 * @param {string} p.bookingId
 */
async function sendBookingConfirmedBusinessEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = `New booking — ${p.customer?.name || "Customer"} — ${p.dateLabel}`;
  const currency = normalizeCurrency(p.currency);

  const servicesArr = Array.isArray(p.services) ? p.services : [];
  const hasMulti = servicesArr.length > 1;
  const serviceLines = buildServicesLines(servicesArr);
  const serviceSingleName = servicesArr[0]?.name || p.service?.name || "";
  const totalPriceLabel =
    p.totalPrice != null && Number.isFinite(Number(p.totalPrice))
      ? formatMoneyAmount(p.totalPrice, currency)
      : "";

  const text = [
    `New booking for ${p.businessName}`,
    "",
    `Customer: ${p.customer?.name || ""} (${p.customer?.email || ""})`,
    p.customer?.phone ? `Phone: ${p.customer.phone}` : "",
    hasMulti ? `Services:` : `Service: ${serviceSingleName}`,
    ...(hasMulti ? serviceLines : []),
    hasMulti && p.totalDuration
      ? `Total: ${p.totalDuration} min${totalPriceLabel ? ` · ${totalPriceLabel}` : ""}`
      : "",
    `Staff: ${p.staff?.name || ""}`,
    `When: ${p.dateLabel} at ${p.startTime} – ${p.endTime}`,
    p.notes ? `Customer notes: ${p.notes}` : "",
    "",
    `Booking id: ${p.bookingId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const serviceCellHtml = hasMulti
    ? `${buildServicesHtmlRows(servicesArr, currency)}<div style="margin-top:6px;color:#475569;font-size:13px;">Total: ${escapeHtml(String(p.totalDuration || 0))} min${totalPriceLabel ? ` · <strong>${escapeHtml(totalPriceLabel)}</strong>` : ""}</div>`
    : escapeHtml(serviceSingleName);

  const contentHtml = `
    <p style="margin:0 0 14px 0;"><strong>New booking</strong> — ${escapeHtml(p.businessName)}</p>
    <table style="border-collapse:collapse;font-size:14px;color:#334155;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Customer</td><td>${escapeHtml(p.customer?.name || "")} &lt;${escapeHtml(p.customer?.email || "")}&gt;</td></tr>
      ${p.customer?.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Phone</td><td>${escapeHtml(p.customer.phone)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">${hasMulti ? "Services" : "Service"}</td><td>${serviceCellHtml}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Staff</td><td>${escapeHtml(p.staff?.name || "")}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td>${escapeHtml(p.dateLabel)} · ${escapeHtml(p.startTime)} – ${escapeHtml(p.endTime)}</td></tr>
      ${p.notes ? `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;">Notes</td><td>${escapeHtml(p.notes)}</td></tr>` : ""}
    </table>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: p.businessName,
    headline: "New booking",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because you manage a business on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[booking-email] SMTP not configured — business notification not sent to ${p.to}`);
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[booking-email] business send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Tenant: appointment was cancelled (customer or business side).
 */
async function sendBookingCancelledBusinessEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const who =
    p.cancelledBy === "customer" ? "Customer cancelled" : "Booking cancelled";
  const subject = `${who} — ${p.businessName || "Your business"}`;
  const text = [
    `A booking was cancelled for ${p.businessName || "your business"}.`,
    "",
    `Customer: ${p.customer?.name || ""} (${p.customer?.email || ""})`,
    p.customer?.phone ? `Phone: ${p.customer.phone}` : "",
    p.serviceName ? `Service: ${p.serviceName}` : "",
    p.staffName ? `Staff: ${p.staffName}` : "",
    `Was scheduled: ${p.dateLabel} at ${p.startTime} – ${p.endTime}`,
    "",
    `Booking id: ${p.bookingId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const contentHtml = `
    <p style="margin:0 0 14px 0;"><strong>${escapeHtml(who)}</strong> — ${escapeHtml(p.businessName || "your business")}</p>
    <table style="border-collapse:collapse;font-size:14px;color:#334155;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Customer</td><td>${escapeHtml(p.customer?.name || "")} &lt;${escapeHtml(p.customer?.email || "")}&gt;</td></tr>
      ${p.customer?.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Phone</td><td>${escapeHtml(p.customer.phone)}</td></tr>` : ""}
      ${p.serviceName ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Service</td><td>${escapeHtml(p.serviceName)}</td></tr>` : ""}
      ${p.staffName ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Staff</td><td>${escapeHtml(p.staffName)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td>${escapeHtml(p.dateLabel)} · ${escapeHtml(p.startTime)} – ${escapeHtml(p.endTime)}</td></tr>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:14px;">Booking id: ${escapeHtml(p.bookingId)}</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: p.businessName || "Your business",
    headline: who,
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because you manage a business on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[booking-email] SMTP not configured — cancellation notice not sent to ${p.to}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[booking-email] cancellation send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Tenant: a customer left a new public review.
 */
async function sendNewReviewBusinessEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const staffBit =
    p.isStaffReview && p.staffName
      ? ` (staff: ${p.staffName})`
      : p.isStaffReview
        ? " (staff review)"
        : "";
  const subject = `New review (${p.rating}/5)${staffBit} — ${p.businessName || "Your business"}`;
  const dash = `${appBaseUrl()}/dashboard/reviews`;
  const visibilityNote = p.isStaffReview
    ? "This is a private staff review (only visible in your dashboard, not on your public page)."
    : "";
  const text = [
    `${p.customerName || "A customer"} left a ${p.rating}-star review for ${p.businessName || "your business"}${staffBit}.`,
    visibilityNote,
    "",
    `Preview: ${p.excerpt || ""}`,
    "",
    `Open reviews: ${dash}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const staffLine =
    p.isStaffReview && p.staffName
      ? `<p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">About: <strong>${escapeHtml(p.staffName)}</strong> — visible only to you in the dashboard, not on your public listing.</p>`
      : p.isStaffReview
        ? `<p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">Staff review — visible only to you in the dashboard.</p>`
        : "";

  const contentHtml = `
    <p style="margin:0 0 8px 0;">${escapeHtml(p.customerName || "A customer")} rated you <strong>${escapeHtml(String(p.rating))}/5</strong>.</p>
    ${staffLine}
    <blockquote style="margin:12px 0;padding:12px 14px;background:#f8fafc;border-radius:10px;border-left:4px solid #4f46e5;font-size:14px;color:#334155;">
      ${escapeHtml(p.excerpt || "")}
    </blockquote>
    ${buildGradientCtaHtml(dash, "View in dashboard")}`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: p.businessName || "Reviews",
    headline: "New review",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because you manage a business on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[booking-email] SMTP not configured — new review alert not sent to ${p.to}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[booking-email] new review send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Scheduled digest: today's appointments (tenant).
 */
async function sendTenantDailySummaryEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = `Today’s schedule — ${p.businessName || "Your business"}`;
  const bodyLines =
    p.lines && p.lines.length > 0
      ? p.lines.join("\n")
      : "No appointments on the calendar for this date.";
  const text = [
    `Hi,`,
    "",
    `Here is your schedule for ${p.dateLabel} (${p.businessName || "your business"}):`,
    "",
    bodyLines,
    "",
    `— Appointly`,
  ].join("\n");

  const listHtml =
    p.lines && p.lines.length > 0
      ? `<ul style="margin:8px 0;padding-left:20px;line-height:1.5;">${p.lines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul>`
      : `<p style="color:#64748b;">No appointments on the calendar for this date.</p>`;

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Here is your schedule for <strong>${escapeHtml(p.dateLabel)}</strong> — ${escapeHtml(p.businessName || "your business")}.</p>
    ${listHtml}
    <p style="color:#94a3b8;font-size:12px;margin:12px 0 0 0;">${escapeHtml(String(p.bookingCount || 0))} appointment(s) listed.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: p.businessName || "Schedule",
    headline: "Today's schedule",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this digest because you enabled notifications for your business on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[digest-email] SMTP not configured — daily summary not sent to ${p.to}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[digest-email] daily summary failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Scheduled digest: last week’s volume (tenant).
 */
async function sendTenantWeeklyReportEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = `Weekly report — ${p.businessName || "Your business"}`;
  const text = [
    `Weekly summary (${p.periodLabel}) for ${p.businessName || "your business"}:`,
    "",
    `Completed / active bookings (excl. cancelled): ${p.bookingCount}`,
    `Revenue (booking totals): ${p.revenueLabel}`,
    `New reviews: ${p.newReviewsCount}`,
    "",
    `— Appointly`,
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">${escapeHtml(p.businessName || "Your business")}</p>
    <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">${escapeHtml(p.periodLabel)}</p>
    <table style="border-collapse:collapse;font-size:14px;color:#334155;margin-top:12px;">
      <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Bookings</td><td><strong>${escapeHtml(String(p.bookingCount))}</strong> <span style="color:#94a3b8;">(non-cancelled)</span></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Revenue</td><td><strong>${escapeHtml(p.revenueLabel)}</strong></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#64748b;">New reviews</td><td><strong>${escapeHtml(String(p.newReviewsCount))}</strong></td></tr>
    </table>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: p.businessName || "Reports",
    headline: "Weekly summary",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this report because you manage a business on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[digest-email] SMTP not configured — weekly report not sent to ${p.to}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[digest-email] weekly report failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Guest checkout: send generated password so they can sign in and change it later.
 */
async function sendGuestBookingCredentialsEmail(to, name, plainPassword) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = "Your Appointly account & booking";
  const loginUrl = `${appBaseUrl()}/sign-in`;
  const text = [
    `Hi ${name},`,
    "",
    "We created an account for you so you could book without registering first.",
    "",
    `Sign-in email: ${to}`,
    `Temporary password: ${plainPassword}`,
    "",
    `Sign in here: ${loginUrl}`,
    "",
    "You can change your password anytime in your profile after you sign in.",
    "",
    "If you did not make this booking, contact support.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px 0;">We created an <strong>Appointly account</strong> for you so you could book without filling out the full registration form.</p>
    <p style="margin:0 0 14px 0;"><strong>Your sign-in email:</strong> ${escapeHtml(to)}<br/>
    <strong>Temporary password:</strong> <code style="font-size:15px;padding:4px 8px;background:#f1f5f9;border-radius:6px;">${escapeHtml(plainPassword)}</code></p>
    ${buildGradientCtaHtml(loginUrl, "Sign in")}
    <p style="color:#64748b;font-size:13px;margin:16px 0 0 0;">Then change your password under your profile whenever you like.</p>
    <p style="color:#94a3b8;font-size:13px;margin:10px 0 0 0;">If you didn’t request this, you can ignore this email or contact the business.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: "Your account",
    headline: "Your Appointly account & booking",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because a booking was made with your email on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[guest-email] SMTP not configured — guest password for ${to}: ${plainPassword}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[guest-email] send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

function formatClosingRangeForEmail(startsAt, endsAt) {
  const a = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const b = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const opts = { dateStyle: "medium", timeStyle: "short" };
  return `${a.toLocaleString(undefined, opts)} – ${b.toLocaleString(undefined, opts)}`;
}

/**
 * Notify past customers of this business that a new closing period was scheduled.
 * @param {object} p
 * @param {string} p.businessName
 * @param {string} [p.businessSlug] — public profile path /book/:slug
 * @param {Date|string} p.startsAt
 * @param {Date|string} p.endsAt
 * @param {string} p.reason
 * @param {Array<{ email: string; name: string }>} p.recipients
 */
async function sendClosingPeriodEmailsToCustomers(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const recipients = Array.isArray(p.recipients) ? p.recipients : [];
  if (recipients.length === 0) {
    return { delivered: 0, skipped: 0, reason: "no_recipients" };
  }

  const rangeLabel = formatClosingRangeForEmail(p.startsAt, p.endsAt);
  const reasonText = String(p.reason || "").trim() || "Not specified";
  const bizName = String(p.businessName || "A business").trim();
  const base = appBaseUrl();
  const profilePath = p.businessSlug
    ? `${base}/book/${encodeURIComponent(String(p.businessSlug).trim().toLowerCase())}`
    : base;

  const subject = `${bizName} — Scheduled closure (new bookings paused)`;

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[closing-email] SMTP not configured — ${recipients.length} closing notice(s) not sent`,
    );
    return { delivered: 0, skipped: recipients.length, reason: "smtp_not_configured" };
  }

  let delivered = 0;
  for (const r of recipients) {
    const name = r.name || "there";
    const text = [
      `Hi ${name},`,
      "",
      `${bizName} will not accept new online bookings during this period:`,
      "",
      `When: ${rangeLabel}`,
      "",
      `Reason: ${reasonText}`,
      "",
      "Existing appointments you already have are not cancelled by this notice. If you have questions, contact the business directly.",
      "",
      `Business page: ${profilePath}`,
      "",
      "Thank you for using Appointly.",
    ].join("\n");

    const rangeHtml = escapeHtml(rangeLabel);
    const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px 0;"><strong>${escapeHtml(bizName)}</strong> will not accept <strong>new online bookings</strong> during this period:</p>
    <p style="margin:12px 0;padding:12px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:14px;color:#0f172a;">
      <strong>When:</strong> ${rangeHtml}<br/>
      <strong>Reason:</strong> ${escapeHtml(reasonText)}
    </p>
    <p style="font-size:14px;color:#475569;margin:0 0 14px 0;">Existing appointments you already have are <strong>not</strong> cancelled by this notice.</p>
    ${buildGradientCtaHtml(profilePath, "View business page")}`;

    const html = buildAppointlyEmailDocument({
      headerSubtitle: bizName,
      headline: "Scheduled closure",
      contentHtml,
      signOffName: bizName,
      footerHtml: footerParagraph(
        "This message was sent because you have booked with this business on Appointly before.",
      ),
    });

    try {
      await transporter.sendMail({
        from,
        to: r.email,
        subject,
        text,
        html,
      });
      delivered += 1;
    } catch (err) {
      console.error(`[closing-email] send failed for ${r.email}:`, err.message);
    }
  }

  return { delivered, skipped: recipients.length - delivered };
}

/**
 * Bulk email to customers who have booked this business (tenant broadcast).
 * @returns {{ delivered: number, failed: number, reason?: string }}
 */
async function sendCustomerBroadcastEmails({
  businessName,
  subject,
  description,
  recipients,
}) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const list = Array.isArray(recipients) ? recipients : [];
  if (list.length === 0) {
    return { delivered: 0, failed: 0 };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[broadcast-email] SMTP not configured — ${list.length} message(s) not sent`,
    );
    return {
      delivered: 0,
      failed: list.length,
      reason: "smtp_not_configured",
    };
  }

  let delivered = 0;
  let failed = 0;
  const biz = String(businessName || "Business").trim();

  for (const r of list) {
    const name = r.name || "there";
    const text = [`Hi ${name},`, "", description, "", `— ${biz}`].join("\n");
    const bodyBlocks =
      descriptionToHtmlParagraphs(description) ||
      `<p style="margin:0;color:#64748b;">(No message)</p>`;
    const contentHtml = `
    <p style="color:#475569;margin:0 0 12px 0;font-size:15px;">Hi ${escapeHtml(name)},</p>
    ${bodyBlocks}
    <p style="margin-top:18px;color:#64748b;font-size:14px;">— ${escapeHtml(biz)}</p>`;

    const html = buildAppointlyEmailDocument({
      headerSubtitle: biz,
      headline: String(subject).trim(),
      contentHtml,
      signOffName: biz,
      footerHtml: footerParagraph(
        "You received this because you booked with this business on Appointly.",
      ),
    });
    try {
      await transporter.sendMail({
        from,
        to: r.email,
        subject: String(subject).trim(),
        text,
        html,
      });
      delivered += 1;
    } catch (err) {
      failed += 1;
      console.error(`[broadcast-email] ${r.email}:`, err.message);
    }
  }

  return { delivered, failed };
}

/**
 * Tenant sends a discount code to an arbitrary email.
 */
async function sendCouponOfferEmail({
  to,
  businessName,
  code,
  discountPercent,
  validFrom,
  validTo,
  bookUrl,
}) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = `${String(businessName || "A business").trim()} — your ${discountPercent}% off code`;
  const fmt = (iso) => {
    try {
      const [y, m, d] = String(iso).split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        dateStyle: "medium",
      });
    } catch {
      return iso;
    }
  };
  const text = [
    `You've received a booking discount from ${businessName}.`,
    "",
    `Code: ${code}`,
    `Discount: ${discountPercent}% off the appointment price`,
    `Valid: ${fmt(validFrom)} – ${fmt(validTo)} (appointment date must fall in this range)`,
    "",
    `Book here: ${bookUrl}`,
    "",
    "Enter the code at checkout in the booking flow.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 14px 0;">You&apos;ve received a booking discount from <strong>${escapeHtml(businessName)}</strong>.</p>
    <p style="font-size:22px;font-weight:800;letter-spacing:0.06em;color:#4f46e5;margin:0 0 12px 0;">${escapeHtml(code)}</p>
    <p style="margin:0 0 8px 0;"><strong>${escapeHtml(String(discountPercent))}% off</strong> the appointment price (after any service sale price).</p>
    <p style="color:#64748b;font-size:14px;margin:0 0 16px 0;">Valid ${escapeHtml(fmt(validFrom))} – ${escapeHtml(fmt(validTo))}. Your appointment date must fall in this range.</p>
    ${buildGradientCtaHtml(bookUrl, "Open booking page")}
    <p style="color:#94a3b8;font-size:12px;margin:14px 0 0 0;">Enter this code when you review your booking.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: String(businessName || "Offer").trim(),
    headline: "Your discount code",
    contentHtml,
    signOffName: String(businessName || "Appointly").trim(),
    footerHtml: footerParagraph(
      "You're receiving this offer from a business you use on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[coupon-email] SMTP not configured — coupon ${code} for ${to} not sent`);
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[coupon-email] send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Automated "How was your visit?" email sent ~2h after an appointment ends.
 * Deep-links the customer back to the business page with ?review=1 so the
 * review modal opens automatically (and the auth prompt shows if signed out).
 *
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.customerName
 * @param {string} p.businessName
 * @param {string} [p.businessSlug]
 * @param {string} p.dateLabel
 * @param {string} [p.serviceLabel]
 * @param {string} [p.staffName]
 * @param {string} p.bookingId
 */
async function sendReviewRequestEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const bizName = String(p.businessName || "the business").trim();
  const subject = `How was your visit to ${bizName}?`;
  const base = appBaseUrl();
  const reviewUrl = p.businessSlug
    ? `${base}/book/${encodeURIComponent(String(p.businessSlug).trim().toLowerCase())}?review=1`
    : `${base}/dashboard/bookings`;

  const serviceLabel = String(p.serviceLabel || "").trim();
  const staffName = String(p.staffName || "").trim();

  const text = [
    `Hi ${p.customerName || "there"},`,
    "",
    `Thanks for choosing ${bizName} on ${p.dateLabel}${staffName ? ` with ${staffName}` : ""}${serviceLabel ? ` for ${serviceLabel}` : ""}.`,
    "",
    "If you have a moment, we'd love to hear how it went. Your feedback helps the business improve and helps other customers choose with confidence.",
    "",
    `Leave a review: ${reviewUrl}`,
    "",
    "It only takes a minute — just pick a star rating and leave a short note.",
    "",
    "Thank you,",
    "Appointly",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(p.customerName || "there")},</p>
    <p style="margin:0 0 14px 0;">Thanks for choosing <strong>${escapeHtml(bizName)}</strong> on <strong>${escapeHtml(p.dateLabel)}</strong>${staffName ? ` with <strong>${escapeHtml(staffName)}</strong>` : ""}${serviceLabel ? ` for <strong>${escapeHtml(serviceLabel)}</strong>` : ""}.</p>
    <p style="font-size:14px;color:#334155;margin:0 0 14px 0;">We'd love to hear how it went. Your feedback helps the business improve — and helps other customers choose with confidence.</p>
    ${buildGradientCtaHtml(reviewUrl, "Leave a review")}
    <p style="font-size:13px;color:#64748b;margin:14px 0 0 0;">It only takes a minute — just pick a star rating and leave a short note.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: bizName,
    headline: "How was your visit?",
    contentHtml,
    signOffName: bizName,
    footerHtml: footerParagraph(
      "You're receiving this because you recently had an appointment booked through Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[review-request-email] SMTP not configured — review request not sent to ${p.to}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[review-request-email] send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Automated appointment reminder email (24h or 2h before start).
 *
 * @param {object} p
 * @param {"24h"|"2h"} p.window
 * @param {string} p.to
 * @param {string} p.customerName
 * @param {string} p.businessName
 * @param {string} [p.businessAddress]
 * @param {string} [p.businessSlug]
 * @param {string} p.dateLabel
 * @param {string} p.startTime
 * @param {string} [p.endTime]
 * @param {string} [p.serviceLabel]
 * @param {string} [p.staffName]
 * @param {string} p.bookingId
 */
async function sendAppointmentReminderEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const base = appBaseUrl();
  const manageUrl = `${base}/dashboard/bookings`;
  const bizName = String(p.businessName || "your appointment").trim();
  const is24h = p.window === "24h";

  const subject = is24h
    ? `Reminder: your appointment at ${bizName} tomorrow at ${p.startTime}`
    : `Heads up — your ${bizName} appointment is in 2 hours`;

  const whenHeadline = is24h
    ? `You have an appointment tomorrow (${p.dateLabel}) at ${p.startTime}${p.endTime ? ` – ${p.endTime}` : ""}.`
    : `Your appointment is coming up at ${p.startTime}${p.endTime ? ` – ${p.endTime}` : ""} today (${p.dateLabel}).`;

  const serviceLabel = String(p.serviceLabel || "").trim();
  const staffName = String(p.staffName || "").trim();
  const address = String(p.businessAddress || "").trim();

  const textLines = [
    `Hi ${p.customerName || "there"},`,
    "",
    whenHeadline,
    "",
    `Business: ${bizName}`,
    serviceLabel ? `Service: ${serviceLabel}` : "",
    staffName ? `With: ${staffName}` : "",
    address ? `Location: ${address}` : "",
    "",
    is24h
      ? "If you need to reschedule or cancel, please do it today so we can offer the slot to someone else."
      : "Please arrive a few minutes early. If you can't make it, let the business know right away.",
    "",
    `Manage your booking: ${manageUrl}`,
    "",
    "— Appointly",
  ].filter(Boolean);
  const text = textLines.join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(p.customerName || "there")},</p>
    <p style="margin:0 0 14px 0;"><strong>${escapeHtml(whenHeadline)}</strong></p>
    <table style="border-collapse:collapse;font-size:14px;color:#334155;max-width:480px;margin:14px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Business</td><td>${escapeHtml(bizName)}</td></tr>
      ${serviceLabel ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Service</td><td>${escapeHtml(serviceLabel)}</td></tr>` : ""}
      ${staffName ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">With</td><td>${escapeHtml(staffName)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td>${escapeHtml(p.dateLabel)} · ${escapeHtml(p.startTime)}${p.endTime ? ` – ${escapeHtml(p.endTime)}` : ""}</td></tr>
      ${address ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Location</td><td>${escapeHtml(address)}</td></tr>` : ""}
    </table>
    <p style="font-size:13.5px;color:#475569;margin:0 0 16px 0;">
      ${
        is24h
          ? "If you need to reschedule or cancel, please do it today so we can offer the slot to someone else."
          : "Please arrive a few minutes early. If you can't make it, let the business know right away."
      }
    </p>
    ${buildGradientCtaHtml(manageUrl, "Manage booking")}`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: bizName,
    headline: is24h ? "Appointment reminder" : "Your appointment soon",
    contentHtml,
    signOffName: bizName,
    footerHtml: footerParagraph(
      "You're receiving this reminder for a booking you made on Appointly.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[reminder-email] SMTP not configured — ${p.window} reminder not sent to ${p.to}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error(
      `[reminder-email] ${p.window} send failed:`,
      err.message,
    );
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

/**
 * Customer — waitlist: a previously full slot opened after a cancellation.
 * @param {object} p — to, customerName, businessName, businessSlug, token, dateLabel, startTime
 */
async function sendWaitlistSlotOfferEmail(p) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const base = appBaseUrl();
  const bookUrl = `${base}/book/${encodeURIComponent(p.businessSlug)}?waitlist=${encodeURIComponent(p.token)}`;
  const bizPlain = String(p.businessName || "Business").trim();
  const subject = `A time you wanted may be open — ${bizPlain}`;
  const customerName = String(p.customerName || "there").trim();

  const text = [
    `Hi ${customerName},`,
    "",
    `A spot you were waiting for at ${bizPlain} may be available again.`,
    `Date: ${p.dateLabel} at ${p.startTime}.`,
    "",
    `Continue booking (link expires in about 24 hours):`,
    bookUrl,
    "",
    "If someone else books it first, you can choose another time from their booking page.",
    "",
    "Thank you for using Appointly.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(customerName)},</p>
    <p style="margin:0 0 14px 0;color:#334155;font-size:15px;line-height:1.5;">A time you joined the waitlist for at <strong>${escapeHtml(bizPlain)}</strong> may be open again: <strong>${escapeHtml(p.dateLabel)}</strong> at <strong>${escapeHtml(p.startTime)}</strong>.</p>
    <p style="margin:0 0 18px 0;color:#64748b;font-size:14px;line-height:1.45;">This link is for you and expires in about 24 hours.</p>
    ${buildGradientCtaHtml(bookUrl, "Continue booking")}`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: bizPlain,
    headline: "A slot may be available",
    contentHtml,
    signOffName: bizPlain,
    footerHtml: footerParagraph(
      "You asked to be notified on Appointly when this appointment time might open.",
    ),
  });

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[waitlist-offer-email] SMTP not configured — not sent to ${p.to}`,
    );
    return;
  }
  try {
    await transporter.sendMail({ from, to: p.to, subject, text, html });
  } catch (err) {
    console.error("[waitlist-offer-email]", err.message);
  }
}

module.exports = {
  sendBookingConfirmedCustomerEmail,
  sendBookingConfirmedBusinessEmail,
  sendBookingCancelledBusinessEmail,
  sendNewReviewBusinessEmail,
  sendTenantDailySummaryEmail,
  sendTenantWeeklyReportEmail,
  sendGuestBookingCredentialsEmail,
  sendClosingPeriodEmailsToCustomers,
  sendCustomerBroadcastEmails,
  sendCouponOfferEmail,
  sendReviewRequestEmail,
  sendAppointmentReminderEmail,
  sendTenantCustomerBookingNotices,
  sendWaitlistSlotOfferEmail,
};
