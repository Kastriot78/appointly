const nodemailer = require("nodemailer");
const {
  escapeHtml,
  buildGradientCtaHtml,
  buildAppointlyEmailDocument,
  footerParagraph,
} = require("./emailLayout.service");

/**
 * Supports both names: SMTP_* (standard) and EMAIL_* (common in tutorials).
 * You MUST set a host (e.g. smtp.gmail.com) — user/password alone are not enough.
 */
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
    service: "gmail",
    auth:
      user && pass
        ? {
            user,
            pass,
          }
        : undefined,
  });
}

/**
 * Sends verification OTP. If SMTP is not configured, logs the code (dev only).
 */
async function sendVerificationEmail(to, name, code) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = "Your Appointly verification code";
  const text = [
    `Hi ${name},`,
    "",
    `Your verification code is: ${code}`,
    "It expires in 1 hour.",
    "",
    "If you did not create an account, you can ignore this email.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 8px 0;">Your verification code is:</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px;margin:0 0 14px 0;color:#4f46e5;">${escapeHtml(code)}</p>
    <p style="margin:0 0 8px 0;">This code expires in <strong>1 hour</strong>.</p>
    <p style="color:#64748b;font-size:14px;margin:0;">If you did not create an account, you can ignore this email.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: "Your account",
    headline: "Your verification code",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because someone used this email to sign up for Appointly.",
    ),
  });

  const transporter = getTransporter();
  const { host } = resolveSmtpEnv();

  if (!transporter) {
    const hint = host
      ? ""
      : " Set SMTP_HOST (e.g. smtp.gmail.com for Gmail). EMAIL_USER/EMAIL_PASS are read, but host is required.";
    console.warn(
      `[email] SMTP not configured — verification code for ${to}: ${code}.${hint}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error("[email] send failed:", err.message);
    return {
      delivered: false,
      reason: "send_failed",
      error: err.message,
    };
  }
}

/**
 * Sends 6-digit code to the *new* address when changing account email.
 */
async function sendEmailChangeCode(to, name, code) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = "Confirm your new Appointly email";
  const text = [
    `Hi ${name},`,
    "",
    `Use this code to confirm your new email address: ${code}`,
    "It expires in 1 hour.",
    "",
    "Your sign-in email will not change until you enter this code in Appointly.",
    "",
    "If you did not request this change, sign in and cancel the pending email in Profile.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 8px 0;">Use this code to confirm your <strong>new</strong> email address:</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px;margin:0 0 14px 0;color:#4f46e5;">${escapeHtml(code)}</p>
    <p style="margin:0 0 8px 0;">This code expires in <strong>1 hour</strong>.</p>
    <p style="color:#64748b;font-size:14px;margin:0 0 8px 0;">Your sign-in email stays the same until you confirm.</p>
    <p style="color:#64748b;font-size:14px;margin:0;">If you did not request this, cancel the change in Profile → General.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: "Your account",
    headline: "Confirm your new email",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because a new email was added to your Appointly account.",
    ),
  });

  const transporter = getTransporter();
  const { host } = resolveSmtpEnv();

  if (!transporter) {
    const hint = host
      ? ""
      : " Set SMTP_HOST (e.g. smtp.gmail.com for Gmail). EMAIL_USER/EMAIL_PASS are read, but host is required.";
    console.warn(
      `[email] SMTP not configured — email change code for ${to}: ${code}.${hint}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error("[email] send failed:", err.message);
    return {
      delivered: false,
      reason: "send_failed",
      error: err.message,
    };
  }
}

/**
 * Password reset link (token is single-use; stored hashed on user).
 */
