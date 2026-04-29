const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireTenantOrStaff = require("../middleware/requireTenantOrStaff");
const uploadController = require("../controllers/upload.controller");

const router = express.Router();

router.post(
  "/business-image",
  authenticate,
  requireTenantOrStaff,
  uploadController.uploadMiddleware,
  asyncHandler(uploadController.uploadBusinessImage),
);

module.exports = router;
