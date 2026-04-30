const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Staff = require("../models/Staff");
const PendingRegistration = require("../models/PendingRegistration");
const { createEmailVerificationPayload } = require("../utils/verificationCode");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTwoFactorEmail,
  sendStaffDashboardInviteEmail,
} = require("../services/email.service");
const { userMeResponse } = require("../utils/userMeResponse");
const {
  signAuthToken,
  signTwoFactorChallenge,
  verifyTwoFactorChallenge,
} = require("../utils/jwt");
const {
  createTwoFactorPayload,
  effectiveTwoFactorEnabled,
  maskEmail,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  TWO_FACTOR_MAX_ATTEMPTS,
  TWO_FACTOR_RESEND_COOLDOWN_MS,
} = require("../utils/twoFactor");
const { getPublicSiteBase } = require("../utils/sitePublicUrl");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_ROLES = ["customer", "tenant"];

function validateRegisterBody(body) {
  const { name, email, password, confirmPassword, role, phone, avatar } = body;
  const errors = [];

  if (!name || String(name).trim().length < 1) {
    errors.push("Name is required");
  }
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    errors.push("Valid email is required");
  }
  if (!password || String(password).length < 6) {
    errors.push("Password must be at least 6 characters");
  }
  if (!confirmPassword || String(confirmPassword).length < 1) {
    errors.push("Confirm password is required");
  } else if (String(password || "") !== String(confirmPassword)) {
    errors.push("Passwords do not match");
  }

  let roleValue = "customer";
  if (role !== undefined && role !== null && role !== "") {
    if (!PUBLIC_ROLES.includes(role)) {
      errors.push(`Role must be one of: ${PUBLIC_ROLES.join(", ")}`);
    } else {
      roleValue = role;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      name: String(name || "")
        .trim()
        .toLowerCase(),
      email: String(email || "")
        .trim()
        .toLowerCase(),
      password: String(password || ""),
      confirmPassword: String(confirmPassword || ""),
      role: roleValue,
      phone: phone != null ? String(phone).trim() : "",
      avatar: avatar != null ? String(avatar).trim() : "",
    },
  };
}

/**
 * POST /api/auth/register
 * Stores signup in PendingRegistration only (no User until email is verified).
 */
async function register(req, res) {
  const parsed = validateRegisterBody(req.body);
  if (!parsed.valid) {
    return res
      .status(400)
      .json({ message: parsed.errors[0], errors: parsed.errors });
  }

  const { name, email, password, role, phone, avatar } = parsed.data;

  const existingVerified = await User.findOne({ email, isEmailVerified: true });
  if (existingVerified) {
    return res.status(409).json({ message: "Email already registered" });
  }

  await User.deleteMany({ email, isEmailVerified: false });

  let pending = await PendingRegistration.findOne({ email });
  const isNewPending = !pending;

  if (!pending) {
    pending = new PendingRegistration({
      name,
      email,
      password,
      role,
      phone,
      avatar,
    });
  } else {
    pending.name = name;
    pending.password = password;
    pending.role = role;
    pending.phone = phone;
    pending.avatar = avatar;
  }

  const { code, hash, expiresAt } = await createEmailVerificationPayload();
  pending.emailVerificationCodeHash = hash;
  pending.emailVerificationExpires = expiresAt;

  await pending.save();
  await sendVerificationEmail(pending.email, pending.name, code);

  return res.status(isNewPending ? 201 : 200).json({
    message:
      "Check your email for the verification code. Your account will be created after you verify.",
    verificationPending: true,
    email: pending.email,
    profile: {
      name: pending.name,
      role: pending.role,
    },
  });
}

/**
 * POST /api/auth/verify-email
 * Body: { email, code } — creates User from pending signup after valid code.
 */
