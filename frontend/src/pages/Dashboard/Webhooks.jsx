import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useOutletContext } from "react-router-dom";
import {
  HiOutlineLink,
  HiOutlineLightningBolt,
} from "react-icons/hi";
import { listBusinesses } from "../../api/businesses";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  testWebhook,
  updateWebhook,
} from "../../api/webhooks";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import { isAdminRole, isCustomerRole, isStaffRole } from "../../utils/roles";
import "./dashboard-pages.css";

const EVENT_OPTIONS = [
  "booking.created",
  "booking.cancelled",
  "booking.completed",
];

const Webhooks = () => {
  const { user, activeWorkspaceId } = useOutletContext();
  const location = useLocation();
  const { showToast } = useToast();
  const subLimits = user?.subscription?.limits;
  const subIsAdmin = Boolean(user?.subscription?.isAdmin);
  const canUseWebhooks = subIsAdmin || Boolean(subLimits?.webhooks);
  const [businesses, setBusinesses] = useState([]);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [availableEvents, setAvailableEvents] = useState(EVENT_OPTIONS);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [error, setError] = useState(null);

  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState([...EVENT_OPTIONS]);
  const [creating, setCreating] = useState(false);
  const [lastSecrets, setLastSecrets] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const businessesById = useMemo(
    () =>
      new Map(
        businesses.map((b) => [
          String(b.id ?? b._id),
          b.name?.trim() || "Business",
        ]),
      ),
    [businesses],
  );
  const wizardStep = currentStep;

  useEffect(() => {
    if (selectedBusinessIds.length === 0 && currentStep === 2) {
      setCurrentStep(1);
    }
  }, [selectedBusinessIds, currentStep]);

  const loadBusinesses = useCallback(async () => {
    setLoadingBiz(true);
    setError(null);
    try {
      const { data } = await listBusinesses({ scope: "mine" });
      const rows = Array.isArray(data?.businesses) ? data.businesses : [];
      setBusinesses(rows);
      setSelectedBusinessIds((prev) => {
        const fromWs = String(activeWorkspaceId || "").trim();
        if (fromWs && rows.some((b) => String(b.id ?? b._id) === fromWs)) {
          return [fromWs];
        }
        if (
          Array.isArray(prev) &&
          prev.length > 0 &&
          prev.every((id) => rows.some((b) => String(b.id ?? b._id) === id))
        ) {
          return prev;
        }
        if (rows.length === 1) return [String(rows[0].id ?? rows[0]._id)];
        return [];
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
      setBusinesses([]);
      setSelectedBusinessIds([]);
    } finally {
      setLoadingBiz(false);
    }
  }, [activeWorkspaceId]);

  const loadWebhooks = useCallback(async () => {
    if (!selectedBusinessIds.length) {
      setWebhooks([]);
      return;
    }
    setLoadingHooks(true);
    setError(null);
    try {
      const responses = await Promise.all(
        selectedBusinessIds.map((id) => listWebhooks(id)),
      );
      const merged = responses.flatMap((resp, idx) => {
        const bid = selectedBusinessIds[idx];
        const list = Array.isArray(resp?.data?.endpoints) ? resp.data.endpoints : [];
        return list.map((row) => ({ ...row, business: row.business || bid }));
      });
      setWebhooks(merged);
      const firstEvents = responses[0]?.data?.availableEvents;
      setAvailableEvents(
        Array.isArray(firstEvents) && firstEvents.length
          ? firstEvents
          : EVENT_OPTIONS,
      );
    } catch (err) {
      setError(getApiErrorMessage(err));
      setWebhooks([]);
    } finally {
      setLoadingHooks(false);
    }
  }, [selectedBusinessIds]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  useEffect(() => {
    const onWs = () => loadBusinesses();
    window.addEventListener("appointly:workspace-changed", onWs);
    return () => window.removeEventListener("appointly:workspace-changed", onWs);
  }, [loadBusinesses]);

  const onToggleEvent = (ev) => {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev],
    );
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (selectedBusinessIds.length === 0) {
      showToast("Choose at least one business workspace first.", "error");
      return;
    }
    if (!url.trim()) {
      setUrlError("Webhook URL is required.");
      return;
    }
    setUrlError("");
    if (events.length === 0) {
      showToast("Select at least one event.", "error");
      return;
    }
    setCreating(true);
    setLastSecrets([]);
    try {
      const successSecrets = [];
      const failed = [];
      for (const bid of selectedBusinessIds) {
        try {
          const { data } = await createWebhook({
            businessId: bid,
            url: url.trim(),
            description: description.trim(),
            events,
          });
          successSecrets.push({
            businessId: bid,
            businessName: businessesById.get(bid) || "Business",
            signingSecret: String(data?.signingSecret || ""),
          });
        } catch (err) {
          failed.push({ businessId: bid, error: getApiErrorMessage(err) });
        }
      }
      setUrl("");
      setDescription("");
      setEvents([...EVENT_OPTIONS]);
      setLastSecrets(successSecrets.filter((x) => x.signingSecret));
      if (successSecrets.length > 0 && failed.length === 0) {
        showToast(
          `Webhook created for ${successSecrets.length} business${successSecrets.length === 1 ? "" : "es"}.`,
          "success",
        );
      } else if (successSecrets.length > 0 && failed.length > 0) {
        showToast(
          `Created for ${successSecrets.length}, failed for ${failed.length}.`,
          "error",
        );
      } else {
        showToast("Webhook creation failed for all selected businesses.", "error");
      }
      await loadWebhooks();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setCreating(false);
    }
  };

  const onTest = async (id) => {
    try {
      await testWebhook(id);
      showToast("Test webhook sent.", "success");
      await loadWebhooks();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const onToggleActive = async (id, isActive) => {
    const next = !isActive;
    setTogglingId(String(id));
    try {
      const { data } = await updateWebhook(id, { isActive: next });
      const updatedIsActive =
        typeof data?.endpoint?.isActive === "boolean"
          ? data.endpoint.isActive
          : next;
      setWebhooks((prev) =>
        prev.map((row) =>
          String(row.id) === String(id)
            ? { ...row, isActive: updatedIsActive }
            : row,
        ),
      );
      showToast(updatedIsActive ? "Webhook enabled." : "Webhook disabled.", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setTogglingId("");
    }
  };

  const onDelete = async (id) => {
    setDeletingId(String(id));
    try {
      await deleteWebhook(id);
      showToast("Webhook deleted.", "success");
      await loadWebhooks();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDeletingId("");
      setDeleteTarget(null);
    }
  };

  const toggleBusiness = (id) => {
    setSelectedBusinessIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  if (isCustomerRole(user?.role) || isAdminRole(user?.role) || isStaffRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!canUseWebhooks) {
    return (
      <Navigate
        to="/pricing"
        replace
        state={{
          upgradeFeature: "webhooks",
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  return (
    <div className="dp-page dp-webhooks-layout">
      <div className="dp-header">
        <h1 className="dp-title">Webhooks</h1>
        <p className="dp-subtitle">
          Register external URLs that should receive booking events for{" "}
          <strong>
            {selectedBusinessIds.length > 0
              ? `${selectedBusinessIds.length} selected business${selectedBusinessIds.length === 1 ? "" : "es"}`
              : "your selected business"}
          </strong>.
        </p>
      </div>

      {error ? <p className="dp-load-error">{error}</p> : null}

      <section className="dp-closing-card dp-webhooks-wizard">
        <div className="bm-progress dp-webhooks-progress">
          {["Select business", "Add webhook"].map((label, i) => (
            <div
              key={label}
              className={`bm-progress-step ${i + 1 <= wizardStep ? "active" : ""} ${i + 1 < wizardStep ? "done" : ""}`}
            >
              <div className="bm-progress-dot">
                <span>{i + 1}</span>
              </div>
              <span className="bm-progress-label">{label}</span>
              {i < 1 ? <div className="bm-progress-line" /> : null}
            </div>
          ))}
        </div>

        {currentStep === 1 ? (
          <div className="dp-webhooks-wizard-body">
            <h2 className="dp-closing-title dp-webhooks-step-title">Select business</h2>
            <p className="dp-subtitle dp-webhooks-step-subtitle">
              Choose which business should send notifications. You can create
              separate webhook endpoints for each business.
            </p>
            <div className="dp-webhooks-business-grid" role="group" aria-label="Business workspace">
              {businesses.map((b) => {
                const bid = String(b.id ?? b._id);
                const isSelected = selectedBusinessIds.includes(bid);
                return (
                  <button
                    key={bid}
                    type="button"
                    className={`dp-webhooks-business-pill ${isSelected ? "active" : ""}`}
                    onClick={() => toggleBusiness(bid)}
                  >
                    {b.name?.trim() || "Business"}
                  </button>
                );
              })}
              {!loadingBiz && businesses.length === 0 ? (
                <p className="dp-subtitle">No businesses available.</p>
              ) : null}
            </div>
            <div className="dp-subtitle" style={{ marginTop: 8 }}>
              Selected:{" "}
              {selectedBusinessIds.length > 0
                ? selectedBusinessIds
                    .map((id) => businessesById.get(id) || "Business")
                    .join(", ")
                : "none"}
            </div>
            <div className="dp-closing-actions dp-webhooks-step-actions">
              <button
                type="button"
                className="dp-btn-primary"
                disabled={selectedBusinessIds.length === 0 || loadingBiz}
                onClick={() => setCurrentStep(2)}
              >
                Continue
              </button>
            </div>
          </div>
        ) : selectedBusinessIds.length > 0 ? (
          <div className="dp-webhooks-wizard-body dp-webhooks-wizard-body--second">
            <h2 className="dp-closing-title dp-webhooks-step-title">
              <HiOutlineLink size={18} aria-hidden /> Add webhook endpoint
            </h2>
            <p className="dp-subtitle" style={{ marginBottom: 12 }}>
              This webhook will be created for{" "}
              <strong>{selectedBusinessIds.length}</strong> business
              {selectedBusinessIds.length === 1 ? "" : "es"}.
            </p>
            <form onSubmit={onCreate} className="dp-closing-form" noValidate>
              <label className="dp-field">
                <span>Webhook URL (HTTPS)</span>
                <input
                  type="url"
                  className={urlError ? "dp-input--error" : undefined}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) setUrlError("");
                  }}
                  placeholder="https://example.com/hooks/appointly"
                  aria-invalid={urlError ? "true" : undefined}
                />
                {urlError ? (
                  <p className="dp-field-error" role="alert">
                    {urlError}
                  </p>
                ) : null}
              </label>
              <label className="dp-field">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Production endpoint"
                  rows={3}
                />
              </label>
              <div className="dp-field">
                <span>Events</span>
                <div className="dp-filters">
                  {availableEvents.map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      className={`dp-filter-btn ${events.includes(ev) ? "active" : ""}`}
                      onClick={() => onToggleEvent(ev)}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dp-closing-actions dp-webhooks-form-actions">
                <button
                  type="button"
                  className="dp-btn-secondary dp-webhooks-back-btn"
                  onClick={() => setCurrentStep(1)}
                  disabled={creating}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="dp-btn-primary"
                  disabled={creating || loadingBiz || selectedBusinessIds.length === 0}
                >
                  {creating
                    ? "Creating..."
                    : `Create for ${selectedBusinessIds.length} business${selectedBusinessIds.length === 1 ? "" : "es"}`}
                </button>
              </div>
              {lastSecrets.length > 0 ? (
                <div className="dp-bulk-notify-bar dp-webhooks-secret-banner">
                  <p>
                    <strong>Signing secrets (shown once):</strong>
                  </p>
                  <ul className="dp-webhooks-secret-list">
                    {lastSecrets.map((s) => (
                      <li key={`${s.businessId}-${s.signingSecret}`}>
                        <strong>{s.businessName}</strong> ({s.businessId}): {s.signingSecret}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </form>
          </div>
        ) : (
          <div className="dp-webhooks-step-locked">
            Complete Step 1 to unlock webhook endpoint setup.
          </div>
        )}
      </section>

      <section className="dp-closing-card">
        <h2 className="dp-closing-title dp-webhooks-step-title">
          <HiOutlineLightningBolt size={18} aria-hidden /> Existing webhooks
        </h2>
        <p className="dp-subtitle" style={{ marginBottom: 12 }}>
          Showing webhooks for:{" "}
          <strong>
            {selectedBusinessIds.length > 0
              ? selectedBusinessIds
                  .map((id) => businessesById.get(id) || "Business")
                  .join(", ")
              : "No business selected"}
          </strong>
        </p>
        {loadingBiz || loadingHooks ? (
          <p className="dp-subtitle">Loading webhooks...</p>
        ) : null}
        {!loadingBiz && !loadingHooks && webhooks.length === 0 ? (
          <div className="dp-empty">
            <h3>No webhooks yet</h3>
            <p>Create your first endpoint above.</p>
          </div>
        ) : null}
        {!loadingHooks && webhooks.length > 0 ? (
          <div className="dp-bookings-list">
            {webhooks.map((wh) => (
              <div key={wh.id} className="dp-booking-card">
                <div className="dp-booking-info">
                  <div className="dp-booking-top">
                    <h3>{wh.description?.trim() || "Webhook endpoint"}</h3>
                    <span
                      className="dp-status"
                      style={{
                        color: wh.isActive ? "#10b981" : "#64748b",
                        background: wh.isActive ? "#ecfdf5" : "#f1f5f9",
                      }}
                    >
                      {wh.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="dp-subtitle" style={{ marginBottom: 8 }}>
                    {wh.url}
                  </p>
                  <p className="dp-subtitle" style={{ marginBottom: 8 }}>
                    Business: {businessesById.get(String(wh.business)) || "—"}
                    {wh.business ? ` (${String(wh.business)})` : ""}
                  </p>
                  <p className="dp-subtitle" style={{ marginBottom: 8 }}>
                    Events: {(wh.events || []).join(", ")}
                  </p>
                  <p className="dp-subtitle" style={{ marginBottom: 0 }}>
                    Last status: {wh.lastStatusCode ?? "—"} · Deliveries: {wh.totalDeliveries ?? 0}
                  </p>
                  {wh.lastError ? (
                    <p className="dp-load-error" style={{ marginTop: 8 }}>
                      Last error: {wh.lastError}
                    </p>
                  ) : null}
                </div>
                <div className="dp-booking-actions">
                  <button
                    type="button"
                    className="dp-action-btn reschedule"
                    onClick={() => onTest(wh.id)}
                    disabled={!wh.isActive || togglingId === String(wh.id)}
                  >
                    Send test
                  </button>
                  <button
                    type="button"
                    className={`dp-action-btn ${wh.isActive ? "cancel" : "reschedule"}`}
                    onClick={() => onToggleActive(wh.id, wh.isActive)}
                    disabled={togglingId === String(wh.id)}
                  >
                    {togglingId === String(wh.id)
                      ? "Saving..."
                      : wh.isActive
                        ? "Disable"
                        : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="dp-action-btn cancel"
                    onClick={() => setDeleteTarget(wh)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {deleteTarget ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !deletingId && setDeleteTarget(null)}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-webhook-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-webhook-delete-title">Delete this webhook?</h2>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                This removes the webhook endpoint and stops all future deliveries
                for this business.
              </p>
              <p className="dp-subtitle" style={{ marginBottom: 0 }}>
                <strong>{deleteTarget.description?.trim() || "Webhook endpoint"}</strong>
                <br />
                {deleteTarget.url}
                <br />
                Business: {businessesById.get(String(deleteTarget.business)) || "—"}
                {deleteTarget.business ? ` (${String(deleteTarget.business)})` : ""}
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn reschedule"
                onClick={() => !deletingId && setDeleteTarget(null)}
                disabled={!!deletingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-delete-modal-confirm"
                onClick={() => onDelete(deleteTarget.id)}
                disabled={!!deletingId}
              >
                {deletingId ? "Deleting..." : "Delete webhook"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Webhooks;
