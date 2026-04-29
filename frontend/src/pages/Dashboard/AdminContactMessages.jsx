import { useState, useEffect, useCallback } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { HiOutlineX } from "react-icons/hi";
import { getContactMessages } from "../../api/contact";
import { getApiErrorMessage } from "../../api/auth";
import { isAdminRole } from "../../utils/roles";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { DashboardSkeletonTable } from "../../components/DashboardPageSkeleton";
import "./dashboard-pages.css";

const MESSAGE_PREVIEW_LEN = 120;

function messagePreview(text) {
  const t = (text || "").trim();
  if (!t) return "—";
  if (t.length <= MESSAGE_PREVIEW_LEN) return t;
  return `${t.slice(0, MESSAGE_PREVIEW_LEN)}…`;
}

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

const AdminContactMessages = () => {
  const { user } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailModal, setDetailModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getContactMessages();
      setRows(Array.isArray(data.messages) ? data.messages : []);
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

  useEffect(() => {
    if (!detailModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDetailModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailModal]);

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page ac-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Contact messages</h1>
          <p className="dp-subtitle">
            Submissions from the public contact form (admin only).
          </p>
        </div>
      </div>

      {error ? (
        <DashboardErrorPanel message={error} onRetry={load} />
      ) : null}

      {!error && !loading ? (
        <p className="ac-muted" style={{ marginBottom: 16 }}>
          <strong>{total}</strong> message{total === 1 ? "" : "s"}
          {capped ? " (list capped — contact dev to raise limit)" : ""}
        </p>
      ) : null}

      <div className="ac-table-wrap">
        {loading ? (
          <DashboardSkeletonTable cols={5} rows={8} />
        ) : error ? null : rows.length === 0 ? (
          <p className="ac-muted">No messages yet.</p>
        ) : (
          <table className="ac-table ac-table--contact-messages">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Email</th>
                <th>Subject</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>{r.name || "—"}</td>
                  <td>
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                  </td>
                  <td>{r.subject || "—"}</td>
                  <td className="ac-cell-message">
                    <span className="ac-message-preview">
                      {messagePreview(r.message)}
                    </span>
                    {(r.message || "").trim() ? (
                      <button
                        type="button"
                        className="ac-message-view-btn"
                        onClick={() => setDetailModal(r)}
                      >
                        {(r.message || "").trim().length > MESSAGE_PREVIEW_LEN
                          ? "See full message"
                          : "View"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detailModal ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="dt-modal dt-modal--scroll ac-contact-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ac-contact-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="ac-contact-detail-title">Message</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => setDetailModal(null)}
                aria-label="Close"
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <dl className="ac-contact-detail-meta">
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(detailModal.createdAt)}</dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>
                    {detailModal.name || "—"}
                    {detailModal.email ? (
                      <>
                        {" "}
                        <a href={`mailto:${detailModal.email}`}>
                          {detailModal.email}
                        </a>
                      </>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{detailModal.subject || "—"}</dd>
                </div>
              </dl>
              <div className="ac-contact-detail-message">
                {(detailModal.message || "").trim() || "—"}
              </div>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-save-btn"
                onClick={() => setDetailModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminContactMessages;