async function verifyEmail(req, res) {
  const { email, code } = req.body;

  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  if (!code || String(code).trim().length < 4) {
    return res.status(400).json({ message: "Verification code is required" });
  }

  const emailNorm = String(email).trim().toLowerCase();

  const pending = await PendingRegistration.findOne({
    email: emailNorm,
  }).select("+password +emailVerificationCodeHash +emailVerificationExpires");

  if (!pending) {
    const verifiedUser = await User.findOne({
      email: emailNorm,
      isEmailVerified: true,
    });
    if (verifiedUser) {
      return res
        .status(400)
        .json({ message: "Email is already verified — you can sign in" });
    }
    return res.status(404).json({
      message: "No pending signup for this email. Register again.",
    });
  }

  const ok = await pending.compareEmailVerificationCode(String(code).trim());
  if (!ok) {
    return res
      .status(400)
      .json({ message: "Invalid or expired verification code" });
  }

  const user = new User({
    name: pending.name,
    email: pending.email,
    password: pending.password,
    phone: pending.phone,
    avatar: pending.avatar,
    role: pending.role,
    isEmailVerified: true,
  });

  await user.save();
  await PendingRegistration.deleteOne({ _id: pending._id });

  const fresh = await User.findById(user._id);
  return res.json({
    message: "Email verified — your account is ready.",
    user: await userMeResponse(fresh),
  });
}

/**
 * POST /api/auth/resend-verification
 * Body: { email }
 */
