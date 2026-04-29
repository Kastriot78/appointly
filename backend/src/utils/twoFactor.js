const { randomInt } = require("crypto");
const bcrypt = require("bcryptjs");

const TWO_FACTOR_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TWO_FACTOR_RESEND_COOLDOWN_MS = 30 * 1000; // block faster resends
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 10 * 60; // login challenge JWT lifetime

/** True when the user has turned on email OTP in their profile (all roles). */
function effectiveTwoFactorEnabled(user) {
  if (!user) return false;
  return Boolean(user.twoFactorEnabled);
}

async function createTwoFactorPayload() {
  const code = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + TWO_FACTOR_CODE_TTL_MS);
  return { code, hash, expiresAt };
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] || ""}***@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

module.exports = {
  TWO_FACTOR_CODE_TTL_MS,
  TWO_FACTOR_RESEND_COOLDOWN_MS,
  TWO_FACTOR_MAX_ATTEMPTS,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  effectiveTwoFactorEnabled,
  createTwoFactorPayload,
  maskEmail,
};
