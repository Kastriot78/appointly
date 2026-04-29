import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { useOutletContext, Navigate } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import { startOfDay, isBefore, format } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-day-picker/style.css";
import { HiOutlineCalendar, HiOutlineX } from "react-icons/hi";
import "./dashboard-pages.css";
import {
  listBusinesses,
  listClosingDays,
  createClosingDay,
  updateClosingDay,
  deleteClosingDay,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { getStoredWorkspaceId } from "../../auth/session";
import { useToast } from "../../components/ToastContext";
import {
  DashboardSkeletonClosingList,
  DashboardSkeletonStack,
} from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { isCustomerRole, isAdminRole } from "../../utils/roles";

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local calendar day at 00:00 (for DayPicker selection). */
function dateAtLocalMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function timeFromDate(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function combineDateTime(date, timeStr) {
  if (!date || timeStr == null || String(timeStr).trim() === "") return null;
  const parts = String(timeStr).trim().split(":");
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) || 0;
  if (Number.isNaN(hh)) return null;
  const out = new Date(date);
  out.setHours(hh, mm, 0, 0);
  return out;
}

function placePopoverFixed(btnRect, popW, popH, popoverAlign) {
  const margin = 10;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let top = btnRect.bottom + margin;
  if (top + popH > vh - margin) {
    top = btnRect.top - popH - margin;
  }
  if (top < margin) top = margin;
  const maxTop = Math.max(margin, vh - margin - popH);
  if (top > maxTop) top = maxTop;

  let left =
    popoverAlign === "end" ? btnRect.right - popW : btnRect.left;
  if (left + popW > vw - margin) left = vw - popW - margin;
  if (left < margin) left = margin;
  return { top, left };
}

/**
 * Calendar in a portal with fixed positioning so the full month stays visible
 * (not clipped by the modal or viewport bottom).
 */
function ClosingDatePickerField({
  selected,
  onSelect,
  disabled,
  defaultMonth,
  fieldKey,
  openField,
  setOpenField,
  popoverAlign,
  ariaLabel,
}) {
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const open = openField === fieldKey;
  const [fixedPos, setFixedPos] = useState(null);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const pop = popRef.current;
    const btn = wrap?.querySelector("button");
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const ph = Math.max(pop.offsetHeight, 320);
    const pw = Math.max(pop.offsetWidth, 280);
    setFixedPos(placePopoverFixed(rect, pw, ph, popoverAlign));
  }, [popoverAlign]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    reposition();
    const raf = requestAnimationFrame(reposition);
    const ro =
      typeof ResizeObserver !== "undefined" && popRef.current
        ? new ResizeObserver(() => reposition())
        : null;
    if (popRef.current && ro) ro.observe(popRef.current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition, selected]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpenField(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpenField]);

  const handleDaySelect = (d) => {
    if (!d) return;
    onSelect(d);
    setOpenField(null);
  };

  const popoverEl =
    open &&
    createPortal(
      <div
        ref={popRef}
        className="dp-day-picker-popover dp-day-picker-popover--portal"
        style={{
          position: "fixed",
          top: fixedPos?.top ?? -9999,
          left: fixedPos?.left ?? 0,
          visibility: fixedPos ? "visible" : "hidden",
          zIndex: 1100,
        }}
        role="dialog"
        aria-label={ariaLabel}
      >
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          defaultMonth={selected ?? defaultMonth ?? new Date()}
          locale={enUS}
          disabled={disabled}
          captionLayout="dropdown"
          fromYear={new Date().getFullYear()}
          toYear={new Date().getFullYear() + 3}
          className="dp-booking-day-picker"
        />
      </div>,
      document.body,
    );

  return (
    <div className="dp-date-picker-wrap dp-closing-date-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`dp-date-picker-trigger ${open ? "active" : ""}`}
        onClick={() =>
          setOpenField((prev) => (prev === fieldKey ? null : fieldKey))
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HiOutlineCalendar size={18} aria-hidden />
        <span>
          {selected
            ? format(selected, "EEE, MMM d, yyyy", { locale: enUS })
            : "Pick a date"}
        </span>
      </button>
      {popoverEl}
    </div>
  );
}

function formatRangeLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function dayBadge(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
}

