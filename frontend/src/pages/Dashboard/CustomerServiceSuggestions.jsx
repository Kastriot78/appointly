import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { HiOutlineSparkles, HiOutlineChevronRight } from "react-icons/hi";
import { getMyServiceSuggestions } from "../../api/bookings";
import { getApiErrorMessage } from "../../api/auth";
import "./serviceSuggestions.css";

function formatLastBooked(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Cross-business “book again” strip (history-based).
 * @param {{ variant?: 'dashboard' | 'explore' }} props — `explore` wraps `/book` layout (section + container); hides when empty.
 */
export default function CustomerServiceSuggestions({ variant = "dashboard" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getMyServiceSuggestions();
      setItems(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (e) {
      setError(getApiErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const wrap =
    variant === "explore"
      ? (node) => (
          <section
            className="explore-suggest-wrap"
            aria-label="Suggested bookings"
          >
            <div className="container">{node}</div>
          </section>
        )
      : (node) => node;

  if (loading) {
    return wrap(
      <div
        className="dp-suggest-block dp-suggest-block--loading"
        role="status"
        aria-label="Loading suggestions"
      >
        <div className="dp-suggest-head">
          <span className="dp-skeleton dp-suggest-skel-icon" />
          <span className="dp-skeleton dp-suggest-skel-title" />
        </div>
        <div className="dp-suggest-cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dp-suggest-card dp-suggest-card--skel">
              <span className="dp-skeleton dp-suggest-skel-line" />
              <span className="dp-skeleton dp-suggest-skel-line--short" />
            </div>
          ))}
        </div>
      </div>,
    );
  }

  if (error || items.length === 0) {
    return null;
  }

  return wrap(
    <div className="dp-suggest-block">
      <div className="dp-suggest-head">
        <span className="dp-suggest-icon" aria-hidden>
          <HiOutlineSparkles size={22} />
        </span>
        <div>
          <h3 className="dp-suggest-heading">Suggested for you</h3>
          <p className="dp-suggest-sub">
            Based on services you&apos;ve booked before
          </p>
        </div>
      </div>
      <div className="dp-suggest-cards">
        {items.map((row) => {
          const slug = (row.businessSlug || "").trim();
          if (!slug) return null;
          const href = `/book/${encodeURIComponent(slug)}?book=${encodeURIComponent(row.serviceId)}`;
          const last = formatLastBooked(row.lastBookedAt);
          return (
            <Link key={`${row.businessId}-${row.serviceId}`} className="dp-suggest-card" to={href}>
              <div className="dp-suggest-card-main">
                <span className="dp-suggest-biz">{row.businessName}</span>
                <span className="dp-suggest-svc">{row.serviceName}</span>
                <span className="dp-suggest-meta">
                  {row.bookCount > 1
                    ? `${row.bookCount} completed visits`
                    : "1 completed visit"}
                  {last ? ` · Last ${last}` : ""}
                </span>
              </div>
              <HiOutlineChevronRight className="dp-suggest-arrow" aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>,
  );
}