async function resendVerification(req, res) {
  const { email } = req.body;

  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ message: "Valid email is required" });
  }

  const emailNorm = String(email).trim().toLowerCase();

  const verifiedUser = await User.findOne({
    email: emailNorm,
    isEmailVerified: true,
  });
  if (verifiedUser) {
    return res.status(400).json({ message: "Email is already verified" });
  }

  const pending = await PendingRegistration.findOne({ email: emailNorm });
  if (!pending) {
    return res.status(404).json({
      message: "No pending signup for this email. Register first.",
    });
  }

  const { code, hash, expiresAt } = await createEmailVerificationPayload();
  pending.emailVerificationCodeHash = hash;
  pending.emailVerificationExpires = expiresAt;
  await pending.save();

  await sendVerificationEmail(pending.email, pending.name, code);

  return res.json({
    message: "A new verification code has been sent to your email.",
  });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  if (!password || String(password).length < 1) {
    return res.status(400).json({ message: "Password is required" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Server configuration error" });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: emailNorm }).select("+password");

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (!user.isEmailVerified) {
    return res.status(403).json({
      message: "Please verify your email before signing in",
    });
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  if (effectiveTwoFactorEnabled(user)) {
    const { code, hash, expiresAt } = await createTwoFactorPayload();
    user.twoFactorCodeHash = hash;
    user.twoFactorCodeExpires = expiresAt;
    user.twoFactorCodePurpose = "login";
    user.twoFactorLastSentAt = new Date();
    user.twoFactorAttempts = 0;
    await user.save();

    sendTwoFactorEmail(user.email, user.name || "there", code, "login").catch(
      (err) => console.error("[auth] 2FA email error:", err?.message || err),
    );

    const challengeToken = signTwoFactorChallenge(
      { sub: user._id.toString() },
      TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    );

    return res.json({
      requiresTwoFactor: true,
      challengeToken,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    });
  }

  const token = signAuthToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  return res.json({
    token,
    user: await userMeResponse(user),
  });
}

/**
 * POST /api/auth/verify-2fa
 * Body: { challengeToken, code }
 */
async function verifyTwoFactor(req, res) {
  const { challengeToken, code } = req.body || {};
  if (!challengeToken || typeof challengeToken !== "string") {
    return res.status(400).json({ message: "Missing challenge token" });
  }
  if (!code || String(code).trim().length < 4) {
    return res.status(400).json({ message: "Verification code is required" });
  }

  let decoded;
  try {
    decoded = verifyTwoFactorChallenge(challengeToken);
  } catch {
    return res.status(401).json({
      message: "Sign-in session expired — please sign in again",
      expired: true,
    });
  }

  const user = await User.findById(decoded.sub).select(
    "+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodePurpose +twoFactorAttempts",
  );
  if (!user) {
    return res.status(401).json({ message: "Account not found" });
  }

  if (!user.twoFactorCodeHash || user.twoFactorCodePurpose !== "login") {
    return res
      .status(400)
      .json({ message: "No active sign-in code — please sign in again" });
  }

  if ((user.twoFactorAttempts || 0) >= TWO_FACTOR_MAX_ATTEMPTS) {
    user.twoFactorCodeHash = undefined;
    user.twoFactorCodeExpires = undefined;
    user.twoFactorCodePurpose = undefined;
    await user.save();
    return res.status(429).json({
      message: "Too many invalid attempts — please sign in again",
    });
  }

  const ok = await user.compareTwoFactorCode(String(code).trim(), "login");
  if (!ok) {
    user.twoFactorAttempts = (user.twoFactorAttempts || 0) + 1;
    await user.save();
    return res
      .status(400)
      .json({ message: "Invalid or expired verification code" });
  }

  user.twoFactorCodeHash = undefined;
  user.twoFactorCodeExpires = undefined;
  user.twoFactorCodePurpose = undefined;
  user.twoFactorAttempts = 0;
  await user.save();

  const fresh = await User.findById(user._id);
  const token = signAuthToken({
    sub: fresh._id.toString(),
    email: fresh.email,
    role: fresh.role,
  });

  return res.json({
    token,
    user: await userMeResponse(fresh),
  });
}

/**
 * POST /api/auth/resend-2fa
 * Body: { challengeToken }
 */
async function resendTwoFactor(req, res) {
  const { challengeToken } = req.body || {};
  if (!challengeToken || typeof challengeToken !== "string") {
    return res.status(400).json({ message: "Missing challenge token" });
  }

  let decoded;
  try {
    decoded = verifyTwoFactorChallenge(challengeToken);
  } catch {
    return res.status(401).json({
      message: "Sign-in session expired — please sign in again",
      expired: true,
    });
  }

  const user = await User.findById(decoded.sub);
  if (!user) {
    return res.status(401).json({ message: "Account not found" });
  }

  if (user.twoFactorLastSentAt) {
    const since = Date.now() - user.twoFactorLastSentAt.getTime();
    if (since < TWO_FACTOR_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((TWO_FACTOR_RESEND_COOLDOWN_MS - since) / 1000);
      return res.status(429).json({
        message: `Please wait ${wait}s before requesting another code`,
        retryAfter: wait,
      });
    }
  }

  const { code, hash, expiresAt } = await createTwoFactorPayload();
  user.twoFactorCodeHash = hash;
  user.twoFactorCodeExpires = expiresAt;
  user.twoFactorCodePurpose = "login";
  user.twoFactorLastSentAt = new Date();
  user.twoFactorAttempts = 0;
  await user.save();

  sendTwoFactorEmail(user.email, user.name || "there", code, "login").catch(
    (err) => console.error("[auth] 2FA resend error:", err?.message || err),
  );

  return res.json({
    message: "A new code has been sent to your email.",
    maskedEmail: maskEmail(user.email),
  });
}

const FORGOT_PASSWORD_GENERIC = {
  message:
    "If an account exists for that email, you will receive a reset link shortly.",
};

/**
 * POST /api/auth/forgot-password — request reset email (same response whether or not email exists).
 */
async function forgotPassword(req, res) {
  const emailRaw = req.body?.email;
  if (!emailRaw || !EMAIL_REGEX.test(String(emailRaw).trim())) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  const emailNorm = String(emailRaw).trim().toLowerCase();
  const user = await User.findOne({ email: emailNorm });

  if (!user) {
    return res.json(FORGOT_PASSWORD_GENERIC);
  }

  const plainToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = await bcrypt.hash(plainToken, 10);
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const resetUrl = `${getPublicSiteBase()}/reset-password?token=${encodeURIComponent(plainToken)}&email=${encodeURIComponent(user.email)}`;

  try {
    await sendPasswordResetEmail(user.email, user.name || "there", resetUrl);
  } catch (err) {
    console.error("[auth] forgotPassword email error:", err?.message || err);
  }

  return res.json(FORGOT_PASSWORD_GENERIC);
}

/**
 * POST /api/auth/reset-password — set new password using token from email link.
 */
async function resetPassword(req, res) {
  const { email, token, newPassword } = req.body || {};
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  if (!token || typeof token !== "string" || token.length < 16) {
    return res.status(400).json({ message: "Invalid or expired reset link" });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ message: "New password must be at least 6 characters" });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: emailNorm }).select(
    "+password +passwordResetTokenHash +passwordResetExpires",
  );

  if (!user?.passwordResetTokenHash || !user.passwordResetExpires) {
    return res.status(400).json({ message: "Invalid or expired reset link" });
  }
  if (Date.now() > user.passwordResetExpires.getTime()) {
    return res
      .status(400)
      .json({ message: "Reset link has expired. Request a new one." });
  }

  const match = await bcrypt.compare(
    String(token).trim(),
    user.passwordResetTokenHash,
  );
  if (!match) {
    return res.status(400).json({ message: "Invalid or expired reset link" });
  }

  user.password = String(newPassword);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return res.json({
    message: "Password updated. You can sign in with your new password.",
  });
}