const ClosingDays = () => {
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");
  const [rows, setRows] = useState([]);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  /** Pending delete — custom modal instead of window.confirm */
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [formReason, setFormReason] = useState("");
  const [fromDate, setFromDate] = useState(undefined);
  const [fromTime, setFromTime] = useState("09:00");
  const [untilDate, setUntilDate] = useState(undefined);
  const [untilTime, setUntilTime] = useState("17:00");
  /** Which date popover is open — only one at a time, calendar not inline in modal */
  const [openDateField, setOpenDateField] = useState(null);
  /** Bumps list refetch when user retries after a list-only failure. */
  const [retryNonce, setRetryNonce] = useState(0);

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
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError(null);
      try {
        const { data } = await listClosingDays(businessId);
        if (!cancelled) {
          setRows(Array.isArray(data.closingDays) ? data.closingDays : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, retryNonce]);

  useEffect(() => {
    if (!fromDate || !untilDate) return;
    if (isBefore(startOfDay(untilDate), startOfDay(fromDate))) {
      setUntilDate(dateAtLocalMidnight(fromDate));
    }
  }, [fromDate, untilDate]);

  useEffect(() => {
    if (!modal) setOpenDateField(null);
  }, [modal]);

  const selectedBusinessName = useMemo(() => {
    const b = businesses.find(
      (x) => String(x.id ?? x._id) === String(businessId),
    );
    return b?.name?.trim() || "";
  }, [businesses, businessId]);

  const openAdd = () => {
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    setFormReason("");
    setFromDate(dateAtLocalMidnight(now));
    setFromTime(timeFromDate(now));
    setUntilDate(dateAtLocalMidnight(inOneHour));
    setUntilTime(timeFromDate(inOneHour));
    setModal({ mode: "create" });
  };

  const openEdit = (row) => {
    setFormReason(row.reason || "");
    const s = new Date(row.startsAt);
    const e = new Date(row.endsAt);
    setFromDate(dateAtLocalMidnight(s));
    setFromTime(timeFromDate(s));
    setUntilDate(dateAtLocalMidnight(e));
    setUntilTime(timeFromDate(e));
    setModal({ mode: "edit", id: row.id });
  };

  const closeModal = () => {
    if (!saving) setModal(null);
  };

  const submitModal = async () => {
    if (!businessId) return;
    const startsAt = combineDateTime(fromDate, fromTime);
    const endsAt = combineDateTime(untilDate, untilTime);
    if (!startsAt || !endsAt) {
      showToast("Please set both date and time for start and end.", "error");
      return;
    }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      showToast("Please set valid start and end times.", "error");
      return;
    }
    if (endsAt <= startsAt) {
      showToast("End must be after start.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: formReason.trim(),
      };
      if (modal.mode === "create") {
        await createClosingDay(businessId, body);
        showToast("Closing period added.", "success");
      } else {
        await updateClosingDay(businessId, modal.id, body);
        showToast("Closing period updated.", "success");
      }
      setModal(null);
      const { data } = await listClosingDays(businessId);
      setRows(Array.isArray(data.closingDays) ? data.closingDays : []);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (row) => {
    setDeleteConfirm({
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    });
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setDeleteConfirm(null);
  };

  const confirmDeleteClosing = async () => {
    if (!businessId || !deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeletingId(id);
    try {
      await deleteClosingDay(businessId, id);
      showToast("Closing period removed.", "success");
      setRows((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (isCustomerRole(user?.role) || isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page dp-closing-page">
      <div className="dp-header dp-closing-header">
        <div>
          <h1 className="dp-title">Closing days</h1>
          <p className="dp-subtitle">
            Block new reservations for {selectedBusinessName ? (
              <strong>{selectedBusinessName}</strong>
            ) : (
              "your business"
            )}{" "}
            during breaks, holidays, or maintenance. Customers won&apos;t see
            available slots that overlap these times.
          </p>
        </div>
        {businessId && !loadingBiz && !error ? (
          <button
            type="button"
            className="dp-btn-primary dp-closing-add-btn"
            onClick={openAdd}
          >
            <HiOutlineCalendar size={18} aria-hidden />
            Add closing period
          </button>
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

      {businessId && !loadingBiz ? (
        <>
          {loadingList ? <DashboardSkeletonClosingList rows={4} /> : null}
          {!loadingList && rows.length === 0 ? (
            <div className="dp-empty dp-closing-empty">
              <p>No closing periods yet. Add one when you need a break.</p>
            </div>
          ) : null}
          {!loadingList && rows.length > 0 ? (
            <ul className="dp-closing-list">
              {rows.map((row) => (
                <li key={row.id} className="dp-closing-card">
                  <div className="dp-closing-card-badge" aria-hidden>
                    {dayBadge(row.startsAt)}
                  </div>
                  <div className="dp-closing-card-body">
                    <div className="dp-closing-range">
                      <div>
                        <span className="dp-closing-kicker">From</span>
                        <span className="dp-closing-time">
                          {formatRangeLabel(row.startsAt)}
                        </span>
                      </div>
                      <div>
                        <span className="dp-closing-kicker">Until</span>
                        <span className="dp-closing-time">
                          {formatRangeLabel(row.endsAt)}
                        </span>
                      </div>
                    </div>
                    {row.reason?.trim() ? (
                      <p className="dp-closing-reason">
                        <span className="dp-closing-kicker">Reason:</span>{" "}
                        {row.reason.trim()}
                      </p>
                    ) : null}
                  </div>
                  <div className="dp-closing-card-actions">
                    <button
                      type="button"
                      className="dp-action-btn reschedule"
                      onClick={() => openEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="dp-action-btn cancel"
                      disabled={deletingId === row.id}
                      onClick={() => openDeleteModal(row)}
                    >
                      {deletingId === row.id ? "…" : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
        </>
      )}

      {modal ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !saving && closeModal()}
        >
          <div
            className="dt-modal dp-closing-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-closing-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-closing-modal-title">
                {modal.mode === "create"
                  ? "Add closing period"
                  : "Edit closing period"}
              </h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={closeModal}
                aria-label="Close"
                disabled={saving}
              >
                ×
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="dp-closing-modal-hint">
                Until when do you want to pause new reservations? Existing
                bookings are not changed.
              </p>
              <label className="dp-closing-field">
                <span>Closing reason</span>
                <textarea
                  className="form-control dp-closing-reason-textarea"
                  placeholder="e.g. Public holiday, team training, maintenance…"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  maxLength={500}
                  rows={4}
                />
              </label>
              <div className="dp-closing-datetime-stack">
                <div className="dp-closing-datetime-block">
                  <span className="dp-closing-datetime-block-title">From</span>
                  <ClosingDatePickerField
                    selected={fromDate}
                    onSelect={(d) => setFromDate(d)}
                    defaultMonth={fromDate}
                    fieldKey="from"
                    openField={openDateField}
                    setOpenField={setOpenDateField}
                    popoverAlign="start"
                    ariaLabel="Start date"
                    disabled={
                      modal?.mode === "create"
                        ? (date) =>
                            isBefore(startOfDay(date), startOfDay(new Date()))
                        : undefined
                    }
                  />
                  <label className="dp-closing-field dp-closing-time-row">
                    <span>Time</span>
                    <input
                      type="time"
                      step={300}
                      className="form-control"
                      value={fromTime}
                      onChange={(e) => setFromTime(e.target.value)}
                    />
                  </label>
                </div>
                <div className="dp-closing-datetime-block">
                  <span className="dp-closing-datetime-block-title">Until</span>
                  <ClosingDatePickerField
                    selected={untilDate}
                    onSelect={(d) => setUntilDate(d)}
                    defaultMonth={untilDate ?? fromDate}
                    fieldKey="until"
                    openField={openDateField}
                    setOpenField={setOpenDateField}
                    popoverAlign="end"
                    ariaLabel="End date"
                    disabled={(date) => {
                      if (fromDate) {
                        return isBefore(
                          startOfDay(date),
                          startOfDay(fromDate),
                        );
                      }
                      if (modal?.mode === "create") {
                        return isBefore(
                          startOfDay(date),
                          startOfDay(new Date()),
                        );
                      }
                      return false;
                    }}
                  />
                  <label className="dp-closing-field dp-closing-time-row">
                    <span>Time</span>
                    <input
                      type="time"
                      step={300}
                      className="form-control"
                      value={untilTime}
                      onChange={(e) => setUntilTime(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn reschedule"
                onClick={closeModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-btn-primary"
                onClick={submitModal}
                disabled={saving}
              >
                {saving ? "Saving…" : modal.mode === "create" ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-closing-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-closing-delete-title">Delete closing period?</h2>
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
                This removes the block on new bookings for this window. Existing
                customer appointments are not cancelled — only the restriction is
                lifted.
              </p>
              <p className="dp-closing-delete-preview">
                <span className="dp-closing-kicker">From</span>{" "}
                {formatRangeLabel(deleteConfirm.startsAt)}
                <br />
                <span className="dp-closing-kicker mt-2">Until</span>{" "}
                {formatRangeLabel(deleteConfirm.endsAt)}
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
                onClick={confirmDeleteClosing}
                disabled={!!deletingId}
              >
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ClosingDays;
