const User = require("../models/User");
const { userMeResponse } = require("../utils/userMeResponse");
const { sendTwoFactorEmail } = require("../services/email.service");
const {
  createTwoFactorPayload,
  TWO_FACTOR_RESEND_COOLDOWN_MS,
  TWO_FACTOR_MAX_ATTEMPTS,
} = require("../utils/twoFactor");

function cooldownRemainingMs(user) {
  if (!user.twoFactorLastSentAt) return 0;
  const elapsed = Date.now() - user.twoFactorLastSentAt.getTime();
  return elapsed < TWO_FACTOR_RESEND_COOLDOWN_MS
    ? TWO_FACTOR_RESEND_COOLDOWN_MS - elapsed
    : 0;
}

async function issueCode(user, purpose) {
  const { code, hash, expiresAt } = await createTwoFactorPayload();
  user.twoFactorCodeHash = hash;
  user.twoFactorCodeExpires = expiresAt;
  user.twoFactorCodePurpose = purpose;
  user.twoFactorLastSentAt = new Date();
  user.twoFactorAttempts = 0;
  await user.save();
  sendTwoFactorEmail(user.email, user.name || "there", code, purpose).catch(
    (err) => console.error("[2fa] email error:", err?.message || err),
  );
}

/**
 * POST /api/users/me/2fa/start
 * Body: { action: "enable" | "disable" }
 * Sends a 6-digit code to the user's email.
 */
async function start(req, res) {
  const action = String(req.body?.action || "").trim();
  if (!["enable", "disable"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }

  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (action === "enable" && user.twoFactorEnabled) {
    return res
      .status(400)
      .json({ message: "Two-factor authentication is already enabled" });
  }
  if (action === "disable" && !user.twoFactorEnabled) {
    return res
      .status(400)
      .json({ message: "Two-factor authentication is not enabled" });
  }

  const wait = cooldownRemainingMs(user);
  if (wait > 0) {
    return res.status(429).json({
      message: `Please wait ${Math.ceil(wait / 1000)}s before requesting another code`,
      retryAfter: Math.ceil(wait / 1000),
    });
  }

  await issueCode(user, action);

  return res.json({
    message: "A verification code has been sent to your email.",
    purpose: action,
  });
}

/**
 * POST /api/users/me/2fa/confirm
 * Body: { action: "enable" | "disable", code }
 */
async function confirm(req, res) {
  const action = String(req.body?.action || "").trim();
  const code = String(req.body?.code || "").trim();
  if (!["enable", "disable"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }
  if (code.length < 4) {
    return res.status(400).json({ message: "Verification code is required" });
  }

  const user = await User.findById(req.userId).select(
    "+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodePurpose +twoFactorAttempts",
  );
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.twoFactorCodeHash || user.twoFactorCodePurpose !== action) {
    return res.status(400).json({
      message: "No active code for this action — request a new code first",
    });
  }

  if ((user.twoFactorAttempts || 0) >= TWO_FACTOR_MAX_ATTEMPTS) {
    user.twoFactorCodeHash = undefined;
    user.twoFactorCodeExpires = undefined;
    user.twoFactorCodePurpose = undefined;
    await user.save();
    return res.status(429).json({
      message: "Too many invalid attempts — request a new code",
    });
  }

  const ok = await user.compareTwoFactorCode(code, action);
  if (!ok) {
    user.twoFactorAttempts = (user.twoFactorAttempts || 0) + 1;
    await user.save();
    return res
      .status(400)
      .json({ message: "Invalid or expired verification code" });
  }

  user.twoFactorEnabled = action === "enable";
  user.twoFactorCodeHash = undefined;
  user.twoFactorCodeExpires = undefined;
  user.twoFactorCodePurpose = undefined;
  user.twoFactorAttempts = 0;
  await user.save();

  const fresh = await User.findById(user._id);
  return res.json({
    message:
      action === "enable"
        ? "Two-factor authentication is now on."
        : "Two-factor authentication has been turned off.",
    user: await userMeResponse(fresh),
  });
}

module.exports = { start, confirm };
