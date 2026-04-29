const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireTenantOrStaff = require("../middleware/requireTenantOrStaff");
const reviewController = require("../controllers/review.controller");

const router = express.Router();

router.get("/mine", authenticate, asyncHandler(reviewController.listMyReviews));
router.get(
  "/managed",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(reviewController.listManagedReviews),
);
router.patch(
  "/:id/reply",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(reviewController.replyToReview),
);
router.post("/", authenticate, asyncHandler(reviewController.createReview));

module.exports = router;
