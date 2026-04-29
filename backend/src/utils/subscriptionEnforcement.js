const Business = require("../models/Business");
const User = require("../models/User");
const Staff = require("../models/Staff");
const Service = require("../models/Service");
const { resolveWorkspaceBusinessIds } = require("./workspaceScope");
const { isAdminRole } = require("./roleChecks");
const { normalizePlanId, getPlanConfig } = require("../config/subscriptionPlans");

function planError(message, extra) {
  const err = new Error(message);
  err.statusCode = 403;
  err.extra = { code: "PLAN_LIMIT", ...extra };
  return err;
}

async function getLimitsForBusiness(businessId) {
  const biz = await Business.findById(businessId).select("owner").lean();
  if (!biz || !biz.owner) {
    const cfg = getPlanConfig("starter");
    return { ...cfg, planId: "starter" };
  }
  const owner = await User.findById(biz.owner)
    .select("subscriptionPlan")
    .lean();
  const planId = normalizePlanId(owner?.subscriptionPlan);
  const cfg = getPlanConfig(planId);
  return { ...cfg, planId };
}

/**
 * Subscription object for API (`/me`, login, etc.).
 * @param {import('mongoose').Document} user
 */
async function getEffectiveSubscriptionPayload(user) {
  if (!user) return null;
  if (isAdminRole(user.role)) {
    const cfg = getPlanConfig("enterprise");
    return {
      planId: "enterprise",
      billing: "yearly",
      limits: { ...cfg },
      isAdmin: true,
    };
  }
  if (user.role === "tenant") {
    const planId = normalizePlanId(user.subscriptionPlan);
    const cfg = getPlanConfig(planId);
    const billing =
      user.subscriptionBilling === "yearly" ? "yearly" : "monthly";
    return {
      planId,
      billing,
      limits: { ...cfg },
    };
  }
  if (user.role === "staff" && user.staffBusinessId) {
    const lim = await getLimitsForBusiness(user.staffBusinessId);
    const biz = await Business.findById(user.staffBusinessId)
      .select("owner")
      .lean();
    let billing = "monthly";
    if (biz?.owner) {
      const owner = await User.findById(biz.owner)
        .select("subscriptionBilling")
        .lean();
      billing = owner?.subscriptionBilling === "yearly" ? "yearly" : "monthly";
    }
    return {
      planId: lim.planId,
      billing,
      limits: { ...lim },
    };
  }
  return null;
}

async function assertStaffCapacity(req, businessId) {
  if (isAdminRole(req.user.role)) return;
  const lim = await getLimitsForBusiness(businessId);
  if (lim.maxStaff == null) return;
  const n = await Staff.countDocuments({ business: businessId });
  if (n >= lim.maxStaff) {
    throw planError(
      `Your ${lim.label} plan allows up to ${lim.maxStaff} team member(s). Upgrade to add more.`,
      { feature: "staff", planId: lim.planId },
    );
  }
}

async function assertServiceCapacity(req, businessId) {
  if (isAdminRole(req.user.role)) return;
  const lim = await getLimitsForBusiness(businessId);
  if (lim.maxServices == null) return;
  const n = await Service.countDocuments({ business: businessId });
  if (n >= lim.maxServices) {
    throw planError(
      `Your ${lim.label} plan allows up to ${lim.maxServices} services. Upgrade to add more.`,
      { feature: "services", planId: lim.planId },
    );
  }
}

async function assertBusinessFeature(req, businessId, feature) {
  if (isAdminRole(req.user.role)) return;
  const lim = await getLimitsForBusiness(businessId);
  const map = {
    analytics: lim.analytics,
    advancedAnalytics: lim.advancedAnalytics,
    coupons: lim.coupons,
    smartRanking: lim.smartRanking,
    webhooks: lim.webhooks,
  };
  if (!map[feature]) {
    const label =
      feature === "advancedAnalytics"
        ? "Advanced analytics"
        : feature === "smartRanking"
          ? "Smart staff ranking"
          : feature === "coupons"
            ? "Coupons"
            : feature === "webhooks"
              ? "Webhooks"
              : "Analytics";
    throw planError(
      `${label} is not included on your ${lim.label} plan. Upgrade to unlock it.`,
      { feature, planId: lim.planId },
    );
  }
}

/**
 * Uses the first workspace business to resolve the owner's plan (tenant/staff).
 */
async function assertWorkspaceAnalytics(req, { advanced = false } = {}) {
  if (isAdminRole(req.user.role)) return;
  const scope = await resolveWorkspaceBusinessIds(req);
  if (scope.error) {
    const err = new Error(scope.error.message);
    err.statusCode = scope.error.status;
    throw err;
  }
  const ids = scope.businessIds;
  if (!ids.length) return;
  const bid = ids[0];
  if (advanced) {
    await assertBusinessFeature(req, bid, "advancedAnalytics");
  } else {
    await assertBusinessFeature(req, bid, "analytics");
  }
}

module.exports = {
  getLimitsForBusiness,
  getEffectiveSubscriptionPayload,
  assertStaffCapacity,
  assertServiceCapacity,
  assertBusinessFeature,
  assertWorkspaceAnalytics,
};
