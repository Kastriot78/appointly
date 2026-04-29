const { rateLimit } = require("express-rate-limit");

function envInt(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function makeLimiter({
  windowMs,
  limit,
  message,
  skipSuccessfulRequests = false,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: { message },
  });
}

const authRateLimiter = makeLimiter({
  windowMs: envInt("RATE_LIMIT_AUTH_WINDOW_MS", 15 * 60 * 1000),
  limit: envInt("RATE_LIMIT_AUTH_MAX", 20),
  message: "Too many authentication attempts. Please try again later.",
});

const passwordResetRateLimiter = makeLimiter({
  windowMs: envInt("RATE_LIMIT_PASSWORD_RESET_WINDOW_MS", 15 * 60 * 1000),
  limit: envInt("RATE_LIMIT_PASSWORD_RESET_MAX", 8),
  message: "Too many password reset attempts. Please try again later.",
});

const bookingPublicRateLimiter = makeLimiter({
  windowMs: envInt("RATE_LIMIT_BOOKING_PUBLIC_WINDOW_MS", 60 * 1000),
  limit: envInt("RATE_LIMIT_BOOKING_PUBLIC_MAX", 40),
  message: "Too many booking requests from this IP. Please slow down.",
});

const bookingAccountRateLimiter = makeLimiter({
  windowMs: envInt("RATE_LIMIT_BOOKING_ACCOUNT_WINDOW_MS", 60 * 1000),
  limit: envInt("RATE_LIMIT_BOOKING_ACCOUNT_MAX", 80),
  message: "Too many booking updates. Please try again shortly.",
});

const subscriptionRateLimiter = makeLimiter({
  windowMs: envInt("RATE_LIMIT_SUBSCRIPTION_WINDOW_MS", 15 * 60 * 1000),
  limit: envInt("RATE_LIMIT_SUBSCRIPTION_MAX", 10),
  message: "Too many subscription requests. Please try again later.",
});

module.exports = {
  authRateLimiter,
  passwordResetRateLimiter,
  bookingPublicRateLimiter,
  bookingAccountRateLimiter,
  subscriptionRateLimiter,
};
