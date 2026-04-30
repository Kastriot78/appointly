import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, Navigate, useSearchParams } from "react-router-dom";
import {
  HiOutlineUsers,
  HiOutlineSearch,
  HiOutlineSwitchVertical,
  HiOutlineFilter,
  HiOutlineUserGroup,
  HiOutlineClock,
} from "react-icons/hi";
import "./dashboard-pages.css";
import {
  listBusinesses,
  getBusinessCustomers,
  getBusinessCustomerServiceHistory,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { getStoredWorkspaceId } from "../../auth/session";
import {
  DashboardSkeletonStack,
  DashboardSkeletonTable,
} from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import CustomSelect from "../../utils/CustomSelect";
import { isCustomerRole, isAdminRole } from "../../utils/roles";

/** Completed visits at or above this count count as VIP (highest segment). */
const VIP_COMPLETED_MIN = 6;

function isVipCustomer(row) {
  return (row.completedCount ?? 0) >= VIP_COMPLETED_MIN;
}

const CUSTOMER_SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "reservations", label: "Most reservations" },
  { value: "completed", label: "Most completed visits" },
  { value: "noShows", label: "Most no-shows" },
];

const HISTORY_STATUS_STYLES = {
  completed: { label: "Completed", color: "#4f46e5", bg: "#eef2ff" },
  confirmed: { label: "Confirmed", color: "#10b981", bg: "#ecfdf5" },
  pending: { label: "Pending", color: "#f59e0b", bg: "#fffbeb" },
  pending_confirmation: {
    label: "Confirm time",
    color: "#d97706",
    bg: "#fffbeb",
  },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "#fef2f2" },
  no_show: { label: "No-show", color: "#64748b", bg: "#f1f5f9" },
};

function formatHistoryDate(d) {
  if (d == null) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const SEGMENT_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "one_plus", label: "Repeat visitors (1+ completed)" },
  { value: "mid", label: "Regulars (2–5 completed)" },
  { value: "loyal", label: "VIP (6+ completed)" },
];

function matchesSegment(row, segment) {
  if (segment === "all") return true;
  const c = row.completedCount ?? 0;
  if (segment === "one_plus") return c >= 1;
  if (segment === "mid") return c >= 2 && c <= 5;
  if (segment === "loyal") return c >= VIP_COMPLETED_MIN;
  return true;
}

