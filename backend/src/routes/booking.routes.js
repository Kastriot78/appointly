const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const requireTenantAdminOrStaff = require("../middleware/requireTenantAdminOrStaff");
const bookingController = require("../controllers/booking.controller");
const bookingNotifyController = require("../controllers/bookingNotify.controller");
const slotHoldController = require("../controllers/slotHold.controller");
const slotWaitlistController = require("../controllers/slotWaitlist.controller");
const {
  bookingPublicRateLimiter,
  bookingAccountRateLimiter,
} = require("../middleware/rateLimiters");
const {
  requireJsonBody,
  requireFields,
  requireAtLeastOneField,
} = require("../middleware/requestValidators");

const router = express.Router();

router.get("/availability", asyncHandler(bookingController.getAvailability));
router.get(
  "/availability-summary",
  asyncHandler(bookingController.getAvailabilitySummary),
);
router.post(
  "/slot-hold",
  bookingPublicRateLimiter,
  requireJsonBody,
  requireFields(["businessId", "date", "startTime", "holderKey", "staffId"]),
  requireAtLeastOneField(
    ["serviceId", "serviceIds"],
    "Either serviceId or serviceIds is required.",
  ),
  asyncHandler(slotHoldController.createSlotHold),
);
router.delete(
  "/slot-hold/:id",
  asyncHandler(slotHoldController.releaseSlotHold),
);
router.post(
  "/waitlist",
  bookingPublicRateLimiter,
  requireJsonBody,
  requireFields(["businessId", "date", "startTime", "staffId"]),
  requireAtLeastOneField(
    ["serviceId", "serviceIds"],
    "Either serviceId or serviceIds is required.",
  ),
  optionalAuthenticate,
  asyncHandler(slotWaitlistController.joinSlotWaitlist),
);
router.get(
  "/waitlist-offer/:token",
  asyncHandler(slotWaitlistController.getWaitlistOffer),
);
router.get("/stream", asyncHandler(bookingController.streamBookings));
router.get("/mine", authenticate, asyncHandler(bookingController.listMyBookings));
router.get(
  "/mine/service-suggestions",
  authenticate,
  asyncHandler(bookingController.listMyServiceSuggestions),
);
router.get(
  "/mine/staff-review-eligible",
  authenticate,
  asyncHandler(bookingController.listStaffReviewEligibleBookings),
);
router.get(
  "/my-spending",
  authenticate,
  asyncHandler(bookingController.getCustomerSpendingByBusiness),
);
router.get(
  "/managed",
  authenticate,
  requireTenantAdminOrStaff,
  asyncHandler(bookingController.listManagedBookings),
);
router.post(
  "/managed/notify-day",
  authenticate,
  requireTenantAdminOrStaff,
  asyncHandler(bookingNotifyController.notifyBookingsForDay),
);
router.post(
  "/:id/confirm-pending",
  authenticate,
  bookingAccountRateLimiter,
  asyncHandler(bookingController.confirmPendingBooking),
);
router.post(
  "/:id/decline-pending",
  authenticate,
  bookingAccountRateLimiter,
  asyncHandler(bookingController.declinePendingBooking),
);
router.patch(
  "/:id/reschedule",
  authenticate,
  bookingAccountRateLimiter,
  requireJsonBody,
  requireFields(["date", "startTime"]),
  asyncHandler(bookingController.rescheduleBooking),
);
router.put(
  "/:id/reschedule",
  authenticate,
  bookingAccountRateLimiter,
  requireJsonBody,
  requireFields(["date", "startTime"]),
  asyncHandler(bookingController.rescheduleBooking),
);
router.post(
  "/:id/undo-cancel",
  authenticate,
  bookingAccountRateLimiter,
  asyncHandler(bookingController.undoCancelBooking),
);
router.post(
  "/:id/notify-customer",
  authenticate,
  requireTenantAdminOrStaff,
  asyncHandler(bookingNotifyController.notifySingleBooking),
);
router.patch(
  "/:id",
  authenticate,
  bookingAccountRateLimiter,
  requireJsonBody,
  requireFields(["status"]),
  asyncHandler(bookingController.updateBooking),
);
router.put(
  "/:id",
  authenticate,
  bookingAccountRateLimiter,
  requireJsonBody,
  requireFields(["status"]),
  asyncHandler(bookingController.updateBooking),
);
router.post(
  "/",
  bookingPublicRateLimiter,
  requireJsonBody,
  requireFields(["businessId", "date", "startTime", "staffId"]),
  requireAtLeastOneField(
    ["serviceId", "serviceIds"],
    "Either serviceId or serviceIds is required.",
  ),
  optionalAuthenticate,
  asyncHandler(bookingController.createBooking),
);

module.exports = router;
