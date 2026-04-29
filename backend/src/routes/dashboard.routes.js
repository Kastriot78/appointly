const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const dashboardController = require("../controllers/dashboard.controller");

const router = express.Router();

/** Customers, tenants, and admins — response shape depends on role (see controller). */
router.get(
  "/overview",
  authenticate,
  asyncHandler(dashboardController.getOverview),
);

module.exports = router;
