const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireTenantOrStaff = require("../middleware/requireTenantOrStaff");
const analyticsController = require("../controllers/analytics.controller");

const router = express.Router();

router.use(authenticate, requireTenantOrStaff);

router.get("/revenue", asyncHandler(analyticsController.getRevenueTrend));
router.get("/heatmap", asyncHandler(analyticsController.getHeatmap));
router.get(
  "/service-popularity",
  asyncHandler(analyticsController.getServicePopularity),
);
router.get(
  "/staff-utilization",
  asyncHandler(analyticsController.getStaffUtilization),
);
router.get(
  "/retention-cohorts",
  asyncHandler(analyticsController.getRetentionCohorts),
);

module.exports = router;
