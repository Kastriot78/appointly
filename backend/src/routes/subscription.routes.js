const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const subscriptionController = require("../controllers/subscription.controller");
const { subscriptionRateLimiter } = require("../middleware/rateLimiters");
const {
  requireJsonBody,
  requireFields,
  requireEnumField,
} = require("../middleware/requestValidators");

const router = express.Router();

router.post(
  "/demo-checkout",
  authenticate,
  subscriptionRateLimiter,
  requireJsonBody,
  requireFields(["planId"]),
  requireEnumField("billing", ["monthly", "yearly"]),
  asyncHandler(subscriptionController.demoCheckout),
);

module.exports = router;