/**
 * GET /api/auth/staff-invite/:token — public; validates invite for signup form.
 */
async function getStaffInvitePreview(req, res) {
  const token = String(req.params.token || "").trim();
  if (!token) {
    return res.status(400).json({ message: "Invalid invite link" });
  }
  const member = await Staff.findOne({ dashboardInviteToken: token })
    .select(
      "+dashboardInviteToken name email dashboardInviteExpires linkedUser business",
    )
    .populate("business", "name")
    .lean();
  if (!member || member.linkedUser) {
    return res.status(404).json({
      message: "This invite is invalid or was already used.",
    });
  }
  if (
    !member.dashboardInviteExpires ||
    new Date(member.dashboardInviteExpires) <= new Date()
  ) {
    return res.status(410).json({ message: "This invite has expired" });
  }
  return res.json({
    businessName: member.business?.name || "Business",
    staffName: member.name,
    email: member.email || "",
  });
}

/**
 * POST /api/auth/staff-invite/accept — public; creates staff user + session.
 */
async function acceptStaffInvite(req, res) {
  const { token, password, name } = req.body || {};
  if (!token || typeof token !== "string" || !String(token).trim()) {
    return res.status(400).json({ message: "Invite token is required" });
  }
  if (!password || String(password).length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Server configuration error" });
  }
  const member = await Staff.findOne({
    dashboardInviteToken: String(token).trim(),
  }).select(
    "+dashboardInviteToken name email business dashboardInviteExpires linkedUser",
  );
  if (!member || member.linkedUser) {
    return res.status(400).json({
      message: "Invalid or already used invite",
    });
  }
  if (
    !member.dashboardInviteExpires ||
    member.dashboardInviteExpires <= new Date()
  ) {
    return res.status(400).json({ message: "This invite has expired" });
  }
  const emailNorm = String(member.email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(emailNorm)) {
    return res.status(400).json({ message: "Staff record has no valid email" });
  }
  const existing = await User.findOne({
    email: emailNorm,
    isEmailVerified: true,
  });
  if (existing) {
    return res.status(409).json({
      message:
        "An account with this email already exists. Ask your manager to use a different email on your staff profile, or use another address for your staff login.",
    });
  }
  await User.deleteMany({ email: emailNorm, isEmailVerified: false });
  const displayName =
    name != null && String(name).trim().length > 0
      ? String(name).trim().toLowerCase()
      : String(member.name || "staff").trim().toLowerCase();
  const user = await User.create({
    name: displayName,
    email: emailNorm,
    password: String(password),
    role: "staff",
    staffProfile: member._id,
    staffBusinessId: member.business,
    isEmailVerified: true,
  });
  member.linkedUser = user._id;
  member.dashboardInviteToken = null;
  member.dashboardInviteExpires = null;
  await member.save();
  const tokenJwt = signAuthToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });
  const fresh = await User.findById(user._id);
  return res.json({
    token: tokenJwt,
    user: await userMeResponse(fresh),
  });
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  verifyTwoFactor,
  resendTwoFactor,
  forgotPassword,
  resetPassword,
  getStaffInvitePreview,
  acceptStaffInvite,
};
