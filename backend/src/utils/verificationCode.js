const { randomInt } = require("crypto");
const bcrypt = require("bcryptjs");
const { EMAIL_VERIFICATION_TTL_MS } = require("../constants/auth");

const CODE_SALT_ROUNDS = 10;

/**
 * @returns {{ code: string, hash: string, expiresAt: Date }}
 */
async function createEmailVerificationPayload() {
  const code = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(code, CODE_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  return { code, hash, expiresAt };
}

module.exports = {
  createEmailVerificationPayload,
};
