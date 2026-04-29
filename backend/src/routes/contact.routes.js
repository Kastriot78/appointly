const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const contactController = require("../controllers/contact.controller");

const router = express.Router();

router.post("/messages", asyncHandler(contactController.submitMessage));

router.get(
  "/messages",
  authenticate,
  requireAdmin,
  asyncHandler(contactController.listMessages),
);

module.exports = router;
