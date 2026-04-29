import { useMemo, useState, useCallback, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlineCreditCard, HiOutlineLockClosed } from "react-icons/hi";
import { useAuth } from "../../auth/AuthContext";
import { demoCheckout } from "../../api/subscription";
import { getApiErrorMessage } from "../../api/auth";
import { isTenantAccount } from "../../utils/roles";
import {
  getPlanById,
  normalizePlanId,
  getDisplayPrice,
  PLAN_REALITY_NOTE,
  subscriptionMatchesCatalogPlan,
} from "../../data/subscriptionPlans";
import "./pricing-checkout.css";

function formatCardInput(raw) {
  const d = raw.replace(/\D/g, "").slice(0, 19);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function parseExpiry(expiryRaw) {
  const t = expiryRaw.replace(/\s/g, "").replace(/\//g, "");
  if (t.length !== 4) return null;
  const mm = parseInt(t.slice(0, 2), 10);
  const yy = parseInt(t.slice(2, 4), 10);
  if (Number.isNaN(mm) || Number.isNaN(yy) || mm < 1 || mm > 12) return null;
  return { mm, yy };
}

function expiryNotPast({ mm, yy }) {
  const now = new Date();
  const yFull = 2000 + yy;
  const last = new Date(yFull, mm, 0, 23, 59, 59);
  return last.getTime() >= now.getTime();
}

const initialErrors = {
  name: "",
  card: "",
  expiry: "",
  cvc: "",
};

export default function PricingCheckout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const planParam = searchParams.get("plan");
  const billingParam = searchParams.get("billing");

  const plan = useMemo(() => getPlanById(planParam), [planParam]);
  const [yearly, setYearly] = useState(
    billingParam === "yearly" || billingParam === "annual",
  );

  useEffect(() => {
    if (billingParam === "yearly" || billingParam === "annual") {
      setYearly(true);
    } else if (billingParam === "monthly") {
      setYearly(false);
    }
  }, [billingParam]);

  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [errors, setErrors] = useState(initialErrors);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const syncBillingQuery = useCallback(
    (nextYearly) => {
      const next = new URLSearchParams(searchParams);
      next.set("billing", nextYearly ? "yearly" : "monthly");
      if (planParam) next.set("plan", normalizePlanId(planParam));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, planParam],
  );

  const setYearlyAndSync = (v) => {
    setYearly(v);
    syncBillingQuery(v);
  };

  useEffect(() => {
    if (!plan || !plan.checkout) {
      navigate("/pricing", { replace: true });
    }
  }, [plan, navigate]);

  /** Skip fake checkout when this plan + billing is already on the account. */
  useEffect(() => {
    if (!plan?.checkout || !user?.subscription) return;
    if (subscriptionMatchesCatalogPlan(user.subscription, plan, yearly)) {
      navigate("/dashboard", { replace: true });
    }
  }, [plan, user?.subscription, yearly, navigate]);

  const price = plan ? getDisplayPrice(plan, yearly) : 0;

  const validate = () => {
    const e = { ...initialErrors };
    let ok = true;
    if (!name.trim()) {
      e.name = "Enter the name on the card.";
      ok = false;
    }
    const digits = card.replace(/\D/g, "");
    if (digits.length < 12 || digits.length > 19) {
      e.card = "Enter a card number (12–19 digits — demo only).";
      ok = false;
    }
    const exp = parseExpiry(expiry);
    if (!exp) {
      e.expiry = "Use MM / YY (e.g. 12 / 30).";
      ok = false;
    } else if (!expiryNotPast(exp)) {
      e.expiry = "Card appears expired.";
      ok = false;
    }
    const cvcDigits = cvc.replace(/\D/g, "");
    if (cvcDigits.length < 3 || cvcDigits.length > 4) {
      e.cvc = "Enter 3–4 digit CVC.";
      ok = false;
    }
    setErrors(e);
    return ok;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!plan?.checkout || submitting) return;
    setApiError("");
    if (!validate()) return;
    setSubmitting(true);
    const id = normalizePlanId(plan.id);
    const billing = yearly ? "yearly" : "monthly";
    try {
      if (user && isTenantAccount(user.role)) {
        const { data } = await demoCheckout({ planId: id, billing });
        refreshUser(data.user);
        navigate("/dashboard", { replace: true });
        return;
      }
      sessionStorage.setItem(
        "appointly_pending_demo_plan",
        JSON.stringify({ planId: id, billing }),
      );
      navigate(
        `/sign-up?plan=${encodeURIComponent(id)}&billing=${billing}&checkout=demo`,
      );
    } catch (err) {
      setApiError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onExpiryInput = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    let out = d;
    if (d.length >= 2) {
      out = `${d.slice(0, 2)} / ${d.slice(2)}`;
    }
    setExpiry(out);
  };

  if (!plan || !plan.checkout) {
    return null;
  }

  const yearlyTotal = plan.yearlyPrice * 12;

  return (
    <main className="pricing-page pricing-checkout">
      <div className="pricing-checkout-inner">
        <Link className="pricing-checkout-back" to="/pricing">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to pricing
        </Link>

        <h1 className="pricing-checkout-title">Complete your plan</h1>
        <p className="pricing-checkout-sub">
          Demo checkout for <strong>{plan.name}</strong> — no real charge; plan
          is saved on your business account after you continue.
        </p>

        <div className="pricing-checkout-notice" role="note">
          <span className="pricing-checkout-notice__label">Demo</span>
          <span className="pricing-checkout-notice__text">{PLAN_REALITY_NOTE}</span>
        </div>

        <div className="pricing-checkout-grid">
          <aside className="pricing-checkout-summary">
            <h2>Order summary</h2>
            <p className="pc-sum-plan">{plan.name}</p>
            <p className="pc-sum-tag">{plan.tagline}</p>

            <div
              className="pc-billing-block"
              role="group"
              aria-label="Billing period"
            >
              <div className="pc-billing-toggle">
                <button
                  type="button"
                  className={!yearly ? "active" : ""}
                  onClick={() => setYearlyAndSync(false)}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={yearly ? "active" : ""}
                  onClick={() => setYearlyAndSync(true)}
                >
                  <span className="pc-billing-toggle__main">Yearly</span>
                  <span className="pc-billing-toggle__save">Save 20%</span>
                </button>
              </div>
            </div>

            <div className="pc-sum-row pc-sum-row--muted">
              <span>Plan price</span>
              <div className="pc-price-block">
                <strong className="pc-price-block__amount">
                  ${price}
                  <span className="pc-price-block__unit">/mo</span>
                </strong>
                {yearly && plan.monthlyPrice > 0 ? (
                  <span className="pc-price-block__caption">
                    Billed as <strong>${yearlyTotal}</strong> per year (demo
                    math)
                  </span>
                ) : null}
              </div>
            </div>
            <div className="pc-sum-total">
              <span className="pc-sum-total__label">Due today</span>
              <span className="pc-sum-total__value">
                $0.00 <span className="pc-sum-total__hint">(demo)</span>
              </span>
            </div>
          </aside>

          <div className="pricing-checkout-form-wrap">
            <h2>
              <HiOutlineCreditCard size={22} aria-hidden />
              Payment details
            </h2>

            <form onSubmit={handleSubmit} noValidate>
              {apiError ? (
                <div className="pc-field-error pc-field-error--banner" role="alert">
                  {apiError}
                </div>
              ) : null}
              <div className="pc-field">
                <label htmlFor="pc-name">Name on card</label>
                <input
                  id="pc-name"
                  name="name"
                  autoComplete="cc-name"
                  className={errors.name ? "pc-input-error" : ""}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                />
                {errors.name ? (
                  <p className="pc-field-error">{errors.name}</p>
                ) : null}
              </div>

              <div className="pc-field">
                <label htmlFor="pc-card">Card number</label>
                <input
                  id="pc-card"
                  name="card"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  className={errors.card ? "pc-input-error" : ""}
                  value={card}
                  onChange={(e) => setCard(formatCardInput(e.target.value))}
                  placeholder="4242 4242 4242 4242"
                />
                <p className="pc-field-hint">
                  Demo: any 12–19 digit number is accepted (e.g. 4242 4242 4242
                  4242).
                </p>
                {errors.card ? (
                  <p className="pc-field-error">{errors.card}</p>
                ) : null}
              </div>

              <div className="pc-row2">
                <div className="pc-field">
                  <label htmlFor="pc-exp">Expiry</label>
                  <input
                    id="pc-exp"
                    name="expiry"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    className={errors.expiry ? "pc-input-error" : ""}
                    value={expiry}
                    onChange={(e) => onExpiryInput(e.target.value)}
                    placeholder="MM / YY"
                  />
                  {errors.expiry ? (
                    <p className="pc-field-error">{errors.expiry}</p>
                  ) : null}
                </div>
                <div className="pc-field">
                  <label htmlFor="pc-cvc">CVC</label>
                  <input
                    id="pc-cvc"
                    name="cvc"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    className={errors.cvc ? "pc-input-error" : ""}
                    value={cvc}
                    onChange={(e) =>
                      setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="123"
                  />
                  {errors.cvc ? (
                    <p className="pc-field-error">{errors.cvc}</p>
                  ) : null}
                </div>
              </div>

              <div className="pc-secure">
                <HiOutlineLockClosed size={18} aria-hidden />
                Encrypted look &amp; feel only — data stays in your browser for
                this demo.
              </div>

              <button
                type="submit"
                className="pc-submit"
                disabled={submitting}
              >
                {submitting ? "Processing…" : `Continue — ${plan.name}`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
