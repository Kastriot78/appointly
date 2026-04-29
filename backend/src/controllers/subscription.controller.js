const User = require("../models/User");
const { isTenantRole } = require("../utils/roleChecks");
const {
  normalizePlanId,
  PLANS,
  planTierIndex,
} = require("../config/subscriptionPlans");
const { userMeResponseById } = require("../utils/userMeResponse");

/**
 * POST /api/subscription/demo-checkout
 * Body: { planId, billing?: "monthly"|"yearly" }
 * Demo only — updates the tenant's plan in DB (no payment processor).
 */
async function demoCheckout(req, res) {
  if (!isTenantRole(req.user.role)) {
    return res.status(403).json({
      message: "Only business accounts can manage a subscription.",
    });
  }

  const { planId: rawPlan, billing: rawBilling } = req.body || {};
  const planId = normalizePlanId(rawPlan);
  if (!PLANS[planId]) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  const billing = rawBilling === "yearly" ? "yearly" : "monthly";

  const existing = await User.findById(req.userId)
    .select("subscriptionPlan")
    .lean();
  const currentPlanId = normalizePlanId(existing?.subscriptionPlan);
  if (planTierIndex(planId) < planTierIndex(currentPlanId)) {
    return res.status(400).json({
      message:
        "Downgrading to a lower plan is not available. Contact support if you need to change tiers.",
    });
  }

  await User.updateOne(
    { _id: req.userId },
    { $set: { subscriptionPlan: planId, subscriptionBilling: billing } },
  );

  const user = await userMeResponseById(req.userId);
  return res.json({
    message: "Subscription updated (demo checkout — no charge processed).",
    user,
  });
}

module.exports = { demoCheckout };
