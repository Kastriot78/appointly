import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { HiOutlineCurrencyEuro } from "react-icons/hi";
import { getMySpendingByBusiness } from "../../api/bookings";
import { getApiErrorMessage } from "../../api/auth";
import { resolveMediaUrl } from "../../utils/assets";
import { DashboardSkeletonSpending } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import "./dashboard-pages.css";
import { formatMoneyAmount, normalizeCurrency } from "../../utils/currency";

const CustomerSpending = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rows, setRows] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [basis, setBasis] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await getMySpendingByBusiness();
      setRows(Array.isArray(data.businesses) ? data.businesses : []);
      setGrandTotal(
        typeof data.grandTotal === "number" ? data.grandTotal : 0,
      );
      setBasis(typeof data.basis === "string" ? data.basis : "");
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setRows([]);
      setGrandTotal(0);
      setBasis("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const distinctCurrencies = useMemo(() => {
    const s = new Set(rows.map((r) => normalizeCurrency(r.currency)));
    return [...s];
  }, [rows]);

  const grandTotalLabel =
    rows.length === 0
      ? formatMoneyAmount(0, "EUR")
      : distinctCurrencies.length === 1
        ? formatMoneyAmount(grandTotal, distinctCurrencies[0])
        : "—";

  return (
    <div className="dp-page dp-customer-spending-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Your spending</h1>
          <p className="dp-subtitle">
            How much you&apos;ve spent at each business after visits marked{" "}
            <strong>completed</strong> (the price on each booking).
          </p>
        </div>
      </div>

      {basis && !loadError ? (
        <p className="dp-customer-spending-basis" role="note">
          {basis}
        </p>
      ) : null}

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={load} />
      ) : loading ? (
        <DashboardSkeletonSpending rows={5} />
      ) : (
        <>
          <div className="dp-customer-spending-total">
            <HiOutlineCurrencyEuro size={28} aria-hidden />
            <div>
              <span className="dp-customer-spending-total-label">
                Total across all businesses
              </span>
              <span className="dp-customer-spending-total-value">
                {grandTotalLabel}
              </span>
            </div>
          </div>
          {rows.length > 1 && distinctCurrencies.length > 1 ? (
            <p className="dp-customer-spending-basis" role="note">
              Combined total isn&apos;t shown when businesses use different
              currencies — see each row below.
            </p>
          ) : null}

          {rows.length === 0 ? (
            <div className="dp-empty dp-customer-spending-empty">
              <p>
                No completed visits yet — when a business marks your appointment
                as completed, it will count toward your spending here.
              </p>
              <Link to="/book" className="dp-btn-primary dp-customer-spending-cta">
                Find a business to book
              </Link>
            </div>
          ) : (
            <ul className="dp-customer-spending-list">
              {rows.map((r) => {
                const logoSrc = resolveMediaUrl(r.logo);
                return (
                <li key={r.businessId} className="dp-customer-spending-card">
                  <div className="dp-customer-spending-card-main">
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt=""
                        className="dp-customer-spending-logo"
                      />
                    ) : (
                      <div
                        className="dp-customer-spending-logo dp-customer-spending-logo--placeholder"
                        aria-hidden
                      />
                    )}
                    <div>
                      <h2 className="dp-customer-spending-biz-name">
                        {r.slug ? (
                          <Link to={`/book/${encodeURIComponent(r.slug)}`}>
                            {r.businessName}
                          </Link>
                        ) : (
                          r.businessName
                        )}
                      </h2>
                      <p className="dp-customer-spending-meta">
                        {r.bookingCount}{" "}
                        {r.bookingCount === 1 ? "visit" : "visits"}
                      </p>
                    </div>
                  </div>
                  <div className="dp-customer-spending-amount">
                    {formatMoneyAmount(
                      r.totalSpent,
                      normalizeCurrency(r.currency),
                    )}
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default CustomerSpending;
