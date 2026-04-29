/**
 * How long an email verification OTP remains valid after it is issued.
 * 1 hour balances UX (user can step away briefly) and security (limits brute-force window).
 * For stricter flows (e.g. banking), 15–30 minutes is common instead.
 */
const EMAIL_VERIFICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

module.exports = {
  EMAIL_VERIFICATION_TTL_MS,
};
