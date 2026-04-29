import { useState, useEffect, useCallback } from "react";
import {
  useParams,
  Navigate,
  useNavigate,
  useLocation,
  useOutletContext,
  Link,
} from "react-router-dom";
import {
  HiOutlineTicket,
  HiOutlinePaperAirplane,
  HiOutlineX,
  HiOutlinePencil,
  HiOutlineTrash,
} from "react-icons/hi";
import {
  listBusinesses,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCouponApi,
  sendCouponEmailApi,
  getBusinessCustomers,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import { DashboardSkeletonCouponCards } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { canAccessMyBusinessesNav } from "../../utils/roles";
import CouponRecipientPicker from "./CouponRecipientPicker";
import YmdDatePickerField from "../../components/YmdDatePickerField";
import "./dashboard-pages.css";

function formatRange(from, to) {
  const fmt = (iso) => {
    try {
      const [y, m, d] = String(iso).split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        dateStyle: "medium",
      });
    } catch {
      return iso;
    }
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

const emptyRec = () => ({
  sendAll: false,
  selectedEmails: [],
  search: "",
});

const CouponManagement = () => {
  const { businessId } = useParams();
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  /** Keep this page in sync with the sidebar workspace switcher. */
  useEffect(() => {
    if (!activeWorkspaceId || !businessId) return;
    if (String(activeWorkspaceId) === String(businessId)) return;
    navigate(`/dashboard/businesses/${activeWorkspaceId}/coupons`, {
      replace: true,
    });
  }, [activeWorkspaceId, businessId, navigate]);

  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [rows, setRows] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  /** null = creating; set when editing */
  const [editingCouponId, setEditingCouponId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discountPercent: "10",
    validFrom: "",
    validTo: "",
    maxUses: "",
    maxPerCustomer: "1",
    isActive: true,
  });
  /** Per-coupon email UI: sendAll | selected emails | search */
  const [recipientByCoupon, setRecipientByCoupon] = useState({});
  const [sendingId, setSendingId] = useState(null);
  /** { id, code } — custom confirm instead of window.confirm */
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [deactivatingId, setDeactivatingId] = useState(null);
  /** inactive coupon — permanent delete */
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const getRec = useCallback(
    (couponId) => recipientByCoupon[couponId] || emptyRec(),
    [recipientByCoupon],
  );

  const patchRec = useCallback((couponId, patch) => {
    setRecipientByCoupon((prev) => ({
      ...prev,
      [couponId]: { ...emptyRec(), ...prev[couponId], ...patch },
    }));
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setLoadError(null);
    setRows([]);
    setCustomers([]);
    setBusinessName("");
    try {
      const { data: bizData } = await listBusinesses({ scope: "mine" });
      const list = Array.isArray(bizData.businesses) ? bizData.businesses : [];
      const b = list.find((x) => String(x.id ?? x._id) === String(businessId));
      setBusinessName(b?.name?.trim() || "");

      const [custRes, coupRes] = await Promise.all([
        getBusinessCustomers(businessId),
        listCoupons(businessId),
      ]);
      setCustomers(
        Array.isArray(custRes.data?.customers) ? custRes.data.customers : [],
      );
      setRows(Array.isArray(coupRes.data?.coupons) ? coupRes.data.coupons : []);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setRows([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  if (user && !canAccessMyBusinessesNav(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const subLimits = user?.subscription?.limits;
  const subAdmin = Boolean(user?.subscription?.isAdmin);
  if (
    user &&
    canAccessMyBusinessesNav(user.role) &&
    !subAdmin &&
    !subLimits?.coupons
  ) {
    return (
      <Navigate
        to="/pricing"
        replace
        state={{
          upgradeFeature: "coupons",
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  const openCreate = () => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    const today = `${y}-${m}-${d}`;
    setEditingCouponId(null);
    setForm({
      code: "",
      discountPercent: "10",
      validFrom: today,
      validTo: today,
      maxUses: "",
      maxPerCustomer: "1",
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditingCouponId(c.id);
    setForm({
      code: String(c.code ?? ""),
      discountPercent: String(c.discountPercent ?? 10),
      validFrom: String(c.validFrom || "").slice(0, 10),
      validTo: String(c.validTo || "").slice(0, 10),
      maxUses: c.maxUses != null ? String(c.maxUses) : "",
      maxPerCustomer: String(c.maxPerCustomer ?? 1),
      isActive: c.isActive !== false,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingCouponId(null);
  };

  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    if (!businessId) return;
    setSubmitting(true);
    try {
      const body = {
        code: form.code.trim(),
        discountPercent: Number(form.discountPercent),
        validFrom: form.validFrom,
        validTo: form.validTo,
        maxPerCustomer: Number(form.maxPerCustomer) || 1,
      };
      if (String(form.maxUses).trim() !== "") {
        body.maxUses = Number(form.maxUses);
      } else if (editingCouponId) {
        body.maxUses = null;
      }
      if (editingCouponId) {
        body.isActive = Boolean(form.isActive);
        await updateCoupon(businessId, editingCouponId, body);
        showToast("Coupon updated.", "success");
      } else {
        await createCoupon(businessId, body);
        showToast("Coupon created.", "success");
      }
      closeModal();
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeactivateCoupon = async () => {
    if (!businessId || !deactivateConfirm) return;
    setDeactivatingId(deactivateConfirm.id);
    try {
      await deleteCouponApi(businessId, deactivateConfirm.id);
      showToast("Coupon deactivated.", "success");
      setDeactivateConfirm(null);
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDeactivatingId(null);
    }
  };

  const confirmRemoveCoupon = async () => {
    if (!businessId || !removeConfirm) return;
    setRemovingId(removeConfirm.id);
    try {
      const { data } = await deleteCouponApi(businessId, removeConfirm.id);
      setRemoveConfirm(null);
      showToast(
        data?.deleted ? "Coupon removed." : "Done.",
        "success",
      );
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setRemovingId(null);
    }
  };

  const handleSendEmails = async (couponId) => {
    const st = getRec(couponId);
    if (!st.sendAll && (!st.selectedEmails || st.selectedEmails.length === 0)) {
      showToast(
        'Choose "all customers" or select one or more recipients.',
        "error",
      );
      return;
    }
    if (!businessId) return;
    setSendingId(couponId);
    try {
      const body = st.sendAll
        ? { sendToAllCustomers: true }
        : { emails: st.selectedEmails };
      const { data } = await sendCouponEmailApi(businessId, couponId, body);
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      const total = data.total ?? sent + failed;
      if (failed > 0 && sent > 0) {
        showToast(`Sent ${sent} of ${total} emails.`, "success");
      } else if (failed > 0) {
        showToast("No emails were delivered. Check SMTP settings.", "error");
      } else {
        showToast(
          `Sent ${sent} email${sent === 1 ? "" : "s"}.`,
          "success",
        );
      }
      patchRec(couponId, emptyRec());
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="dp-page dp-coupon-page">
      <div className="dp-coupon-page-header">
        <div>
          <h1 className="dp-title">Discount coupons</h1>
          <p className="dp-subtitle">
            {loading ? (
              <span
                className="dp-skel dp-skel-line dp-skel-line--sub"
                style={{ display: "inline-block", maxWidth: 420 }}
                aria-hidden
              />
            ) : businessName ? (
              `Codes for ${businessName}. Customers apply them when booking.`
            ) : (
              "Create codes customers can use when booking."
            )}
          </p>
          {!loading && businessName && !loadError ? (
            <p className="dp-coupon-page-hint">
              Pick validity dates for days when you accept bookings. Dates you
              mark as{" "}
              <Link to="/dashboard/closing-days" className="dp-coupon-page-hint-link">
                Closing days
              </Link>{" "}
              block new reservations—customers cannot book (or use a coupon) on
              those days, so align the coupon range with your real booking
              calendar.
            </p>
          ) : null}
        </div>
        {businessId && !loading && !loadError ? (
          <button
            type="button"
            className="dp-coupon-btn-new"
            onClick={openCreate}
          >
            <HiOutlineTicket size={18} aria-hidden />
            New coupon
          </button>
        ) : null}
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={load} />
      ) : loading ? (
        <DashboardSkeletonCouponCards rows={4} />
      ) : !businessId ? (
        <p className="dp-subtitle">Missing business.</p>
      ) : rows.length === 0 ? (
        <div className="dp-coupon-empty">
          <div className="dp-coupon-empty-icon" aria-hidden>
            <HiOutlineTicket size={40} />
          </div>
          <h3>No coupons yet</h3>
          <p>
            Create a code, set the discount and dates, then share it by email
            or in person.
          </p>
        </div>
      ) : (
        <ul className="dp-coupon-list-v2">
          {rows.map((c) => (
            <li key={c.id} className="dp-coupon-card-v2">
              <div className="dp-coupon-card-top">
                <div className="dp-coupon-card-top-row">
                  <div className="dp-coupon-hero">
                    <span className="dp-coupon-code-v2">{c.code}</span>
                    <span className="dp-coupon-badge-v2">
                      −{c.discountPercent}%
                    </span>
                    {!c.isActive ? (
                      <span className="dp-coupon-inactive-pill">Inactive</span>
                    ) : null}
                  </div>
                  <div className="dp-coupon-card-actions">
                    {c.isActive ? (
                      <button
                        type="button"
                        className="dt-icon-btn"
                        onClick={() => openEdit(c)}
                        aria-label="Edit coupon"
                        title="Edit"
                      >
                        <HiOutlinePencil size={18} aria-hidden />
                      </button>
                    ) : null}
                    {!c.isActive ? (
                      <button
                        type="button"
                        className="dt-icon-btn danger"
                        onClick={() =>
                          setRemoveConfirm({
                            id: c.id,
                            code:
                              String(c.code ?? "").trim() || "this coupon",
                          })
                        }
                        aria-label="Remove coupon permanently"
                        title="Remove"
                      >
                        <HiOutlineTrash size={18} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="dp-coupon-meta-row">
                  <span>{formatRange(c.validFrom, c.validTo)}</span>
                  <span className="dp-coupon-meta-dot">·</span>
                  <span>
                    Uses{" "}
                    {c.maxUses != null
                      ? `${c.usedCount ?? 0} / ${c.maxUses}`
                      : `${c.usedCount ?? 0}`}
                  </span>
                </div>
              </div>

              {c.isActive ? (
                <div className="dp-coupon-card-bottom">
                  <CouponRecipientPicker
                    customers={customers}
                    sendAll={getRec(c.id).sendAll}
                    onSendAllChange={(v) =>
                      patchRec(c.id, {
                        sendAll: v,
                        selectedEmails: v ? [] : getRec(c.id).selectedEmails,
                      })
                    }
                    search={getRec(c.id).search}
                    onSearchChange={(s) => patchRec(c.id, { search: s })}
                    selectedEmails={getRec(c.id).selectedEmails}
                    onToggleEmail={(email) => {
                      const cur = getRec(c.id);
                      const set = new Set(cur.selectedEmails);
                      if (set.has(email)) set.delete(email);
                      else set.add(email);
                      patchRec(c.id, {
                        sendAll: false,
                        selectedEmails: [...set],
                      });
                    }}
                    onRemoveEmail={(email) =>
                      patchRec(c.id, {
                        selectedEmails: getRec(c.id).selectedEmails.filter(
                          (e) => e !== email,
                        ),
                      })
                    }
                    disabled={sendingId === c.id}
                  />
                  <div className="dp-coupon-footer-actions">
                    <button
                      type="button"
                      className="dp-coupon-btn-send"
                      disabled={sendingId === c.id}
                      onClick={() => handleSendEmails(c.id)}
                    >
                      <HiOutlinePaperAirplane size={18} aria-hidden />
                      {sendingId === c.id ? "Sending…" : "Send emails"}
                    </button>
                    <button
                      type="button"
                      className="dp-coupon-btn-ghost"
                      onClick={() =>
                        setDeactivateConfirm({
                          id: c.id,
                          code: String(c.code ?? "").trim() || "this code",
                        })
                      }
                      disabled={sendingId === c.id}
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {deactivateConfirm ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !deactivatingId && setDeactivateConfirm(null)}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-coupon-deactivate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-coupon-deactivate-title">Deactivate coupon?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !deactivatingId && setDeactivateConfirm(null)}
                aria-label="Close"
                disabled={Boolean(deactivatingId)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                Customers will no longer be able to use{" "}
                <strong>{deactivateConfirm.code}</strong> at checkout. You can
                create a new coupon anytime.
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={() => !deactivatingId && setDeactivateConfirm(null)}
                disabled={Boolean(deactivatingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-btn-danger"
                onClick={confirmDeactivateCoupon}
                disabled={Boolean(deactivatingId)}
              >
                {deactivatingId ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeConfirm ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !removingId && setRemoveConfirm(null)}
        >
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-coupon-remove-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-coupon-remove-title">Remove coupon?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !removingId && setRemoveConfirm(null)}
                aria-label="Close"
                disabled={Boolean(removingId)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                This permanently deletes <strong>{removeConfirm.code}</strong>{" "}
                from your list. Past bookings that used it keep their history.
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={() => !removingId && setRemoveConfirm(null)}
                disabled={Boolean(removingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-btn-danger"
                onClick={confirmRemoveCoupon}
                disabled={Boolean(removingId)}
              >
                {removingId ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !submitting && closeModal()}
        >
          <div
            className="dt-modal dt-modal--sm dp-closing-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2>{editingCouponId ? "Edit coupon" : "New coupon"}</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !submitting && closeModal()}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSaveCoupon}>
              <div className="dt-modal-body">
                <div className="dp-field">
                  <label>Code</label>
                  <input
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value }))
                    }
                    placeholder="e.g. SPRING20"
                    required
                    maxLength={40}
                    autoComplete="off"
                  />
                </div>
                <div className="dp-field">
                  <label>Discount (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.discountPercent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discountPercent: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="dt-modal-row dt-modal-row--promo-dates">
                  <YmdDatePickerField
                    label="Valid from"
                    value={form.validFrom}
                    onChange={(ymd) =>
                      setForm((prev) => ({
                        ...prev,
                        validFrom: ymd,
                        validTo:
                          prev.validTo && ymd > prev.validTo ? ymd : prev.validTo,
                      }))
                    }
                    maxYmd={form.validTo || undefined}
                  />
                  <YmdDatePickerField
                    label="Valid until"
                    value={form.validTo}
                    onChange={(ymd) =>
                      setForm((prev) => ({
                        ...prev,
                        validTo: ymd,
                        validFrom:
                          prev.validFrom && ymd < prev.validFrom
                            ? ymd
                            : prev.validFrom,
                      }))
                    }
                    minYmd={form.validFrom || undefined}
                    popoverAlign="end"
                  />
                </div>
                <p className="dp-coupon-modal-closing-hint">
                  These dates control when the code may be applied to an
                  appointment. Compare with{" "}
                  <Link
                    to="/dashboard/closing-days"
                    className="dp-coupon-page-hint-link"
                  >
                    Closing days
                  </Link>
                  —you cannot accept new bookings on closed dates, so avoid
                  relying on a range that only covers days you do not take
                  reservations.
                </p>
                <div className="dp-field">
                  <label>Max total uses (optional)</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="Unlimited if empty"
                    value={form.maxUses}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxUses: e.target.value }))
                    }
                  />
                </div>
                <div className="dp-field">
                  <label>Max uses per customer</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxPerCustomer}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxPerCustomer: e.target.value,
                      }))
                    }
                  />
                </div>
                {editingCouponId ? (
                  <label className="dp-coupon-active-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          isActive: e.target.checked,
                        }))
                      }
                    />
                    <span>Coupon is active (customers can use it when booking)</span>
                  </label>
                ) : null}
                <p className="dt-promo-hint">
                  Discount applies to the appointment price after any service
                  sale. The appointment date must fall in the valid range.
                </p>
              </div>
              <div className="dt-modal-footer">
                <button
                  type="button"
                  className="dp-action-btn cancel"
                  onClick={() => !submitting && closeModal()}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dp-save-btn"
                  disabled={submitting}
                >
                  {submitting
                    ? "Saving…"
                    : editingCouponId
                      ? "Save changes"
                      : "Create coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CouponManagement;
