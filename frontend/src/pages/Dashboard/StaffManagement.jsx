import { useState, useEffect, useCallback } from "react";
import {
  useParams,
  Link,
  Navigate,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineX,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineArrowLeft,
  HiCheck,
} from "react-icons/hi";
import {
  listStaff,
  createStaff,
  updateStaff,
  deleteStaffApi,
  listServices,
  getBusiness,
  getStaffBookingStats,
  inviteStaffDashboard,
  revokeStaffDashboard,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import AppTooltip from "../../components/AppTooltip";
import { resolveMediaUrl } from "../../utils/assets";
import { canAccessMyBusinessesNav } from "../../utils/roles";
import { DashboardSkeletonStaffCards } from "../../components/DashboardPageSkeleton";
import YmdDatePickerField from "../../components/YmdDatePickerField";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import PhoneField from "../../components/PhoneField";
import { formatMoneyCompact, normalizeCurrency } from "../../utils/currency";
import "./dashboard-pages.css";

const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Matches backend `staff.controller` — empty is allowed; non-empty must look like an email. */
const STAFF_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isOptionalStaffEmailValid(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return true;
  return STAFF_EMAIL_REGEX.test(t.toLowerCase());
}

const StaffManagement = () => {
  const { businessId } = useParams();
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const navigate = useNavigate();

  /**
   * Follow the sidebar workspace switcher: when the active workspace changes
   * we redirect to this page's version for the new business so the user never
   * sees stale staff/services from the previous workspace.
   */
  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (!businessId) return;
    if (String(activeWorkspaceId) === String(businessId)) return;
    navigate(`/dashboard/businesses/${activeWorkspaceId}/staff`, {
      replace: true,
    });
  }, [activeWorkspaceId, businessId, navigate]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [staff, setStaff] = useState([]);
  const [bookingStatsByStaff, setBookingStatsByStaff] = useState({});
  const [serviceOptions, setServiceOptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [dashboardBusyId, setDashboardBusyId] = useState(null);
  const [accessConfirm, setAccessConfirm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [businessCurrency, setBusinessCurrency] = useState("EUR");
  const [form, setForm] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    workingDays: [],
    /** { startsOn, endsOn }[] — YYYY-MM-DD inclusive */
    timeOff: [],
    serviceIds: [],
  });
  const [staffModalEmailError, setStaffModalEmailError] = useState("");

  useEffect(() => {
    if (!modalOpen) setStaffModalEmailError("");
  }, [modalOpen]);

  const loadAll = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setLoadError(null);
    /**
     * Clear prior workspace's data immediately so a quick switch never flashes
     * another business's staff cards before the skeleton takes over.
     */
    setStaff([]);
    setServiceOptions([]);
    setBookingStatsByStaff({});
    try {
      const [staffRes, svcRes, statsRes, bizRes] = await Promise.all([
        listStaff(businessId),
        listServices(businessId),
        getStaffBookingStats(businessId).catch(() => ({ data: { stats: [] } })),
        getBusiness(businessId).catch(() => ({ data: {} })),
      ]);
      setStaff(Array.isArray(staffRes.data.staff) ? staffRes.data.staff : []);
      setServiceOptions(
        Array.isArray(svcRes.data.services) ? svcRes.data.services : [],
      );
      setBusinessCurrency(
        normalizeCurrency(bizRes.data?.business?.currency),
      );
      const map = {};
      const rows = Array.isArray(statsRes.data.stats) ? statsRes.data.stats : [];
      for (const row of rows) {
        map[row.staffId] = {
          today: row.today ?? 0,
          week: row.week ?? 0,
          month: row.month ?? 0,
        };
      }
      setBookingStatsByStaff(map);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setStaff([]);
      setServiceOptions([]);
      setBookingStatsByStaff({});
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!deleteConfirm) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !deletingId) setDeleteConfirm(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [deleteConfirm, deletingId]);

  if (user && !canAccessMyBusinessesNav(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      role: "",
      email: "",
      phone: "",
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      timeOff: [],
      serviceIds: [],
    });
    setModalOpen(true);
  };

  const openEdit = (member) => {
    setEditing(member);
    setForm({
      name: member.name,
      role: member.role,
      email: member.email || "",
      phone: member.phone || "",
      workingDays: [...(member.workingDays || [])],
      timeOff: Array.isArray(member.timeOff)
        ? member.timeOff.map((r) => ({
            startsOn: String(r.startsOn || ""),
            endsOn: String(r.endsOn || ""),
          }))
        : [],
      serviceIds: (member.services || []).map((s) => s.id),
    });
    setModalOpen(true);
  };

  const toggleDay = (day) => {
    setForm({
      ...form,
      workingDays: form.workingDays.includes(day)
        ? form.workingDays.filter((d) => d !== day)
        : [...form.workingDays, day],
    });
  };

  const toggleService = (serviceId) => {
    const id = String(serviceId);
    setForm({
      ...form,
      serviceIds: form.serviceIds.map(String).includes(id)
        ? form.serviceIds.filter((x) => String(x) !== id)
        : [...form.serviceIds, serviceId],
    });
  };

  const addTimeOffRow = () => {
    setForm({
      ...form,
      timeOff: [...(form.timeOff || []), { startsOn: "", endsOn: "" }],
    });
  };

  const updateTimeOffRow = (index, patch) => {
    const next = [...(form.timeOff || [])];
    next[index] = { ...next[index], ...patch };
    setForm({ ...form, timeOff: next });
  };

  const removeTimeOffRow = (index) => {
    const next = (form.timeOff || []).filter((_, i) => i !== index);
    setForm({ ...form, timeOff: next });
  };

  const handleSave = async () => {
    if (!form.name || !form.role) return;
    if (!isOptionalStaffEmailValid(form.email)) {
      setStaffModalEmailError(
        "Enter a valid email address (e.g. name@example.com) or leave this field empty.",
      );
      return;
    }
    setStaffModalEmailError("");
    try {
      const timeOff = (form.timeOff || [])
        .map((r) => ({
          startsOn: String(r.startsOn || "").trim(),
          endsOn: String(r.endsOn || "").trim(),
          note: "",
        }))
        .filter((r) => r.startsOn && r.endsOn);
      const body = {
        name: form.name.trim(),
        role: form.role.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        workingDays: form.workingDays,
        timeOff,
        services: form.serviceIds,
      };
      if (editing) {
        await updateStaff(businessId, editing.id, body);
        showToast("Staff updated.", "success");
      } else {
        await createStaff(businessId, body);
        showToast("Staff member added.", "success");
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const confirmRemoveStaff = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeletingId(id);
    try {
      await deleteStaffApi(businessId, id);
      showToast("Staff member removed.", "success");
      setDeleteConfirm(null);
      await loadAll();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const sendDashboardInvite = async (member) => {
    if (!businessId || !member?.id) return;
    setDashboardBusyId(member.id);
    try {
      await inviteStaffDashboard(businessId, member.id, {});
      showToast("Dashboard invite sent.", "success");
      await loadAll();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDashboardBusyId(null);
    }
  };

  const confirmRevokeDashboard = async () => {
    if (!accessConfirm || !businessId) return;
    const { id } = accessConfirm;
    setDashboardBusyId(id);
    try {
      await revokeStaffDashboard(businessId, id);
      showToast(
        accessConfirm.wasConnected
          ? "Dashboard access removed."
          : "Invite cancelled.",
        "success",
      );
      setAccessConfirm(null);
      await loadAll();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDashboardBusyId(null);
    }
  };

  return (
    <div className="dp-page">
      <div className="dp-header">
        <div>
          <Link
            to={`/dashboard/businesses/${businessId}/edit`}
            className="be-back"
            style={{ marginBottom: 12 }}
          >
            <HiOutlineArrowLeft size={18} />
            Back to business
          </Link>
          <h1 className="dp-title">Staff</h1>
          <p className="dp-subtitle">
            {loading ? (
              <span
                className="dp-skel dp-skel-line dp-skel-line--sub"
                style={{ display: "inline-block", maxWidth: 200 }}
                aria-hidden
              />
            ) : loadError ? (
              "We couldn’t load your team."
            ) : (
              `${staff.length} team members`
            )}
          </p>
        </div>
        {!loadError ? (
          <div className="dt-staff-header-actions">
            <Link
              to={`/dashboard/businesses/${businessId}/staff-ranking`}
              className="dt-add-btn dt-add-btn--outline"
            >
              Smart staff ranking
            </Link>
            <button type="button" className="dt-add-btn" onClick={openNew}>
              <HiOutlinePlus size={18} />
              Add Member
            </button>
          </div>
        ) : null}
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={loadAll} />
      ) : (
      <div className="dt-staff-grid">
        {loading ? (
          <DashboardSkeletonStaffCards rows={4} />
        ) : (
          <>
            {staff.map((member) => (
          <div key={member.id} className="dt-staff-card">
            <div className="dt-staff-top">
              <img
                src={
                  member.avatar
                    ? resolveMediaUrl(member.avatar)
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&size=80&background=e0e7ff&color=4f46e5`
                }
                alt={member.name}
                className="dt-staff-avatar"
              />
              <div className="dt-staff-info">
                <h3>{member.name}</h3>
                <span className="dt-staff-role">{member.role}</span>
              </div>
              <div className="dt-service-actions">
                <button
                  type="button"
                  className="dt-icon-btn"
                  onClick={() => openEdit(member)}
                >
                  <HiOutlinePencil size={16} />
                </button>
                <AppTooltip content="Remove staff member">
                  <button
                    type="button"
                    className="dt-icon-btn danger"
                    onClick={() =>
                      setDeleteConfirm({ id: member.id, name: member.name })
                    }
                  >
                    <HiOutlineTrash size={16} />
                  </button>
                </AppTooltip>
              </div>
            </div>

            <div className="dt-staff-contact">
              <span>
                <HiOutlineMail size={14} /> {member.email || "—"}
              </span>
              <span>
                <HiOutlinePhone size={14} /> {member.phone || "—"}
              </span>
            </div>

            <div className="dt-staff-dashboard-row">
              <div className="dt-staff-dashboard-label">Dashboard login</div>
              {(() => {
                const dash =
                  member.dashboardAccess === "connected" ||
                  member.dashboardAccess === "pending" ||
                  member.dashboardAccess === "none"
                    ? member.dashboardAccess
                    : "none";
                const busy = dashboardBusyId === member.id;
                return (
                  <>
                    <div className={`dt-dash-access-badge dt-dash-access-badge--${dash}`}>
                      {dash === "connected"
                        ? "Active"
                        : dash === "pending"
                          ? "Invite pending"
                          : "Not invited"}
                    </div>
                    <div className="dt-staff-dash-actions">
                      {dash === "none" ? (
                        <button
                          type="button"
                          className="dt-dash-btn"
                          disabled={busy}
                          onClick={() => sendDashboardInvite(member)}
                        >
                          {busy ? "Sending…" : "Invite to dashboard"}
                        </button>
                      ) : null}
                      {dash === "pending" ? (
                        <>
                          <button
                            type="button"
                            className="dt-dash-btn"
                            disabled={busy}
                            onClick={() => sendDashboardInvite(member)}
                          >
                            {busy ? "Sending…" : "Resend invite"}
                          </button>
                          <button
                            type="button"
                            className="dt-dash-btn dt-dash-btn--ghost"
                            disabled={busy}
                            onClick={() =>
                              setAccessConfirm({
                                id: member.id,
                                name: member.name,
                                wasConnected: false,
                              })
                            }
                          >
                            Cancel invite
                          </button>
                        </>
                      ) : null}
                      {dash === "connected" ? (
                        <button
                          type="button"
                          className="dt-dash-btn dt-dash-btn--danger"
                          disabled={busy}
                          onClick={() =>
                            setAccessConfirm({
                              id: member.id,
                              name: member.name,
                              wasConnected: true,
                            })
                          }
                        >
                          Remove access
                        </button>
                      ) : null}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="dt-staff-stats" aria-label="Booking counts">
              {["today", "week", "month"].map((key) => {
                const labels = {
                  today: "Today",
                  week: "This week",
                  month: "This month",
                };
                const c = bookingStatsByStaff[member.id]?.[key] ?? 0;
                return (
                  <div key={key} className="dt-staff-stat">
                    <span className="dt-staff-stat-value">{c}</span>
                    <span className="dt-staff-stat-label">{labels[key]}</span>
                  </div>
                );
              })}
            </div>

            <div className="dt-staff-days">
              {allDays.map((day) => (
                <span
                  key={day}
                  className={`dt-day-chip ${member.workingDays?.includes(day) ? "active" : ""}`}
                >
                  {day}
                </span>
              ))}
            </div>

            <div className="dt-staff-services">
              {(member.services || []).map((s) => (
                <span key={s.id} className="dt-service-tag">
                  {s.name}
                </span>
              ))}
            </div>
          </div>
            ))}

            <button type="button" className="dt-add-card tall" onClick={openNew}>
              <HiOutlinePlus size={24} />
              <span>Add Team Member</span>
            </button>
          </>
        )}
      </div>
      )}

      {accessConfirm && (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !dashboardBusyId && setAccessConfirm(null)}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-access-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="staff-access-title">
                {accessConfirm.wasConnected
                  ? "Remove dashboard access?"
                  : "Cancel invite?"}
              </h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !dashboardBusyId && setAccessConfirm(null)}
                aria-label="Close"
                disabled={Boolean(dashboardBusyId)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                {accessConfirm.wasConnected ? (
                  <>
                    Remove dashboard access for{" "}
                    <strong>{accessConfirm.name}</strong>? Their login will be
                    deleted and they will need a new invite to sign in again.
                  </>
                ) : (
                  <>
                    Cancel the pending invite for{" "}
                    <strong>{accessConfirm.name}</strong>? They won&apos;t be
                    able to use the old link.
                  </>
                )}
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={() => !dashboardBusyId && setAccessConfirm(null)}
                disabled={Boolean(dashboardBusyId)}
              >
                Back
              </button>
              <button
                type="button"
                className="dp-btn-danger"
                onClick={confirmRevokeDashboard}
                disabled={Boolean(dashboardBusyId)}
              >
                {dashboardBusyId ? "Working…" : accessConfirm.wasConnected ? "Remove access" : "Cancel invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !deletingId && setDeleteConfirm(null)}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="staff-delete-title">Remove staff member?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !deletingId && setDeleteConfirm(null)}
                aria-label="Close"
                disabled={Boolean(deletingId)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                Remove{" "}
                <strong>{deleteConfirm.name}</strong> from this business? They
                will no longer appear for booking. This cannot be undone.
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={() => !deletingId && setDeleteConfirm(null)}
                disabled={Boolean(deletingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-btn-danger"
                onClick={confirmRemoveStaff}
                disabled={Boolean(deletingId)}
              >
                {deletingId ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="dt-modal dt-modal--scroll"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dt-staff-modal-title"
          >
            <div className="dt-modal-header">
              <h2 id="dt-staff-modal-title">
                {editing ? "Edit Staff Member" : "Add Staff Member"}
              </h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => setModalOpen(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <div className="dt-modal-row">
                <div className="dp-field">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="dp-field">
                  <label>Role</label>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="Role"
                  />
                </div>
              </div>
              <div className="dt-modal-row">
                <div className="dp-field">
                  <label htmlFor="staff-modal-email">Email</label>
                  <input
                    id="staff-modal-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    aria-invalid={Boolean(staffModalEmailError)}
                    aria-describedby={
                      staffModalEmailError ? "staff-modal-email-err" : undefined
                    }
                    className={staffModalEmailError ? "dp-input--error" : undefined}
                    value={form.email}
                    onChange={(e) => {
                      setStaffModalEmailError("");
                      setForm({ ...form, email: e.target.value });
                    }}
                    placeholder="email@example.com"
                  />
                  {staffModalEmailError ? (
                    <span
                      id="staff-modal-email-err"
                      className="dp-field-error"
                      role="alert"
                    >
                      {staffModalEmailError}
                    </span>
                  ) : (
                    <span className="dp-field-hint">
                      Optional. Must be valid if filled — required for dashboard
                      invites.
                    </span>
                  )}
                </div>
                <div className="dp-field">
                  <label htmlFor="staff-modal-phone">Phone</label>
                  <PhoneField
                    id="staff-modal-phone"
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                  />
                </div>
              </div>
              <div className="dp-field">
                <label>Working Days</label>
                <div className="dt-days-picker">
                  {allDays.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={`dt-day-btn ${form.workingDays.includes(day) ? "active" : ""}`}
                      onClick={() => toggleDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dp-field">
                <label>Time off (holidays)</label>
                <p className="dp-field-hint">
                  Customers cannot book this person on these dates (inclusive).
                  Add one row per trip or block of leave.
                </p>
                <div className="dt-timeoff-list">
                  {(form.timeOff || []).map((row, idx) => (
                    <div key={idx} className="dt-timeoff-row">
                      <div className="dt-timeoff-dates">
                        <YmdDatePickerField
                          embedded
                          className="dt-timeoff-picker"
                          value={row.startsOn}
                          onChange={(ymd) =>
                            updateTimeOffRow(idx, { startsOn: ymd })
                          }
                          placeholder="Start date"
                          maxYmd={row.endsOn || undefined}
                        />
                        <span className="dt-timeoff-to">to</span>
                        <YmdDatePickerField
                          embedded
                          className="dt-timeoff-picker"
                          value={row.endsOn}
                          onChange={(ymd) =>
                            updateTimeOffRow(idx, { endsOn: ymd })
                          }
                          placeholder="End date"
                          minYmd={row.startsOn || undefined}
                        />
                      </div>
                      <button
                        type="button"
                        className="dt-timeoff-remove"
                        onClick={() => removeTimeOffRow(idx)}
                        aria-label="Remove this time off range"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="dt-timeoff-add"
                  onClick={addTimeOffRow}
                >
                  + Add dates off
                </button>
              </div>
              <div className="dp-field staff-svc-field">
                <label>Services they can perform</label>
                <p className="staff-svc-hint">
                  Add services on the Services page first, then tap to assign
                  them here.
                </p>
                {serviceOptions.length === 0 ? (
                  <div className="staff-svc-empty">No services yet.</div>
                ) : (
                  <div
                    className="staff-svc-picker"
                    role="group"
                    aria-label="Services this staff member can perform"
                  >
                    {serviceOptions.map((s) => {
                      const selected = form.serviceIds.map(String).includes(String(s.id));
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`staff-svc-option ${selected ? "selected" : ""}`}
                          onClick={() => toggleService(s.id)}
                          aria-pressed={selected}
                        >
                          <span className="staff-svc-option-check" aria-hidden>
                            {selected ? <HiCheck className="staff-svc-check-icon" /> : null}
                          </span>
                          <span className="staff-svc-option-body">
                            <span className="staff-svc-option-name">{s.name}</span>
                            <span className="staff-svc-option-meta">
                              {formatMoneyCompact(s.price, businessCurrency)} ·{" "}
                              {s.duration} min
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn cancel"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-save-btn"
                onClick={handleSave}
                disabled={!form.name || !form.role}
              >
                {editing ? "Save Changes" : "Add Member"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
