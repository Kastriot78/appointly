import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useParams,
  Navigate,
  useNavigate,
  Link,
  useLocation,
  useOutletContext,
} from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineSearch,
  HiOutlineX,
} from "react-icons/hi";
import {
  getStaffSmartRanking,
  getStaffSmartRankingFeedback,
  getBusiness,
  updateBusiness,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import { canAccessMyBusinessesNav } from "../../utils/roles";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { DashboardPageSkeletonDefault } from "../../components/DashboardPageSkeleton";
import {
  parseSmartStaffRankingFromApi,
  SMART_RANK_LABELS,
  DEFAULT_SMART_RANK_PRIORITY,
} from "../../utils/smartStaffRankingSettings";
import "./dashboard-pages.css";

function formatFeedbackDate(iso) {
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

const StaffSmartRankingPage = () => {
  const { businessId } = useParams();
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (!businessId) return;
    if (String(activeWorkspaceId) === String(businessId)) return;
    navigate(`/dashboard/businesses/${activeWorkspaceId}/staff-ranking`, {
      replace: true,
    });
  }, [activeWorkspaceId, businessId, navigate]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [settings, setSettings] = useState(() =>
    parseSmartStaffRankingFromApi({}),
  );
  const [saving, setSaving] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  /** @type {null | { staffId: string, name: string, role: string, loading: boolean, error: string | null, items: Array<{ text: string, rating: number, createdAt: string }>, ratingAverage: number | null, totalCount: number, truncated: boolean }} */
  const [feedbackModal, setFeedbackModal] = useState(null);

  useEffect(() => {
    setStaffSearchQuery("");
    setFeedbackModal(null);
  }, [businessId]);

  useEffect(() => {
    if (!feedbackModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFeedbackModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedbackModal]);

  const loadPreview = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await getStaffSmartRanking(businessId);
      setPreview(data);
      if (data?.smartStaffRanking) {
        setSettings(parseSmartStaffRankingFromApi({ smartStaffRanking: data.smartStaffRanking }));
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const openStaffFeedbackModal = (row) => {
    if (!businessId || !row?.id) return;
    setFeedbackModal({
      staffId: row.id,
      name: row.name || "",
      role: row.role || "",
      loading: true,
      error: null,
      items: [],
      ratingAverage: null,
      totalCount: 0,
      truncated: false,
    });
    void (async () => {
      try {
        const { data } = await getStaffSmartRankingFeedback(
          businessId,
          row.id,
        );
        setFeedbackModal((m) =>
          m && m.staffId === row.id
            ? {
                ...m,
                loading: false,
                items: Array.isArray(data?.items) ? data.items : [],
                ratingAverage:
                  data?.ratingAverage != null ? data.ratingAverage : null,
                totalCount: Number(data?.totalCount) || 0,
                truncated: Boolean(data?.truncated),
              }
            : m,
        );
      } catch (err) {
        setFeedbackModal((m) =>
          m && m.staffId === row.id
            ? {
                ...m,
                loading: false,
                error: getApiErrorMessage(err),
              }
            : m,
        );
      }
    })();
  };

  const filteredStaff = useMemo(() => {
    const list = preview?.staff;
    if (!Array.isArray(list)) return [];
    const q = staffSearchQuery.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return list;
    return list.filter((row) => {
      const name = String(row.name || "")
        .toLowerCase()
        .replace(/\s+/g, " ");
      return name.includes(q);
    });
  }, [preview?.staff, staffSearchQuery]);

  const saveSettings = async () => {
    if (!businessId) return;
    setSaving(true);
    try {
      const { data: bizRes } = await getBusiness(businessId);
      const br = bizRes?.business?.bookingRules || {};
      const sr = parseSmartStaffRankingFromApi({
        smartStaffRanking: settings,
      });
      await updateBusiness(businessId, {
        bookingRules: {
          ...br,
          smartStaffRanking: {
            enabled: sr.enabled,
            tieBreakEarliestShift: sr.tieBreakEarliestShift,
            priority: sr.priority,
          },
        },
      });
      showToast("Smart staff ranking saved.", "success");
      await loadPreview();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (user && !canAccessMyBusinessesNav(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const subLimits = user?.subscription?.limits;
  const subAdmin = Boolean(user?.subscription?.isAdmin);
  if (
    user &&
    canAccessMyBusinessesNav(user.role) &&
    !subAdmin &&
    !subLimits?.smartRanking
  ) {
    return (
      <Navigate
        to="/pricing"
        replace
        state={{
          upgradeFeature: "smartRanking",
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  return (
    <div className="dp-page ssr-page">
      <div className="dp-header">
        <div>
          <Link
            to={`/dashboard/businesses/${businessId}/staff`}
            className="be-back"
            style={{ marginBottom: 12 }}
          >
            <HiOutlineArrowLeft size={18} />
            Back to staff
          </Link>
          <h1 className="dp-title">Smart staff ranking</h1>
          <p className="dp-subtitle">
            How team members are ordered when a customer chooses &quot;Anyone
            available&quot; — and the scores behind it.
          </p>
        </div>
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={loadPreview} />
      ) : null}

      {loading && !preview ? (
        <DashboardPageSkeletonDefault rows={4} />
      ) : preview ? (
        <>
          <p className="ssr-ref-note">{preview.referenceNote}</p>
          <p className="ssr-ref-date">
            <strong>Reference date:</strong> {preview.referenceDate} (UTC)
          </p>

          <section className="ssr-panel">
            <h2 className="ssr-panel-title">Assignment rules</h2>
            <div className="ssr-panel-body">
              <div className="be-smart-rank-tiebreak">
                <label
                  className="be-switch"
                  aria-label={
                    settings.enabled ? "Disable smart ranking" : "Enable"
                  }
                >
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, enabled: e.target.checked }))
                    }
                  />
                  <span className="be-switch-track">
                    <span className="be-switch-thumb" />
                  </span>
                </label>
                <span className="be-smart-rank-tiebreak-label">
                  Use smart ranking (performance, ratings, availability)
                </span>
              </div>
              <p className="be-automation-hint be-automation-hint--muted">
                When off, the system uses the legacy order: earliest shift, then
                ratings, then workload.
              </p>

              <div
                className={`ssr-subsection ${!settings.enabled ? "ssr-subsection--dim" : ""}`}
              >
                <div className="be-smart-rank-tiebreak">
                  <label className="be-switch" aria-label="Earliest shift tie-break">
                    <input
                      type="checkbox"
                      checked={settings.tieBreakEarliestShift}
                      disabled={!settings.enabled}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          tieBreakEarliestShift: e.target.checked,
                        }))
                      }
                    />
                    <span className="be-switch-track">
                      <span className="be-switch-thumb" />
                    </span>
                  </label>
                  <span className="be-smart-rank-tiebreak-label">
                    Prefer earlier shift start when metrics tie
                  </span>
                </div>

                <p className="be-automation-hint">
                  <strong>Priority order</strong> — 1 is compared first, then 2,
                  then 3.
                </p>
                <ol className="be-smart-rank-list">
                  {(settings.priority || DEFAULT_SMART_RANK_PRIORITY).map(
                    (key, idx, arr) => (
                      <li key={key} className="be-smart-rank-item">
                        <span className="be-smart-rank-pos">{idx + 1}.</span>
                        <span className="be-smart-rank-label">
                          {SMART_RANK_LABELS[key] || key}
                        </span>
                        <span className="be-smart-rank-actions">
                          <button
                            type="button"
                            className="be-smart-rank-move"
                            disabled={!settings.enabled || idx === 0}
                            aria-label="Move up"
                            onClick={() =>
                              setSettings((r) => {
                                const p = [...(r.priority || [])];
                                [p[idx - 1], p[idx]] = [p[idx], p[idx - 1]];
                                return { ...r, priority: p };
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="be-smart-rank-move"
                            disabled={
                              !settings.enabled || idx >= arr.length - 1
                            }
                            aria-label="Move down"
                            onClick={() =>
                              setSettings((r) => {
                                const p = [...(r.priority || [])];
                                [p[idx], p[idx + 1]] = [p[idx + 1], p[idx]];
                                return { ...r, priority: p };
                              })
                            }
                          >
                            ↓
                          </button>
                        </span>
                      </li>
                    ),
                  )}
                </ol>

                <button
                  type="button"
                  className="be-save-btn ssr-save"
                  disabled={saving}
                  onClick={() => void saveSettings()}
                >
                  {saving ? "Saving…" : "Save rules"}
                </button>
              </div>
            </div>
          </section>

          <section className="ssr-panel">
            <div className="ssr-panel-head">
              <div className="ssr-panel-head-text">
                <h2 className="ssr-panel-title">Team scores &amp; try order</h2>
                <p className="be-automation-hint ssr-panel-hint">
                  <strong>Try order</strong> is who we attempt first when several
                  people could take the slot. It matches your rules above.
                </p>
              </div>
              {preview.staff.length > 0 ? (
                <div className="ssr-staff-search-wrap">
                  <label htmlFor="ssr-staff-search" className="dp-sr-only">
                    Search staff by full name
                  </label>
                  <div className="ssr-staff-search">
                    <HiOutlineSearch size={18} aria-hidden />
                    <input
                      id="ssr-staff-search"
                      type="search"
                      className="ssr-staff-search-input form-control"
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      placeholder="Search by name..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            {preview.staff.length === 0 ? (
              <p className="dp-subtitle">No active staff yet.</p>
            ) : filteredStaff.length === 0 ? (
              <p className="dp-subtitle">
                No staff match &quot;{staffSearchQuery.trim()}&quot;. Try a
                different name.
              </p>
            ) : (
              <div className="ssr-table-wrap">
                <table className="ssr-table">
                  <thead>
                    <tr>
                      <th>Try #</th>
                      <th>Name</th>
                      <th>Performance</th>
                      <th>Ratings &amp; feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="ssr-rank-badge">{row.assignmentRank}</span>
                        </td>
                        <td>
                          <strong>{row.name}</strong>
                          <div className="ssr-role">{row.role}</div>
                        </td>
                        <td>{row.performanceRate}%</td>
                        <td className="ssr-ratings-cell">
                          <div className="ssr-rating-avg">
                            {row.ratingAverage != null
                              ? `${row.ratingAverage} ★`
                              : "—"}
                          </div>
                          {row.ratingAverage != null ? (
                            <button
                              type="button"
                              className="ssr-feedback-btn"
                              onClick={() => openStaffFeedbackModal(row)}
                            >
                              View all feedback
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {feedbackModal ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => setFeedbackModal(null)}
        >
          <div
            className="dt-modal dt-modal--scroll"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ssr-feedback-modal-title"
          >
            <div className="dt-modal-header">
              <h2 id="ssr-feedback-modal-title">
                Reviews — {feedbackModal.name}
              </h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => setFeedbackModal(null)}
                aria-label="Close"
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body ssr-feedback-modal-body">
              {feedbackModal.role ? (
                <p className="ssr-feedback-modal-role">{feedbackModal.role}</p>
              ) : null}
              {feedbackModal.loading ? (
                <p className="dp-subtitle">Loading…</p>
              ) : feedbackModal.error ? (
                <p className="dp-field-error" role="alert">
                  {feedbackModal.error}
                </p>
              ) : (
                <>
                  <p className="ssr-feedback-modal-summary">
                    Average{" "}
                    <strong>
                      {feedbackModal.ratingAverage != null
                        ? `${feedbackModal.ratingAverage} ★`
                        : "—"}
                    </strong>
                    {feedbackModal.totalCount > 0
                      ? ` · ${feedbackModal.totalCount} review${feedbackModal.totalCount === 1 ? "" : "s"}`
                      : ""}
                    {feedbackModal.truncated
                      ? ` (showing newest ${feedbackModal.items.length})`
                      : ""}
                  </p>
                  {feedbackModal.items.length === 0 ? (
                    <p className="dp-subtitle">No written reviews to show.</p>
                  ) : (
                    <ul className="ssr-feedback-modal-list">
                      {feedbackModal.items.map((fb, idx) => (
                        <li key={`${feedbackModal.staffId}-fb-${idx}`}>
                          <div className="ssr-feedback-modal-item-meta">
                            {fb.rating != null ? `${fb.rating}★` : "—"}
                            {fb.createdAt
                              ? ` · ${formatFeedbackDate(fb.createdAt)}`
                              : ""}
                          </div>
                          <p className="ssr-feedback-modal-item-text">
                            {fb.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StaffSmartRankingPage;
