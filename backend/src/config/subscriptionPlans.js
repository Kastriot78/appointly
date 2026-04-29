/**
 * Subscription tiers — keep in sync with `frontend/src/data/subscriptionPlans.js` (marketing copy).
 * `maxStaff` / `maxServices`: null means unlimited.
 */

const PLANS = {
  starter: {
    id: "starter",
    label: "Starter",
    maxStaff: 1,
    maxServices: 5,
    analytics: false,
    advancedAnalytics: false,
    coupons: false,
    smartRanking: false,
    webhooks: false,
  },
  professional: {
    id: "professional",
    label: "Professional",
    maxStaff: 5,
    maxServices: 20,
    analytics: true,
    advancedAnalytics: false,
    coupons: true,
    smartRanking: true,
    webhooks: false,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    maxStaff: null,
    maxServices: null,
    analytics: true,
    advancedAnalytics: true,
    coupons: true,
    smartRanking: true,
    webhooks: true,
  },
};

function normalizePlanId(raw) {
  if (raw == null || raw === "") return "starter";
  const s = String(raw).toLowerCase().trim();
  if (s === "pro" || s === "professional") return "professional";
  if (s === "enterprise" || s === "ent") return "enterprise";
  if (s === "starter" || s === "free") return "starter";
  if (PLANS[s]) return s;
  return "starter";
}

function getPlanConfig(planRaw) {
  const id = normalizePlanId(planRaw);
  return PLANS[id] || PLANS.starter;
}

const PLAN_TIER = { starter: 0, professional: 1, enterprise: 2 };

function planTierIndex(rawPlanId) {
  const id = normalizePlanId(rawPlanId);
  return Object.prototype.hasOwnProperty.call(PLAN_TIER, id)
    ? PLAN_TIER[id]
    : 0;
}

module.exports = {
  PLANS,
  normalizePlanId,
  getPlanConfig,
  planTierIndex,
};