const BusinessCustomers = () => {
  const { user, activeWorkspaceId } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSegment = searchParams.get("segment");
  const segment = SEGMENT_OPTIONS.some((o) => o.value === rawSegment)
    ? rawSegment
    : "all";

  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [sortBy, setSortBy] = useState("name");
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyFetchNonce, setHistoryFetchNonce] = useState(0);

  const loadBusinesses = useCallback(async () => {
    if (isCustomerRole(user?.role) || isAdminRole(user?.role)) {
      setLoadingBusinesses(false);
      return;
    }
    setLoadingBusinesses(true);
    setError(null);
    try {
      const { data } = await listBusinesses({ scope: "mine" });
      const list = Array.isArray(data.businesses) ? data.businesses : [];
      setBusinesses(list);
      setBusinessId((prev) => {
        const ws = activeWorkspaceId || getStoredWorkspaceId();
        if (ws && list.some((b) => String(b.id ?? b._id) === ws)) {
          return ws;
        }
        if (prev && list.some((b) => String(b.id ?? b._id) === prev)) {
          return prev;
        }
        if (list.length === 1) {
          return String(list[0].id ?? list[0]._id);
        }
        return "";
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
      setBusinesses([]);
      setBusinessId("");
    } finally {
      setLoadingBusinesses(false);
    }
  }, [user?.role, activeWorkspaceId]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  /** Old ?filter=loyal links → ?segment=loyal */
  useEffect(() => {
    if (searchParams.get("filter") !== "loyal") return;
    const p = new URLSearchParams(searchParams);
    p.delete("filter");
    p.set("segment", "loyal");
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onWs = () => {
      loadBusinesses();
    };
    window.addEventListener("appointly:workspace-changed", onWs);
    return () =>
      window.removeEventListener("appointly:workspace-changed", onWs);
  }, [loadBusinesses]);

  const handleErrorRetry = useCallback(() => {
    setError(null);
    if (!businessId) {
      loadBusinesses();
    } else {
      setRetryNonce((n) => n + 1);
    }
  }, [businessId, loadBusinesses]);

  useEffect(() => {
    if (!businessId) {
      setCustomers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCustomers(true);
      setError(null);
      try {
        const { data } = await getBusinessCustomers(businessId);
        if (!cancelled) {
          setCustomers(Array.isArray(data.customers) ? data.customers : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
          setCustomers([]);
        }
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, retryNonce]);

  useEffect(() => {
    setSearchQuery("");
  }, [businessId]);

  useEffect(() => {
    setHistoryTarget(null);
    setHistoryItems([]);
    setHistoryError(null);
    setHistoryFetchNonce(0);
  }, [businessId]);

  useEffect(() => {
    if (!historyTarget?.customerId || !businessId) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const { data } = await getBusinessCustomerServiceHistory(
          businessId,
          historyTarget.customerId,
        );
        if (!cancelled) {
          setHistoryItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryError(getApiErrorMessage(err));
          setHistoryItems([]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyTarget?.customerId, businessId, historyFetchNonce]);

  useEffect(() => {
    if (segment === "loyal" || segment === "mid") {
      setSortBy("completed");
    }
  }, [segment]);

  const setSegment = useCallback(
    (next) => {
      const p = new URLSearchParams(searchParams);
      if (!next || next === "all") {
        p.delete("segment");
      } else {
        p.set("segment", next);
      }
      setSearchParams(p, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const displayedCustomers = useMemo(() => {
    let list = customers;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const name = String(c.name ?? "").toLowerCase();
        const email = String(c.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    if (segment !== "all") {
      list = list.filter((c) => matchesSegment(c, segment));
    }
    const copy = [...list];
    copy.sort((a, b) => {
      switch (sortBy) {
        case "reservations":
          return (
            (b.reservationCount ?? 0) - (a.reservationCount ?? 0)
          );
        case "completed":
          return (b.completedCount ?? 0) - (a.completedCount ?? 0);
        case "noShows":
          return (b.noShowCount ?? 0) - (a.noShowCount ?? 0);
        case "name":
        default:
          return String(a.name ?? "")
            .toLowerCase()
            .localeCompare(String(b.name ?? "").toLowerCase(), undefined, {
              sensitivity: "base",
            });
      }
    });
    return copy;
  }, [customers, searchQuery, segment, sortBy]);

  const segmentCounts = useMemo(() => {
    const base = customers;
    return {
      all: base.length,
      one_plus: base.filter((c) => matchesSegment(c, "one_plus")).length,
      mid: base.filter((c) => matchesSegment(c, "mid")).length,
      loyal: base.filter((c) => matchesSegment(c, "loyal")).length,
    };
  }, [customers]);

  const selectedBusinessName = useMemo(() => {
    const b = businesses.find(
      (x) => String(x.id ?? x._id) === String(businessId),
    );
    return b?.name?.trim() || "";
  }, [businesses, businessId]);

  const closeHistoryModal = useCallback(() => {
    setHistoryTarget(null);
    setHistoryItems([]);
    setHistoryError(null);
  }, []);

  if (isCustomerRole(user?.role) || isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page dp-customers-page">
      {historyTarget ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={closeHistoryModal}
        >
          <div
            className="dt-modal dt-modal--scroll dp-customer-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-customer-history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-customer-history-title">Service history</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={closeHistoryModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="dp-customer-history-sub">
                <strong>{historyTarget.name?.trim() || "Customer"}</strong>
                {historyTarget.email?.trim() ? (
                  <>
                    {" "}
                    ·{" "}
                    <a href={`mailto:${historyTarget.email.trim()}`}>
                      {historyTarget.email.trim()}
                    </a>
                  </>
                ) : null}
              </p>
              <p className="dp-customer-history-hint">
                Every visit at this business (expired requests excluded). Newest
                first.
              </p>
              {historyError ? (
                <DashboardErrorPanel
                  message={historyError}
                  onRetry={() => setHistoryFetchNonce((n) => n + 1)}
                />
              ) : null}
              {historyLoading ? (
                <p className="dp-subtitle" role="status">
                  Loading history…
                </p>
              ) : null}
              {!historyLoading && !historyError && historyItems.length === 0 ? (
                <p className="dp-subtitle">No bookings to show.</p>
              ) : null}
              {!historyLoading && historyItems.length > 0 ? (
                <ul className="dp-customer-history-timeline">
                  {historyItems.map((item) => {
                    const st =
                      HISTORY_STATUS_STYLES[item.status] ||
                      HISTORY_STATUS_STYLES.confirmed;
                    const reqT = String(item.requestedStartTime || "").trim();
                    const heldT = String(item.startTime || "").trim();
                    const showReq = Boolean(reqT) && reqT !== heldT;
                    return (
                      <li key={item.id} className="dp-customer-history-item">
                        <div className="dp-customer-history-item-marker" aria-hidden />
                        <div className="dp-customer-history-item-card">
                          <div className="dp-customer-history-item-top">
                            <div className="dp-customer-history-item-when">
                              <HiOutlineClock size={16} aria-hidden />
                              <span>
                                {formatHistoryDate(item.date)} · {heldT}
                                {item.endTime ? `–${item.endTime}` : ""}
                              </span>
                            </div>
                            <span
                              className="dp-customer-history-status"
                              style={{ color: st.color, background: st.bg }}
                            >
                              {st.label}
                            </span>
                          </div>
                          <div className="dp-customer-history-services">
                            {item.servicesLabel}
                          </div>
                          <div className="dp-customer-history-meta">
                            <span>
                              Staff: <strong>{item.staff?.name || "—"}</strong>
                            </span>
                            <span>
                              {item.duration} min · {item.price}{" "}
                              {String(item.currency || "EUR").toUpperCase()}
                            </span>
                          </div>
                          {item.notes ? (
                            <div className="dp-customer-history-notes">
                              <span className="dp-customer-history-notes-label">
                                Notes
                              </span>
                              <p>{item.notes}</p>
                            </div>
                          ) : null}
                          {item.cancellationReason ? (
                            <div className="dp-customer-history-cancel">
                              <span className="dp-customer-history-notes-label">
                                Cancellation
                              </span>
                              <p>{item.cancellationReason}</p>
                            </div>
                          ) : null}
                          {showReq ? (
                            <p className="dp-customer-history-requested">
                              Client requested {reqT} · held {heldT}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="dp-header">
        <h1 className="dp-title">Customers</h1>
        <p className="dp-subtitle">
          People who have booked{" "}
          {selectedBusinessName ? (
            <strong>{selectedBusinessName}</strong>
          ) : (
            "your business"
          )}
          . Totals exclude expired bookings. Use <strong>Focus</strong> to slice by
          completed visits (repeat → regulars → VIP); sort independently.
        </p>
      </div>

      {error ? (
        <DashboardErrorPanel message={error} onRetry={handleErrorRetry} />
      ) : (
        <>
      {!loadingBusinesses && businessId ? (
        <div className="dp-customers-toolbar">
          <div className="dp-customers-panel dp-customers-panel--controls">
            <div className="dp-customers-controls-row dp-customers-controls-row--primary">
              <div className="dp-bookings-search dp-customers-search">
                <HiOutlineSearch size={18} aria-hidden />
                <input
                  id="dp-customers-search-input"
                  type="search"
                  className="form-control dp-bookings-search-input"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search customers by name or email"
                />
              </div>
              <div className="dp-customers-sort-wrap">
                <CustomSelect
                  options={CUSTOMER_SORT_OPTIONS}
                  value={sortBy}
                  onChange={setSortBy}
                  icon={<HiOutlineSwitchVertical size={18} strokeWidth={1.5} />}
                  placeholder="Sort by"
                />
              </div>
            </div>
            <div className="dp-customers-focus-block">
              <div className="dp-customers-focus-label">
                <HiOutlineFilter size={18} aria-hidden />
                <span>Focus (by completed visits)</span>
              </div>
              <div className="dp-customers-focus-row align-items-center">
                <div className="dp-customers-segment-wrap">
                  <CustomSelect
                    options={SEGMENT_OPTIONS}
                    value={segment}
                    onChange={setSegment}
                    icon={<HiOutlineUserGroup size={18} strokeWidth={1.5} />}
                    placeholder="Who to show"
                  />
                </div>
                <p className="dp-customers-segment-hint" role="status">
                  {segment === "all" ? (
                    <>
                      <strong>{segmentCounts.all}</strong> customers · VIP:{" "}
                      <strong>{segmentCounts.loyal}</strong>
                    </>
                  ) : (
                    <>
                      <strong>{segmentCounts[segment] ?? 0}</strong> in this
                      focus
                      {searchQuery.trim()
                        ? ` · ${displayedCustomers.length} after search`
                        : ""}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loadingBusinesses ? <DashboardSkeletonStack rows={2} /> : null}

      {!loadingBusinesses && businesses.length === 0 ? (
        <div className="dp-empty dp-customers-empty">
          <span className="dp-empty-icon" aria-hidden>
            <HiOutlineUsers size={40} />
          </span>
          <h3>No businesses yet</h3>
          <p>Create a business first to see customers who book with you.</p>
        </div>
      ) : null}

      {!loadingBusinesses && businesses.length > 0 && !businessId ? (
        <p className="dp-subtitle">
          Choose a workspace in the sidebar to load customers.
        </p>
      ) : null}

      {businessId && !loadingBusinesses ? (
        <>
          {loadingCustomers ? (
            <DashboardSkeletonTable cols={6} rows={6} />
          ) : null}
          {!loadingCustomers && customers.length === 0 ? (
            <div className="dp-empty dp-customers-empty">
              <span className="dp-empty-icon" aria-hidden>
                <HiOutlineUsers size={40} />
              </span>
              <h3>No customers yet</h3>
              <p>No bookings for this business (excluding expired).</p>
            </div>
          ) : null}
          {!loadingCustomers &&
          customers.length > 0 &&
          displayedCustomers.length === 0 &&
          searchQuery.trim() ? (
            <div className="dp-empty dp-customers-empty dp-customers-search-empty">
              <h3>No matches</h3>
              <p>Try a different name or email.</p>
            </div>
          ) : null}
          {!loadingCustomers &&
          customers.length > 0 &&
          displayedCustomers.length === 0 &&
          !searchQuery.trim() &&
          segment !== "all" ? (
            <div className="dp-empty dp-customers-empty dp-customers-search-empty">
              <h3>Nobody in this focus</h3>
              <p>
                {segment === "loyal"
                  ? `No customers with ${VIP_COMPLETED_MIN}+ completed visits yet. Try “Regulars” or “Everyone”.`
                  : segment === "mid"
                    ? "No customers with 2–5 completed visits. Try another focus."
                    : "No customers with at least one completed visit. Try “Everyone”."}
              </p>
            </div>
          ) : null}
          {!loadingCustomers && displayedCustomers.length > 0 ? (
            <div className="dp-customers-table-wrap">
              <table className="dp-customers-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col" className="dp-customers-num">
                      Reservations
                    </th>
                    <th scope="col" className="dp-customers-num">
                      Completed
                    </th>
                    <th scope="col" className="dp-customers-num">
                      No-shows
                    </th>
                    <th scope="col" className="dp-customers-history-col">
                      History
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCustomers.map((row) => (
                    <tr key={row.customerId}>
                      <td>
                        <span className="dp-customers-name-cell">
                          {row.name?.trim() || "—"}
                          {isVipCustomer(row) ? (
                            <span
                              className="dp-customers-vip-badge"
                              title={`${VIP_COMPLETED_MIN}+ completed visits`}
                            >
                              VIP
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        {row.email?.trim() ? (
                          <a href={`mailto:${row.email.trim()}`}>
                            {row.email.trim()}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="dp-customers-num">
                        {row.reservationCount ?? 0}
                      </td>
                      <td className="dp-customers-num">
                        {row.completedCount ?? 0}
                      </td>
                      <td className="dp-customers-num">
                        {row.noShowCount ?? 0}
                      </td>
                      <td className="dp-customers-history-col">
                        <button
                          type="button"
                          className="dp-customers-history-btn"
                          onClick={() =>
                            setHistoryTarget({
                              customerId: row.customerId,
                              name: row.name,
                              email: row.email,
                            })
                          }
                        >
                          Timeline
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
        </>
      )}
    </div>
  );
};

export default BusinessCustomers;
