const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const requireTenant = require("../middleware/requireTenant");
const requireTenantOrStaff = require("../middleware/requireTenantOrStaff");
const requireTenantStaffOrAdmin = require("../middleware/requireTenantStaffOrAdmin");
const businessCreateUpload = require("../middleware/businessCreateUpload");
const businessController = require("../controllers/business.controller");
const closingDayController = require("../controllers/closingDay.controller");
const emailBroadcastController = require("../controllers/emailBroadcast.controller");
const couponController = require("../controllers/coupon.controller");
const serviceController = require("../controllers/service.controller");
const staffController = require("../controllers/staff.controller");

const router = express.Router();

router.post(
  "/",
  authenticate,
  requireTenant,
  businessCreateUpload,
  asyncHandler(businessController.createBusiness),
);

router.get(
  "/",
  authenticate,
  requireTenantStaffOrAdmin,
  asyncHandler(businessController.listBusinesses),
);

router.get(
  "/slug/:slug",
  asyncHandler(businessController.getBusinessBySlugPublic),
);

router.get(
  "/public",
  asyncHandler(businessController.listPublicBusinesses),
);

router.get(
  "/admin/pending-count",
  authenticate,
  requireAdmin,
  asyncHandler(businessController.getPendingBusinessCount),
);

router.put(
  "/:id/approval",
  authenticate,
  requireAdmin,
  asyncHandler(businessController.setBusinessApproval),
);

router.get(
  "/:id/services",
  authenticate,
  requireTenantStaffOrAdmin,
  asyncHandler(serviceController.listServices),
);
router.post(
  "/:id/services",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(serviceController.createService),
);
router.post(
  "/:id/services/promotion-bulk",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(serviceController.applyPromotionBulk),
);
router.put(
  "/:id/services/reorder",
  authenticate,
  requireTenant,
  asyncHandler(serviceController.reorderServices),
);
router.put(
  "/:id/services/:serviceId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(serviceController.updateService),
);
router.delete(
  "/:id/services/:serviceId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(serviceController.deleteService),
);

router.get(
  "/:id/staff/booking-stats",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.getStaffBookingStats),
);
router.get(
  "/:id/staff/smart-ranking",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.getStaffSmartRanking),
);
router.get(
  "/:id/staff/:staffId/smart-ranking-feedback",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.getStaffSmartRankingFeedback),
);
router.get(
  "/:id/staff",
  authenticate,
  requireTenantStaffOrAdmin,
  asyncHandler(staffController.listStaff),
);
router.post(
  "/:id/staff/:staffId/invite-dashboard",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.inviteStaffDashboard),
);
router.post(
  "/:id/staff/:staffId/revoke-dashboard",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.revokeStaffDashboard),
);
router.post(
  "/:id/staff",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.createStaff),
);
router.put(
  "/:id/staff/:staffId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.updateStaff),
);
router.delete(
  "/:id/staff/:staffId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(staffController.deleteStaff),
);

router.get(
  "/:id/customers",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(businessController.listBusinessCustomers),
);

router.get(
  "/:id/customers/:customerId/service-history",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(businessController.getCustomerServiceHistory),
);

router.get(
  "/:id/closing-days",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(closingDayController.listClosingDays),
);
router.post(
  "/:id/closing-days",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(closingDayController.createClosingDay),
);
router.put(
  "/:id/closing-days/:closingId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(closingDayController.updateClosingDay),
);
router.delete(
  "/:id/closing-days/:closingId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(closingDayController.deleteClosingDay),
);

router.post(
  "/:id/coupons/validate",
  asyncHandler(couponController.validateCouponPublic),
);
router.get(
  "/:id/coupons",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(couponController.listCoupons),
);
router.post(
  "/:id/coupons",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(couponController.createCoupon),
);
router.put(
  "/:id/coupons/:couponId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(couponController.updateCoupon),
);
router.delete(
  "/:id/coupons/:couponId",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(couponController.deleteCoupon),
);
router.post(
  "/:id/coupons/:couponId/send-email",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(couponController.sendCouponEmail),
);

router.get(
  "/:id/customer-email-broadcasts",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(emailBroadcastController.listBroadcasts),
);
router.post(
  "/:id/customer-email-broadcasts",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(emailBroadcastController.sendBroadcast),
);

router.delete(
  "/:id",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(businessController.deleteBusiness),
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(businessController.getBusiness),
);

router.put(
  "/:id",
  authenticate,
  requireTenantOrStaff,
  asyncHandler(businessController.updateBusiness),
);

module.exports = router;
