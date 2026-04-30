const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const locationController = require("../controllers/location.controller");

const router = express.Router();

router.get("/", asyncHandler(locationController.listLocations));

router.post(
  "/",
  authenticate,
  requireAdmin,
  asyncHandler(locationController.createLocation),
);

router.put(
  "/reorder",
  authenticate,
  requireAdmin,
  asyncHandler(locationController.reorderLocations),
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  asyncHandler(locationController.updateLocation),
);

router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  asyncHandler(locationController.deleteLocation),
);

module.exports = router;
