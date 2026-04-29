const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authController = require("../controllers/auth.controller");
const {
  authRateLimiter,
  passwordResetRateLimiter,
} = require("../middleware/rateLimiters");
const {
  requireJsonBody,
  requireFields,
} = require("../middleware/requestValidators");

const router = express.Router();

router.post(
  "/register",
  authRateLimiter,
  requireJsonBody,
  requireFields(["name", "email", "password"]),
  asyncHandler(authController.register),
);
router.post(
  "/verify-email",
  authRateLimiter,
  requireJsonBody,
  requireFields(["email", "code"]),
  asyncHandler(authController.verifyEmail),
);
router.post(
  "/resend-verification",
  authRateLimiter,
  requireJsonBody,
  requireFields(["email"]),
  asyncHandler(authController.resendVerification),
);
router.get(
  "/staff-invite/:token",
  asyncHandler(authController.getStaffInvitePreview),
);
router.post(
  "/staff-invite/accept",
  authRateLimiter,
  requireJsonBody,
  requireFields(["token", "password"]),
  asyncHandler(authController.acceptStaffInvite),
);
router.post(
  "/login",
  authRateLimiter,
  requireJsonBody,
  requireFields(["email", "password"]),
  asyncHandler(authController.login),
);
router.post(
  "/verify-2fa",
  authRateLimiter,
  requireJsonBody,
  requireFields(["challengeToken", "code"]),
  asyncHandler(authController.verifyTwoFactor),
);
router.post(
  "/resend-2fa",
  authRateLimiter,
  requireJsonBody,
  requireFields(["challengeToken"]),
  asyncHandler(authController.resendTwoFactor),
);
router.post(
  "/forgot-password",
  passwordResetRateLimiter,
  requireJsonBody,
  requireFields(["email"]),
  asyncHandler(authController.forgotPassword),
);
router.post(
  "/reset-password",
  passwordResetRateLimiter,
  requireJsonBody,
  requireFields(["email", "token", "newPassword"]),
  asyncHandler(authController.resetPassword),
);

module.exports = router;
