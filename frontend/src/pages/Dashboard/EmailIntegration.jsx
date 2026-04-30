import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, Navigate } from "react-router-dom";
import { HiOutlineMail, HiOutlineX } from "react-icons/hi";
import "./dashboard-pages.css";
import {
  listBusinesses,
  getBusinessCustomers,
  listCustomerEmailBroadcasts,
  sendCustomerEmailBroadcast,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { getStoredWorkspaceId } from "../../auth/session";
import { useToast } from "../../components/ToastContext";
import {
  DashboardSkeletonStack,
  DashboardSkeletonEmailCompose,
  DashboardSkeletonEmailHistory,
} from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { isCustomerRole, isAdminRole } from "../../utils/roles";
function formatSentAt(iso) {
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

const EmailIntegration = () => {
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [customerCount, setCustomerCount] = useState(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);
  const [error, setError] = useState(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const selectedBusinessName = useMemo(() => {
    const b = businesses.find(
      (x) => String(x.id ?? x._id) === String(businessId),
    );
    return b?.name?.trim() || "";
  }, [businesses, businessId]);

  const loadBusinesses = useCallback(async () => {
    if (isCustomerRole(user?.role) || isAdminRole(user?.role)) {
      setLoadingBiz(false);
      return;
    }
    setLoadingBiz(true);
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
        if (list.length === 1) return String(list[0].id ?? list[0]._id);
        return "";
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
      setBusinesses([]);
      setBusinessId("");
    } finally {
      setLoadingBiz(false);
    }
  }, [user?.role, activeWorkspaceId]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    const onWs = () => loadBusinesses();
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
      setCustomerCount(null);
      setBroadcasts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCustomers(true);
      setLoadingBroadcasts(true);
      try {
        const [custRes, bcRes] = await Promise.all([
          getBusinessCustomers(businessId),
          listCustomerEmailBroadcasts(businessId),
        ]);
        if (cancelled) return;
        const c = Array.isArray(custRes.data?.customers)
          ? custRes.data.customers
          : [];
        setCustomerCount(c.length);
        const b = Array.isArray(bcRes.data?.broadcasts)
          ? bcRes.data.broadcasts
          : [];
        setBroadcasts(b);
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
          setCustomerCount(0);
          setBroadcasts([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
          setLoadingBroadcasts(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, retryNonce]);

  const refreshBroadcasts = useCallback(async () => {
    if (!businessId) return;
    try {
      const { data } = await listCustomerEmailBroadcasts(businessId);
      setBroadcasts(
        Array.isArray(data?.broadcasts) ? data.broadcasts : [],
      );
    } catch {
      /* toast already on send */
    }
  }, [businessId]);

  const openSendConfirm = () => {
    const s = subject.trim();
    const d = description.trim();
    if (!s) {
      showToast("Please enter a subject.", "error");
      return;
    }
    if (!d) {
      showToast("Please enter a description.", "error");
      return;
    }
    if (!customerCount || customerCount < 1) {
      showToast(
        "No customers to email — only people who have booked with this business receive messages.",
        "error",
      );
      return;
    }
    setSendConfirmOpen(true);
  };

  const closeSendConfirm = () => {
    if (!sending) setSendConfirmOpen(false);
  };

  const confirmSend = async () => {
    if (!businessId) return;
    setSending(true);
    try {
      const { data } = await sendCustomerEmailBroadcast(businessId, {
        subject: subject.trim(),
        description: description.trim(),
      });
      const n = data?.delivered ?? 0;
      showToast(
        n > 0
          ? `Email sent to ${n} customer${n === 1 ? "" : "s"}.`
          : "Done.",
        "success",
      );
      setSubject("");
      setDescription("");
      setSendConfirmOpen(false);
      await refreshBroadcasts();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSending(false);
    }
  };

  if (isCustomerRole(user?.role) || isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page dp-email-page">
      <div className="dp-header dp-closing-header">
        <div>
          <h1 className="dp-title">Email integration</h1>
          <p className="dp-subtitle">
            Send a message to everyone who has booked with{" "}
            {selectedBusinessName ? (
              <strong>{selectedBusinessName}</strong>
            ) : (
              "your business"
            )}
            . Each send is saved below — you can only view past messages, not
            change them.
          </p>
        </div>
        {businessId && !loadingBiz && !error ? (
          <div className="dp-email-header-icon" aria-hidden>
            <HiOutlineMail size={22} />
          </div>
        ) : null}
      </div>

      {error ? (
        <DashboardErrorPanel message={error} onRetry={handleErrorRetry} />
      ) : (
        <>
      {loadingBiz ? <DashboardSkeletonStack rows={3} /> : null}

      {!loadingBiz && businesses.length === 0 ? (
        <div className="dp-empty dp-customers-empty">
          <h3>No businesses yet</h3>
          <p>Create a business first.</p>
        </div>
      ) : null}

      {!loadingBiz && businesses.length > 0 && !businessId ? (
        <p className="dp-subtitle">
          Choose a workspace in the sidebar to load email tools for that
          business.
        </p>
      ) : null}

      {businessId && !loadingBiz ? (
        <>
          <section className="dp-email-compose" aria-labelledby="dp-email-compose-title">
            <h2 id="dp-email-compose-title" className="dp-email-compose-title">
              Compose message
            </h2>
            {loadingCustomers || loadingBroadcasts ? (
              <DashboardSkeletonEmailCompose />
            ) : (
              <>
                <p className="dp-email-compose-hint">
                  Recipients:{" "}
                  <strong>
                    {customerCount ?? 0}
                  </strong>{" "}
                  customer
                  {(customerCount ?? 0) === 1 ? "" : "s"} (anyone who has a
                  non-expired booking with this business).
                </p>
                <div className="dp-field full mb-3">
                  <label>Subject</label>
                  <input
                    type="text"
                    className="form-control"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Holiday hours update"
                    maxLength={300}
                    autoComplete="off"
                  />
                </div>
                <div className="dp-field full mb-3">
                  <label>Description</label>
                  <textarea
                    className="form-control dp-closing-reason-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Write the message your customers will see in the email body…"
                    rows={8}
                    maxLength={20000}
                  />
                </div>
                <div className="dp-email-compose-actions">
                  <button
                    type="button"
                    className="dp-btn-primary"
                    onClick={openSendConfirm}
                    disabled={
                      sending ||
                      !subject.trim() ||
                      !description.trim() ||
                      !customerCount ||
                      loadingCustomers
                    }
                  >
                    <HiOutlineMail size={18} aria-hidden />
                    Send to all customers
                  </button>
                </div>
              </>
            )}
          </section>

          <section
            className="dp-email-history"
            aria-labelledby="dp-email-history-title"
          >
            <h2 id="dp-email-history-title" className="dp-email-history-title">
              Sent messages
            </h2>
            <p className="dp-email-history-note">
              Read-only log — messages cannot be edited or deleted after they
              are sent.
            </p>
            {loadingBroadcasts ? (
              <DashboardSkeletonEmailHistory rows={3} />
            ) : null}
            {!loadingBroadcasts && broadcasts.length === 0 ? (
              <div className="dp-empty dp-closing-empty">
                <p>No messages sent yet.</p>
              </div>
            ) : null}
            {!loadingBroadcasts && broadcasts.length > 0 ? (
              <ul className="dp-email-history-list">
                {broadcasts.map((b) => (
                  <li key={b.id} className="dp-email-history-card">
                    <div className="dp-email-history-card-head">
                      <div>
                        <p className="dp-email-history-subject">{b.subject}</p>
                        <p className="dp-email-history-meta">
                          {formatSentAt(b.sentAt)} · Sent to{" "}
                          <strong>{b.recipientCount}</strong> recipient
                          {b.recipientCount === 1 ? "" : "s"}
                          {b.sentByName ? (
                            <>
                              {" "}
                              · By {b.sentByName}
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <pre className="dp-email-history-body">{b.description}</pre>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
        </>
      )}

      {sendConfirmOpen ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={closeSendConfirm}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-email-send-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-email-send-confirm-title">Send email?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={closeSendConfirm}
                aria-label="Close"
                disabled={sending}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                This will email <strong>{customerCount ?? 0}</strong> customer
                {(customerCount ?? 0) === 1 ? "" : "s"} who have booked with{" "}
                <strong>{selectedBusinessName || "this business"}</strong>.
                You cannot undo this send.
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn cancel"
                onClick={closeSendConfirm}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-btn-primary"
                onClick={confirmSend}
                disabled={sending}
              >
                {sending ? "Sending…" : "Send now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EmailIntegration;
