const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const webhookController = require("../controllers/webhook.controller");

const router = express.Router();

router.get("/", authenticate, asyncHandler(webhookController.listWebhooks));
router.post("/", authenticate, asyncHandler(webhookController.createWebhook));
router.patch("/:id", authenticate, asyncHandler(webhookController.updateWebhook));
router.put("/:id", authenticate, asyncHandler(webhookController.updateWebhook));
router.post("/:id/test", authenticate, asyncHandler(webhookController.testWebhook));
router.post(
  "/:id/rotate-secret",
  authenticate,
  asyncHandler(webhookController.rotateWebhookSecret),
);
router.delete(
  "/:id",
  authenticate,
  asyncHandler(webhookController.deleteWebhook),
);

module.exports = router;
