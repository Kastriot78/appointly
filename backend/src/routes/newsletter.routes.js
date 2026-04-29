const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const newsletterController = require("../controllers/newsletter.controller");

const router = express.Router();

router.post("/subscribe", asyncHandler(newsletterController.subscribe));

router.get(
  "/subscribers",
  authenticate,
  requireAdmin,
  asyncHandler(newsletterController.listSubscribers),
);

module.exports = router;
