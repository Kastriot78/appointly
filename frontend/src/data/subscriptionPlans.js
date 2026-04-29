/**
 * Marketing + checkout plan definitions (single source of truth for /pricing).
 * The API persists `subscriptionPlan` / `subscriptionBilling` on tenant users and
 * enforces limits per workspace (staff count, services, feature flags). Checkout
 * is still demo-only — no payment processor.
 */

/** Shown on /pricing — keeps expectations clear without repeating the full checkout copy. */
export const PLAN_MARKETING_FOOTNOTE =
  "Plans and limits are enforced for business accounts after checkout (demo — no real charge). New signups start on Starter; upgrade anytime from Pricing.";

/** Full copy on the checkout page + test-card hint. */
export const PLAN_REALITY_NOTE =
  "This checkout is a demo: no payment is processed, but your chosen plan is saved on your business account. You can use any card number (12–19 digits). Test card 4242 4242 4242 4242 still works.";

/** @param {string | null | undefined} raw */
export function normalizePlanId(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .trim();
  if (s === "pro" || s === "professional") return "professional";
  if (s === "ent" || s === "enterprise") return "enterprise";
  if (s === "starter" || s === "free") return "starter";
  return s;
}

export const PRICING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For solo professionals",
    monthlyPrice: 0,
    yearlyPrice: 0,
    highlighted: false,
    badge: null,
    features: [
      { text: "1 Staff Member", included: true },
      { text: "Up to 5 Services", included: true },
      { text: "Online Booking Page", included: true },
      { text: "Email Confirmations", included: true },
      { text: "Basic Calendar View", included: true },
      { text: "SMS Reminders", included: false },
      { text: "Payment Collection", included: false },
      { text: "Analytics Dashboard", included: false },
      { text: "Custom Branding", included: false },
      { text: "Priority Support", included: false },
    ],
    cta: "Get started",
    /** Default plan after signup — no card step */
    checkout: false,
    signUpPath: "/sign-up",
  },
  {
    id: "professional",
    name: "Professional",
    tagline: "For growing businesses",
    monthlyPrice: 29,
    yearlyPrice: 24,
    highlighted: true,
    badge: "Most Popular",
    features: [
      { text: "Up to 5 Staff Members", included: true },
      { text: "Up to 20 Services", included: true },
      { text: "Online Booking Page", included: true },
      { text: "Email Confirmations", included: true },
      { text: "Full Calendar Management", included: true },
      { text: "SMS Reminders", included: true },
      { text: "Payment Collection (Stripe)", included: true },
      { text: "Analytics Dashboard", included: true },
      { text: "Custom Branding", included: false },
      { text: "Priority Support", included: false },
    ],
    cta: "Start Free Trial",
    checkout: true,
    signUpPath: "/sign-up",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For multi-location teams",
    monthlyPrice: 79,
    yearlyPrice: 66,
    highlighted: false,
    badge: null,
    features: [
      { text: "Unlimited Staff Members", included: true },
      { text: "Unlimited Services", included: true },
      { text: "Online Booking Page", included: true },
      { text: "Email Confirmations", included: true },
      { text: "Full Calendar Management", included: true },
      { text: "SMS Reminders", included: true },
      { text: "Payment Collection (Stripe)", included: true },
      { text: "Advanced Analytics & Reports", included: true },
      { text: "Custom Branding & Domain", included: true },
      { text: "Priority Support & Onboarding", included: true },
    ],
    cta: "Subscribe",
    checkout: true,
    signUpPath: "/sign-up",
  },
];

export const COMPARISON_FEATURES = [
  {
    name: "Staff Members",
    starter: "1",
    pro: "Up to 5",
    enterprise: "Unlimited",
  },
  { name: "Services", starter: "5", pro: "20", enterprise: "Unlimited" },
  { name: "Online Booking", starter: true, pro: true, enterprise: true },
  { name: "Email Notifications", starter: true, pro: true, enterprise: true },
  { name: "SMS Reminders", starter: false, pro: true, enterprise: true },
  { name: "Online Payments", starter: false, pro: true, enterprise: true },
  { name: "Analytics", starter: false, pro: true, enterprise: true },
  { name: "Custom Branding", starter: false, pro: false, enterprise: true },
  { name: "Custom Domain", starter: false, pro: false, enterprise: true },
  { name: "API Access", starter: false, pro: false, enterprise: true },
  { name: "Priority Support", starter: false, pro: false, enterprise: true },
  {
    name: "Dedicated Onboarding",
    starter: false,
    pro: false,
    enterprise: true,
  },
];

/** Order for upgrade / downgrade (marketing catalog only). */
const PLAN_TIER = { starter: 0, professional: 1, enterprise: 2 };

/** @param {string | null | undefined} rawPlanId */
export function planTierIndex(rawPlanId) {
  const id = normalizePlanId(rawPlanId);
  return Object.prototype.hasOwnProperty.call(PLAN_TIER, id)
    ? PLAN_TIER[id]
    : 0;
}

/**
 * True when `user.subscription` is already this catalog row and billing period.
 * @param {null | undefined | { planId?: string, billing?: string }} subscription
 * @param {{ id: string }} plan
 * @param {boolean} pageYearly pricing page / checkout toggle
 */
export function subscriptionMatchesCatalogPlan(subscription, plan, pageYearly) {
  if (!subscription?.planId || !plan?.id) return false;
  if (normalizePlanId(subscription.planId) !== normalizePlanId(plan.id)) {
    return false;
  }
  const subBilling = subscription.billing === "yearly" ? "yearly" : "monthly";
  const want = pageYearly ? "yearly" : "monthly";
  return subBilling === want;
}

/** @param {string | null | undefined} raw */
export function getPlanById(raw) {
  const id = normalizePlanId(raw);
  return PRICING_PLANS.find((p) => p.id === id) || null;
}

/** @param {{ monthlyPrice: number, yearlyPrice: number }} plan @param {boolean} yearly */
export function getDisplayPrice(plan, yearly) {
  if (!plan || plan.monthlyPrice === 0) return 0;
  return yearly ? plan.yearlyPrice : plan.monthlyPrice;
}
