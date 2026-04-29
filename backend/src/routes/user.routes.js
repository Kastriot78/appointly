const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const userController = require("../controllers/user.controller");
const twoFactorController = require("../controllers/twoFactor.controller");
const { authRateLimiter } = require("../middleware/rateLimiters");
const {
  requireJsonBody,
  requireFields,
} = require("../middleware/requestValidators");

const router = express.Router();

router.get("/me", authenticate, asyncHandler(userController.getMe));
router.delete("/me", authenticate, asyncHandler(userController.deleteAccount));
router.put("/me", authenticate, asyncHandler(userController.updateProfile));
router.put(
  "/me/password",
  authenticate,
  asyncHandler(userController.changePassword),
);
router.post(
  "/me/confirm-email",
  authenticate,
  asyncHandler(userController.confirmEmailChange),
);
router.delete(
  "/me/pending-email",
  authenticate,
  asyncHandler(userController.cancelPendingEmail),
);
router.post(
  "/me/resend-email-change",
  authenticate,
  asyncHandler(userController.resendEmailChange),
);

router.post(
  "/me/2fa/start",
  authenticate,
  asyncHandler(twoFactorController.start),
);
router.post(
  "/me/2fa/confirm",
  authenticate,
  asyncHandler(twoFactorController.confirm),
);
router.get(
  "/admin/accounts",
  authenticate,
  requireAdmin,
  asyncHandler(userController.listManagedAccounts),
);
router.post(
  "/admin/accounts",
  authenticate,
  requireAdmin,
  authRateLimiter,
  requireJsonBody,
  requireFields(["name", "email", "password"]),
  asyncHandler(userController.createManagedAccount),
);
router.delete(
  "/admin/accounts/:id",
  authenticate,
  requireAdmin,
  asyncHandler(userController.deleteManagedAccount),
);
router.put(
  "/admin/accounts/:id/role",
  authenticate,
  requireAdmin,
  requireJsonBody,
  requireFields(["role"]),
  asyncHandler(userController.updateManagedAccountRole),
);
/* Backward-compat alias */
router.post(
  "/admins",
  authenticate,
  requireAdmin,
  authRateLimiter,
  requireJsonBody,
  requireFields(["name", "email", "password"]),
  asyncHandler(userController.createManagedAccount),
);

module.exports = router;
