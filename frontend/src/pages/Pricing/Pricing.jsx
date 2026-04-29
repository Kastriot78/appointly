import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  PRICING_PLANS,
  COMPARISON_FEATURES,
  PLAN_MARKETING_FOOTNOTE,
  subscriptionMatchesCatalogPlan,
  normalizePlanId,
  planTierIndex,
} from "../../data/subscriptionPlans";

const Pricing = () => {
  const { user } = useAuth();
  const subscription = useMemo(() => user?.subscription ?? null, [user]);
  const subscriptionTier = useMemo(() => {
    if (!subscription?.planId || subscription.isAdmin) return -1;
    return planTierIndex(normalizePlanId(subscription.planId));
  }, [subscription]);
  const [isYearly, setIsYearly] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [tableVisible, setTableVisible] = useState(false);

  const cardsRef = useRef(null);
  const tableRef = useRef(null);

  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 100);
  }, []);

  useEffect(() => {
    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.dataset.section;
          if (id === "cards") setCardsVisible(true);
          if (id === "table") setTableVisible(true);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, {
      threshold: 0.1,
    });

    if (cardsRef.current) observer.observe(cardsRef.current);
    if (tableRef.current) observer.observe(tableRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <main className="pricing-page">
      <section className="pricing-hero">
        <div className="pricing-hero-bg">
          <div className="pricing-orb pricing-orb--1" />
          <div className="pricing-orb pricing-orb--2" />
          <div className="pricing-orb pricing-orb--3" />
        </div>
        <div className="container">
          <div
            className={`pricing-hero-content ${heroVisible ? "visible" : ""}`}
          >
            <span className="pricing-eyebrow">Simple, Transparent Pricing</span>
            <h1 className="pricing-hero-title">
              Find The Perfect Plan For{" "}
              <span className="gradient-text">Your Business</span>
            </h1>
            <p className="pricing-hero-subtitle">
              Every business account starts on Starter; upgrade when you need
              more. No hidden fees — cancel anytime.
            </p>
          </div>
        </div>
      </section>

      <section className="pricing-cards-section">
        <div className="container">
          <p
            className="pricing-hero-subtitle"
            style={{
              textAlign: "center",
              marginTop: "0",
              marginBottom: "36px",
              maxWidth: "720px",
              marginLeft: "auto",
              marginRight: "auto",
              fontSize: "15px",
            }}
          >
            {PLAN_MARKETING_FOOTNOTE}
          </p>

          <div className="pricing-toggle">
            <span className={!isYearly ? "active" : ""}>Monthly</span>
            <button
              className={`toggle-switch ${isYearly ? "yearly" : ""}`}
              onClick={() => setIsYearly(!isYearly)}
              aria-label="Toggle billing period"
            >
              <div className="toggle-knob" />
            </button>
            <span className={isYearly ? "active" : ""}>
              Yearly
              <span className="save-badge">Save 20%</span>
            </span>
          </div>
        </div>
      </section>

      <section
        className="pricing-cards-section"
        ref={cardsRef}
        data-section="cards"
      >
        <div className="container">
          <div className="pricing-cards-grid">
            {PRICING_PLANS.map((plan, index) => {
              const checkoutHref = plan.checkout
                ? `/pricing/checkout?plan=${encodeURIComponent(plan.id)}&billing=${isYearly ? "yearly" : "monthly"}`
                : plan.signUpPath;

              const alreadyOnThisPlan =
                Boolean(subscription) &&
                subscriptionMatchesCatalogPlan(subscription, plan, isYearly);
              const cardTier = planTierIndex(plan.id);
              const isDowngrade =
                subscriptionTier >= 0 &&
                cardTier < subscriptionTier &&
                !alreadyOnThisPlan;

              const ctaHref = alreadyOnThisPlan ? "/dashboard" : checkoutHref;
              const ctaLabel = alreadyOnThisPlan ? "Current plan" : plan.cta;
              const ctaClass = alreadyOnThisPlan
                ? "pricing-cta cta-secondary cta-current"
                : `pricing-cta ${plan.highlighted ? "cta-primary" : "cta-secondary"}`;

              const ctaArrow = (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M3 8H13M13 8L9 4M13 8L9 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              );

              return (
                <div
                  key={plan.id}
                  className={`pricing-card ${plan.highlighted ? "highlighted" : ""} ${cardsVisible ? "visible" : ""}`}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  {plan.badge && (
                    <div className="pricing-badge">{plan.badge}</div>
                  )}

                  <div className="pricing-card-header">
                    <h3 className="plan-name">{plan.name}</h3>
                    <p className="plan-tagline">{plan.tagline}</p>

                    <div className="plan-price">
                      <div className="price-wrapper">
                        <span className="currency">$</span>
                        <span className="amount" key={isYearly ? "y" : "m"}>
                          {isYearly ? plan.yearlyPrice : plan.monthlyPrice}
                        </span>
                      </div>
                      <span className="period">
                        {plan.monthlyPrice === 0
                          ? "forever"
                          : `/ month${isYearly ? ", billed yearly" : ""}`}
                      </span>
                    </div>
                  </div>

                  <div className="pricing-card-features">
                    {plan.features.map((feature, i) => (
                      <div
                        key={i}
                        className={`feature-row ${feature.included ? "included" : "excluded"}`}
                      >
                        <div className="feature-check">
                          {feature.included ? (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                            >
                              <path
                                d="M3 8.5L6.5 12L13 4"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                            >
                              <path
                                d="M4 12L12 4M4 4L12 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        <span>{feature.text}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pricing-card-footer">
                    {alreadyOnThisPlan ? (
                      <Link to={ctaHref} className={ctaClass}>
                        {ctaLabel}
                        {ctaArrow}
                      </Link>
                    ) : isDowngrade ? (
                      <span
                        className="pricing-cta cta-secondary pricing-cta--disabled"
                        title="You're on a higher plan. Downgrading isn't available here."
                        aria-disabled="true"
                      >
                        Included in your plan
                        {ctaArrow}
                      </span>
                    ) : (
                      <Link to={checkoutHref} className={ctaClass}>
                        {plan.cta}
                        {ctaArrow}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="comparison-section"
        ref={tableRef}
        data-section="table"
      >
        <div className="container">
          <div className={`comparison-header ${tableVisible ? "visible" : ""}`}>
            <h2>Compare All Features</h2>
            <p>See exactly what's included in each plan</p>
          </div>

          <div
            className={`comparison-table-wrapper ${tableVisible ? "visible" : ""}`}
          >
            <table className="comparison-table">
              <thead>
                <tr>
                  <th className="feature-col">Feature</th>
                  <th>Starter</th>
                  <th className="pro-col">Professional</th>
                  <th>Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((feature, index) => (
                  <tr
                    key={feature.name}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className={tableVisible ? "visible" : ""}
                  >
                    <td className="feature-col">{feature.name}</td>
                    <td>
                      {typeof feature.starter === "boolean" ? (
                        feature.starter ? (
                          <span className="check-yes">✓</span>
                        ) : (
                          <span className="check-no">—</span>
                        )
                      ) : (
                        <span className="feature-value">{feature.starter}</span>
                      )}
                    </td>
                    <td className="pro-col">
                      {typeof feature.pro === "boolean" ? (
                        feature.pro ? (
                          <span className="check-yes">✓</span>
                        ) : (
                          <span className="check-no">—</span>
                        )
                      ) : (
                        <span className="feature-value">{feature.pro}</span>
                      )}
                    </td>
                    <td>
                      {typeof feature.enterprise === "boolean" ? (
                        feature.enterprise ? (
                          <span className="check-yes">✓</span>
                        ) : (
                          <span className="check-no">—</span>
                        )
                      ) : (
                        <span className="feature-value">
                          {feature.enterprise}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Pricing;
