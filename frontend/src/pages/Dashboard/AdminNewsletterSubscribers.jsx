import { useState, useEffect, useCallback } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { getNewsletterSubscribers } from "../../api/newsletter";
import { getApiErrorMessage } from "../../api/auth";
import { isAdminRole } from "../../utils/roles";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { DashboardSkeletonTable } from "../../components/DashboardPageSkeleton";
import "./dashboard-pages.css";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

const AdminNewsletterSubscribers = () => {
  const { user } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getNewsletterSubscribers();
      setRows(Array.isArray(data.subscribers) ? data.subscribers : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setCapped(Boolean(data.capped));
    } catch (err) {
      setError(getApiErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page ac-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Newsletter subscribers</h1>
          <p className="dp-subtitle">
            Emails collected from the public newsletter form (admin only).
          </p>
        </div>
      </div>

      {error ? (
        <DashboardErrorPanel message={error} onRetry={load} />
      ) : null}

      {!error && !loading ? (
        <p className="ac-muted" style={{ marginBottom: 16 }}>
          <strong>{total}</strong> subscriber{total === 1 ? "" : "s"}
          {capped ? " (list capped — contact dev to raise limit)" : ""}
        </p>
      ) : null}

      <div className="ac-table-wrap">
        {loading ? (
          <DashboardSkeletonTable cols={3} rows={8} />
        ) : error ? null : rows.length === 0 ? (
          <p className="ac-muted">No subscribers yet.</p>
        ) : (
          <table className="ac-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`mailto:${encodeURIComponent(r.email)}`}>
                      {r.email}
                    </a>
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminNewsletterSubscribers;