async function sendPasswordResetEmail(to, name, resetUrl) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = "Reset your Appointly password";
  const text = [
    `Hi ${name},`,
    "",
    "We received a request to reset your Appointly password.",
    "",
    `Open this link (valid for 1 hour):`,
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px 0;">We received a request to reset your <strong>Appointly</strong> password.</p>
    ${buildGradientCtaHtml(resetUrl, "Reset password")}
    <p style="color:#64748b;font-size:14px;margin:16px 0 8px 0;">This link expires in <strong>1 hour</strong>. If you did not request this, you can ignore this email.</p>
    <p style="color:#94a3b8;font-size:12px;word-break:break-all;margin:0;">${escapeHtml(resetUrl)}</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: "Your account",
    headline: "Reset your password",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because a password reset was requested for your Appointly account.",
    ),
  });

  const transporter = getTransporter();
  const { host } = resolveSmtpEnv();

  if (!transporter) {
    console.warn(
      `[email] SMTP not configured — password reset link for ${to}: ${resetUrl}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error("[email] password reset send failed:", err.message);
    return {
      delivered: false,
      reason: "send_failed",
      error: err.message,
    };
  }
}

/**
 * Sends a 2FA (login / enable / disable) 6-digit code.
 */
async function sendTwoFactorEmail(to, name, code, purpose) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';

  const intro =
    purpose === "enable"
      ? "Use this code to turn on two-factor authentication on your account:"
      : purpose === "disable"
        ? "Use this code to turn off two-factor authentication:"
        : "Use this code to finish signing in:";

  const subject =
    purpose === "enable"
      ? "Confirm two-factor authentication setup"
      : purpose === "disable"
        ? "Confirm turning off two-factor authentication"
        : "Your Appointly sign-in code";

  const text = [
    `Hi ${name},`,
    "",
    intro,
    `Code: ${code}`,
    "It expires in 10 minutes.",
    "",
    "If you did not request this, you can ignore this email and consider changing your password.",
  ].join("\n");

  const head =
    purpose === "enable"
      ? "Confirm two-factor setup"
      : purpose === "disable"
        ? "Confirm turning off 2FA"
        : "Your sign-in code";

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 8px 0;">${escapeHtml(intro)}</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px;margin:0 0 14px 0;color:#4f46e5;">${escapeHtml(code)}</p>
    <p style="margin:0 0 8px 0;">This code expires in <strong>10 minutes</strong>.</p>
    <p style="color:#64748b;font-size:14px;margin:0;">If you did not request this, ignore this email and consider changing your password.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: "Security",
    headline: head,
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because of a security-related action on your Appointly account.",
    ),
  });

  const transporter = getTransporter();
  const { host } = resolveSmtpEnv();

  if (!transporter) {
    const hint = host
      ? ""
      : " Set SMTP_HOST (e.g. smtp.gmail.com for Gmail). EMAIL_USER/EMAIL_PASS are read, but host is required.";
    console.warn(
      `[email] SMTP not configured — 2FA (${purpose || "login"}) code for ${to}: ${code}.${hint}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[email] 2FA send failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
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
 * Notifies the tenant when an admin approves their business listing.
 * Fire-and-forget from the controller; failures are logged only.
 */
async function sendBusinessApprovedEmail(
  to,
  tenantName,
  businessName,
  publicProfileUrl,
) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const safeName = escapeHtml(businessName);
  const subject = `Your business “${businessName}” is approved on Appointly`;
  const text = [
    `Hi ${tenantName},`,
    "",
    `Good news — your business "${businessName}" has been approved and is now visible to customers on Appointly.`,
    "",
    publicProfileUrl
      ? `View your public page: ${publicProfileUrl}`
      : "",
    "",
    `Open your dashboard: ${appBaseUrl()}/dashboard`,
    "",
    "Thank you for using Appointly.",
  ]
    .filter(Boolean)
    .join("\n");

  const dashUrl = `${appBaseUrl()}/dashboard`;
  const profileCta = publicProfileUrl
    ? `${buildGradientCtaHtml(publicProfileUrl, "View public page")}
       <p style="color:#94a3b8;font-size:12px;word-break:break-all;margin:8px 0 0 0;">${escapeHtml(publicProfileUrl)}</p>`
    : "";

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(tenantName)},</p>
    <p style="margin:0 0 16px 0;">Good news — your business <strong>${safeName}</strong> has been <strong>approved</strong> and is now visible to customers on Appointly.</p>
    ${profileCta}
    ${buildGradientCtaHtml(dashUrl, "Open your dashboard")}`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: businessName,
    headline: "You're approved",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because your business listing was reviewed on Appointly.",
    ),
  });

  const transporter = getTransporter();
  const { host } = resolveSmtpEnv();

  if (!transporter) {
    console.warn(
      `[email] SMTP not configured — would notify ${to} that "${businessName}" was approved.`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error("[email] business approved notify failed:", err.message);
    return {
      delivered: false,
      reason: "send_failed",
      error: err.message,
    };
  }
}

/**
 * Invite a staff member to create their own dashboard login.
 */
async function sendStaffDashboardInviteEmail({
  to,
  businessName,
  staffName,
  inviteUrl,
}) {
  const from =
    process.env.EMAIL_FROM || '"Appointly" <noreply@appointly.local>';
  const subject = `You’re invited to the ${businessName || "business"} team dashboard`;
  const text = [
    `Hi ${staffName || "there"},`,
    "",
    `${businessName || "Your workplace"} invited you to view your appointment schedule on Appointly.`,
    "",
    `Open this link to set your password and sign in (expires in 7 days):`,
    inviteUrl,
    "",
    "If you didn’t expect this, you can ignore this email.",
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(staffName || "there")},</p>
    <p style="margin:0 0 16px 0;"><strong>${escapeHtml(businessName || "Your workplace")}</strong> invited you to your <strong>staff dashboard</strong> on Appointly — see appointments assigned to you.</p>
    ${buildGradientCtaHtml(inviteUrl, "Accept invite & set password")}
    <p style="color:#64748b;font-size:13px;word-break:break-all;margin:12px 0 8px 0;">${escapeHtml(inviteUrl)}</p>
    <p style="color:#94a3b8;font-size:12px;margin:0;">This link expires in 7 days.</p>`;

  const html = buildAppointlyEmailDocument({
    headerSubtitle: businessName || "Team",
    headline: "You're invited",
    contentHtml,
    footerHtml: footerParagraph(
      "You're receiving this because a business on Appointly invited you to the staff dashboard.",
    ),
  });

  const transporter = getTransporter();
  const { host } = resolveSmtpEnv();
  if (!transporter) {
    console.warn(
      `[email] SMTP not configured — staff invite link for ${to}: ${inviteUrl}${host ? "" : " (set SMTP_HOST)"}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    console.error("[email] staff invite failed:", err.message);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

module.exports = {
  sendVerificationEmail,
  sendEmailChangeCode,
  sendPasswordResetEmail,
  sendBusinessApprovedEmail,
  sendTwoFactorEmail,
  sendStaffDashboardInviteEmail,
};
