import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, Link, Navigate, useNavigate } from "react-router-dom";
import "./dashboard-pages.css";
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineCalendar,
  HiOutlineUsers,
  HiOutlineStar,
  HiOutlineChartBar,
  HiOutlineCog,
  HiOutlineClipboardList,
  HiOutlineLocationMarker,
  HiOutlinePhone,
  HiOutlineTrash,
  HiOutlineX,
} from "react-icons/hi";
import { listBusinesses, deleteBusiness } from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import AppTooltip from "../../components/AppTooltip";
import { useCategories } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import { ICON_KEY_EMOJI } from "../../utils/categoryIcons";
import { resolveMediaUrl } from "../../utils/assets";
import { DashboardSkeletonBusinessCards } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { isTenantAccount } from "../../utils/roles";

const PLACEHOLDER_COVER =
  "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #a5b4fc 100%)";
const PLACEHOLDER_LOGO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect fill='%23e2e8f0' width='80' height='80' rx='12'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-size='28' fill='%2394a3b8'>B</text></svg>";

const MyBusinesses = () => {
  const { user, activeWorkspaceId, selectWorkspace } = useOutletContext();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { categories: apiCategories } = useCategories();
  const { locations: apiLocations } = useLocations();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  /** Pending delete: open modal instead of window.confirm */
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const categoryLabel = useMemo(() => {
    const map = new Map(
      apiCategories.map((c) => [c.slug, c.name]),
    );
    return (slug) => map.get(slug) || slug;
  }, [apiCategories]);

  const locationLabel = useMemo(() => {
    const map = new Map(apiLocations.map((l) => [l.id, l.name]));
    return (ref) => {
      if (!ref) return "";
      const s = String(ref).trim();
      return map.get(s) || s;
    };
  }, [apiLocations]);

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await listBusinesses({ scope: "mine" });
      setBusinesses(Array.isArray(data.businesses) ? data.businesses : []);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses, user?.role]);

  const openDeleteModal = (biz, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm({ id: biz.id, name: biz.name });
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setDeleteConfirm(null);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeletingId(id);
    try {
      await deleteBusiness(id);
      showToast("Business deleted.", "success");
      setBusinesses((prev) => prev.filter((b) => b.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isTenantAccount(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page mb-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">My Businesses</h1>
          <p className="dp-subtitle">
            {loading ? (
              <span
                className="dp-skel dp-skel-line dp-skel-line--sub"
                style={{ display: "inline-block", maxWidth: 280 }}
                aria-hidden
              />
            ) : loadError ? (
              "We couldn’t load your businesses."
            ) : (
              `${businesses.length} ${businesses.length === 1 ? "business" : "businesses"} registered`
            )}
          </p>
        </div>
        {!loadError ? (
        <Link to="/dashboard/businesses/new" className="dt-add-btn">
          <HiOutlinePlus size={18} />
          Create Business
        </Link>
        ) : null}
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={loadBusinesses} />
      ) : (
      <div className="mb-grid">
        {loading ? (
          <DashboardSkeletonBusinessCards rows={4} />
        ) : (
          businesses.map((biz) => {
            const bid = String(biz.id ?? biz._id ?? "");
            const isActiveWorkspace =
              activeWorkspaceId != null &&
              String(activeWorkspaceId) === bid;
            const emoji =
              ICON_KEY_EMOJI[
                apiCategories.find((c) => c.slug === biz.category)?.iconKey ??
                  "other"
              ] || "🏢";
            const coverSrc = resolveMediaUrl(biz.cover) || null;
            const logoSrc = resolveMediaUrl(biz.logo) || null;
            return (
              <div key={biz.id} className="mb-card">
                <div className="mb-cover">
                  {coverSrc ? (
                    <img src={coverSrc} alt={biz.name} />
                  ) : (
                    <div
                      className="mb-cover-placeholder"
                      style={{ background: PLACEHOLDER_COVER }}
                    />
                  )}
                  <div className="mb-cover-overlay" />
                  <div className="mb-cover-badges">
                    <div
                      className={`mb-active-badge ${biz.isActive ? "active" : "inactive"}`}
                    >
                      <div className="mb-active-dot" />
                      {biz.isActive ? "Active" : "Inactive"}
                    </div>
                    {biz.isApproved === false ? (
                      <div className="mb-approval-badge">Pending approval</div>
                    ) : null}
                  </div>
                </div>

                <div className="mb-body">
                  <div className="mb-info-row">
                    <img
                      src={logoSrc || PLACEHOLDER_LOGO}
                      alt={biz.name}
                      className="mb-logo"
                    />
                    <div className="mb-info">
                      <h3>{biz.name}</h3>
                      <span className="mb-category">
                        <span>{emoji}</span> {categoryLabel(biz.category)}
                      </span>
                    </div>
                  </div>

                  <div className="mb-details">
                    {(biz.address || biz.location || biz.area) && (
                      <span className="mb-detail">
                        <HiOutlineLocationMarker size={14} />
                        {[
                          biz.address,
                          biz.area,
                          locationLabel(biz.location),
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </span>
                    )}
                    {biz.phone && (
                      <span className="mb-detail">
                        <HiOutlinePhone size={14} />
                        {biz.phone}
                      </span>
                    )}
                  </div>

                  <div className="mb-stats">
                    <div className="mb-stat">
                      <span className="mb-stat-value">
                        {biz.bookingCount ?? 0}
                      </span>
                      <span className="mb-stat-label">Bookings</span>
                    </div>
                    <div className="mb-stat">
                      <span className="mb-stat-value">
                        {biz.staffCount ?? 0}
                      </span>
                      <span className="mb-stat-label">Staff</span>
                    </div>
                    <div className="mb-stat">
                      <span className="mb-stat-value">
                        {biz.serviceCount ?? 0}
                      </span>
                      <span className="mb-stat-label">Services</span>
                    </div>
                    <div className="mb-stat">
                      <span className="mb-stat-value mb-stat-value--rating">
                        <HiOutlineStar size={16} aria-hidden />
                        {biz.rating ?? 0}
                      </span>
                      <span className="mb-stat-label">
                        {biz.reviewCount ?? 0} reviews
                      </span>
                    </div>
                  </div>

                  <div className="mb-actions">
                    {isActiveWorkspace ? (
                      <AppTooltip content="Settings">
                        <Link
                          to={`/dashboard/businesses/${biz.id}/edit`}
                          className="mb-action"
                        >
                          <HiOutlineCog size={16} />
                          <span>Edit</span>
                        </Link>
                      </AppTooltip>
                    ) : (
                      <AppTooltip content="Choose this business in the sidebar workspace menu first — then you can open its settings here.">
                        <span
                          className="mb-action mb-action--disabled"
                          aria-disabled="true"
                        >
                          <HiOutlineCog size={16} />
                          <span>Edit</span>
                        </span>
                      </AppTooltip>
                    )}
                    <AppTooltip
                      content="Delete business"
                      disabled={deletingId === biz.id}
                    >
                      <button
                        type="button"
                        className="mb-action mb-action--danger"
                        disabled={deletingId === biz.id}
                        onClick={(e) => openDeleteModal(biz, e)}
                      >
                        <HiOutlineTrash size={16} />
                        <span>
                          {deletingId === biz.id ? "…" : "Delete"}
                        </span>
                      </button>
                    </AppTooltip>
                  </div>

                  {isActiveWorkspace ? (
                    <Link
                      to={`/dashboard/businesses/${biz.id}/edit`}
                      className="mb-manage-btn"
                    >
                      Manage Business
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <path
                          d="M2 7H12M12 7L8 3M12 7L8 11"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="mb-manage-btn mb-manage-btn--switch"
                      onClick={() => {
                        if (typeof selectWorkspace === "function") {
                          selectWorkspace(bid);
                        }
                        navigate(`/dashboard/businesses/${bid}/edit`);
                      }}
                    >
                      Use this workspace
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <path
                          d="M2 7H12M12 7L8 3M12 7L8 11"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {!loading && businesses.length === 0 && (
          <div className="mb-empty-card" style={{ gridColumn: "1 / -1" }}>
            <p className="dp-subtitle">
              No businesses yet. Create one to get started.
            </p>
          </div>
        )}

        <Link to="/dashboard/businesses/new" className="mb-add-card">
          <HiOutlinePlus size={32} />
          <h3>Create New Business</h3>
          <p>Add another location or a different business</p>
        </Link>
      </div>
      )}

      {deleteConfirm && (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="mb-delete-title">Delete business?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={closeDeleteModal}
                aria-label="Close"
                disabled={!!deletingId}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                Delete <strong>{deleteConfirm.name}</strong>? This cannot be
                undone.
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn cancel"
                onClick={closeDeleteModal}
                disabled={!!deletingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-delete-modal-confirm"
                onClick={confirmDelete}
                disabled={!!deletingId}
              >
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBusinesses;
