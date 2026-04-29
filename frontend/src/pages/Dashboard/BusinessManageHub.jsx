import { useState, useEffect, useCallback } from "react";
import {
  useParams,
  Navigate,
  Link,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import { HiOutlineOfficeBuilding, HiOutlineArrowRight } from "react-icons/hi";
import { listBusinesses } from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { getStoredWorkspaceId } from "../../auth/session";
import { canAccessMyBusinessesNav } from "../../utils/roles";
import { DashboardPageSkeletonDefault } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import "./dashboard-pages.css";


const BusinessManageHub = () => {
  const { scope } = useParams();
  const navigate = useNavigate();
  const { user } = useOutletContext();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [businesses, setBusinesses] = useState([]);

  const valid =
    scope === "services" ||
    scope === "staff" ||
    scope === "coupons" ||
    scope === "staff-ranking";

  const loadHub = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await listBusinesses({ scope: "mine" });
      const list = Array.isArray(data.businesses) ? data.businesses : [];
      setBusinesses(list);
      if (list.length === 1) {
        navigate(
          `/dashboard/businesses/${list[0].id}/${scope}`,
          { replace: true },
        );
      } else if (list.length > 1) {
        const ws = getStoredWorkspaceId();
        if (ws && list.some((b) => String(b.id ?? b._id) === ws)) {
          navigate(`/dashboard/businesses/${ws}/${scope}`, {
            replace: true,
          });
        }
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, [valid, scope, navigate]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  if (user && !canAccessMyBusinessesNav(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!valid) {
    return <Navigate to="/dashboard/businesses" replace />;
  }

  const title =
    scope === "services"
      ? "Services & pricing"
      : scope === "coupons"
        ? "Discount coupons"
        : scope === "staff-ranking"
          ? "Smart staff ranking"
          : "Staff & team";
  const subtitle =
    scope === "services"
      ? "Pick a business to add or edit services."
      : scope === "coupons"
        ? "Pick a business to create booking discount codes."
        : scope === "staff-ranking"
          ? "See how team members rank when customers choose “Anyone available”."
          : "Pick a business to add or edit team members.";

  return (
    <div className="dp-page bm-hub-page">
      <div className="dp-header">
        <div>
          <Link to="/dashboard/businesses" className="be-back" style={{ marginBottom: 12 }}>
            ← My businesses
          </Link>
          <h1 className="dp-title">{title}</h1>
          <p className="dp-subtitle">
            {loading ? (
              <span
                className="dp-skel dp-skel-line dp-skel-line--sub"
                style={{ display: "inline-block", maxWidth: 360 }}
                aria-hidden
              />
            ) : (
              subtitle
            )}
          </p>
        </div>
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={loadHub} />
      ) : loading ? (
        <DashboardPageSkeletonDefault rows={3} />
      ) : businesses.length === 0 ? (
        <div className="bm-hub-empty">
          <p className="dp-subtitle">
            You don&apos;t have a business yet. Create one first, then you can
            manage{" "}
            {scope === "services"
              ? "services"
              : scope === "coupons"
                ? "coupons"
                : scope === "staff-ranking"
                  ? "staff ranking"
                  : "staff"}{" "}
            here.
          </p>
          <Link to="/dashboard/businesses/new" className="mb-manage-btn">
            Create business
            <HiOutlineArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <ul className="bm-hub-list">
          {businesses.map((biz) => (
            <li key={biz.id}>
              <Link
                to={`/dashboard/businesses/${biz.id}/${scope}`}
                className="bm-hub-card"
              >
                <span className="bm-hub-card-icon">
                  <HiOutlineOfficeBuilding size={22} />
                </span>
                <span className="bm-hub-card-body">
                  <span className="bm-hub-card-name">{biz.name}</span>
                  <span className="bm-hub-card-meta">
                    {scope === "services"
                      ? `${biz.serviceCount ?? 0} services`
                      : scope === "coupons"
                        ? "Discount codes"
                        : scope === "staff-ranking"
                          ? "Ranking preview"
                          : `${biz.staffCount ?? 0} staff`}
                  </span>
                </span>
                <HiOutlineArrowRight size={18} className="bm-hub-card-arrow" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BusinessManageHub;
