import { useState, useEffect, useMemo, useCallback } from "react";
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
  HiOutlineClock,
  HiOutlineX,
  HiOutlineArrowLeft,
  HiOutlineTag,
} from "react-icons/hi";
import {
  listServices,
  getBusiness,
  createService,
  updateService,
  deleteServiceApi,
  applyPromotionBulk,
  reorderServices,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import AppTooltip from "../../components/AppTooltip";
import YmdDatePickerField from "../../components/YmdDatePickerField";
import { canAccessMyBusinessesNav } from "../../utils/roles";
import { getPromotionView, todayIsoDate } from "../../utils/servicePromotion";
import {
  formatMoneyAmount,
  formatMoneyCompact,
  normalizeCurrency,
} from "../../utils/currency";
import { DashboardSkeletonServiceCards } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import "./dashboard-pages.css";

/** Highest allowed sale: one cent below list price (when list > 0). */
function maxSaleForBase(base) {
  const b = Number(base);
  if (!Number.isFinite(b) || b <= 0) return null;
  return round2(Math.max(0, b - 0.01));
}

function isoAddDaysFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Keep at most `maxDecimals` digits after the decimal point (typing / paste). */
function sanitizeDecimalInput(str, maxDecimals = 2) {
  let s = String(str ?? "").replace(/[^\d.]/g, "");
  if (s === "") return "";
  const dot = s.indexOf(".");
  if (dot === -1) return s;
  const intPart = s.slice(0, dot);
  const frac = s.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals);
  return `${intPart}.${frac}`;
}

const ServicesManagement = () => {
  const { businessId } = useParams();
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const navigate = useNavigate();

  /** Redirect to the active workspace version when the user switches tenants. */
  useEffect(() => {
    if (!activeWorkspaceId || !businessId) return;
    if (String(activeWorkspaceId) === String(businessId)) return;
    navigate(`/dashboard/businesses/${activeWorkspaceId}/services`, {
      replace: true,
    });
  }, [activeWorkspaceId, businessId, navigate]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [services, setServices] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [clearPromoModalOpen, setClearPromoModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [draggingServiceId, setDraggingServiceId] = useState(null);
  const [dragOverServiceId, setDragOverServiceId] = useState(null);
  const [businessCurrency, setBusinessCurrency] = useState("EUR");
  const [form, setForm] = useState({
    name: "",
    price: "",
    duration: "",
    description: "",
    promoEnabled: false,
    salePrice: "",
    promoPercent: "10",
    validFrom: "",
    validTo: "",
  });
  const [bulkForm, setBulkForm] = useState({
    percentOff: "15",
    validFrom: todayIsoDate(),
    validTo: isoAddDaysFromToday(7),
  });

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setLoadError(null);
    setServices([]);
    try {
      const [svcRes, bizRes] = await Promise.all([
        listServices(businessId),
        getBusiness(businessId).catch(() => ({ data: {} })),
      ]);
      setServices(
        Array.isArray(svcRes.data.services) ? svcRes.data.services : [],
      );
      setBusinessCurrency(
        normalizeCurrency(bizRes.data?.business?.currency),
      );
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = useMemo(() => todayIsoDate(), []);
  const canReorder = user?.role === "tenant" && services.length > 1 && !loading;

  const moveService = useCallback((rows, fromId, toId) => {
    const from = rows.findIndex((s) => s.id === fromId);
    const to = rows.findIndex((s) => s.id === toId);
    if (from === -1 || to === -1 || from === to) return rows;
    const copy = [...rows];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  }, []);

  const persistReorder = useCallback(
    async (nextRows, prevRows) => {
      setReorderSaving(true);
      try {
        await reorderServices(
          businessId,
          nextRows.map((s) => s.id),
        );
      } catch (err) {
        setServices(prevRows);
        showToast(getApiErrorMessage(err), "error");
      } finally {
        setReorderSaving(false);
      }
    },
    [businessId, showToast],
  );

  const promoSaleError = useMemo(() => {
    if (!form.promoEnabled) return null;
    const base = Number(form.price);
    const raw = String(form.salePrice ?? "").trim();
    if (raw === "" || raw === "." || raw === "-") {
      return "Enter a sale price lower than the regular price.";
    }
    const sale = Number(form.salePrice);
    if (!Number.isFinite(sale) || sale < 0) {
      return "Enter a valid sale price.";
    }
    if (!Number.isFinite(base) || base <= 0) {
      return "Set a regular price first.";
    }
    if (sale >= base) {
      return `Sale price must be below ${formatMoneyAmount(base, businessCurrency)}. A discount cannot be higher than the list price.`;
    }
    return null;
  }, [form.promoEnabled, form.price, form.salePrice, businessCurrency]);

  const maxSaleHint = useMemo(() => {
    if (!form.promoEnabled) return null;
    const m = maxSaleForBase(form.price);
    if (m == null) return null;
    return `Must be under ${formatMoneyAmount(Number(form.price), businessCurrency)} — max ${formatMoneyAmount(m, businessCurrency)}`;
  }, [form.promoEnabled, form.price, businessCurrency]);

  if (user && !canAccessMyBusinessesNav(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const openNew = () => {
    setEditingService(null);
    const t = todayIsoDate();
    setForm({
      name: "",
      price: "",
      duration: "30",
      description: "",
      promoEnabled: false,
      salePrice: "",
      promoPercent: "10",
      validFrom: t,
      validTo: isoAddDaysFromToday(7),
    });
    setModalOpen(true);
  };

  const openEdit = (service) => {
    setEditingService(service);
    const base = Number(service.price);
    const p = service.promotion;
    let promoPercent = "10";
    let salePrice = "";
    if (p && base > 0) {
      salePrice = String(round2(Number(p.salePrice)));
      promoPercent = String(
        Math.round(((base - Number(p.salePrice)) / base) * 100),
      );
    }
    setForm({
      name: service.name,
      price: String(service.price),
      duration: String(service.duration),
      description: service.description || "",
      promoEnabled: Boolean(p && p.salePrice != null),
      salePrice,
      promoPercent,
      validFrom: p?.validFrom || todayIsoDate(),
      validTo: p?.validTo || todayIsoDate(),
    });
    setModalOpen(true);
  };

  const syncSaleFromPercent = (baseStr, pctStr) => {
    const base = Number(baseStr);
    const pct = Number(pctStr);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(pct)) return "";
    const sale = round2((base * (100 - Math.min(99, Math.max(1, pct)))) / 100);
    return String(sale);
  };

  const syncPercentFromSale = (baseStr, saleStr) => {
    const base = Number(baseStr);
    const sale = Number(saleStr);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(sale)) return "";
    if (sale >= base) return "";
    return String(Math.round(((base - sale) / base) * 100));
  };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.duration) return;
    const base = Number(form.price);
    try {
      const body = {
        name: form.name.trim(),
        price: base,
        duration: Number(form.duration),
        description: form.description.trim(),
        isActive: true,
      };
      if (form.promoEnabled) {
        const sale = round2(Number(form.salePrice));
        if (!Number.isFinite(sale) || sale < 0 || sale >= base) {
          showToast(
            "Sale price must be lower than the regular list price.",
            "error",
          );
          return;
        }
        if (!form.validFrom || !form.validTo) {
          showToast("Choose valid from and until dates.", "error");
          return;
        }
        if (form.validFrom > form.validTo) {
          showToast("End date must be on or after the start date.", "error");
          return;
        }
        body.promotion = {
          salePrice: sale,
          validFrom: form.validFrom,
          validTo: form.validTo,
        };
      } else if (editingService) {
        body.promotion = null;
      }
      if (editingService) {
        await updateService(businessId, editingService.id, body);
        showToast("Service updated.", "success");
      } else {
        await createService(businessId, body);
        showToast("Service added.", "success");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const handleBulkApply = async () => {
    const pct = Number(bulkForm.percentOff);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      showToast("Enter a percent between 1 and 99.", "error");
      return;
    }
    if (!bulkForm.validFrom || !bulkForm.validTo) {
      showToast("Choose the sale date range.", "error");
      return;
    }
    if (bulkForm.validFrom > bulkForm.validTo) {
      showToast("End date must be on or after the start date.", "error");
      return;
    }
    setBulkSubmitting(true);
    try {
      await applyPromotionBulk(businessId, {
        percentOff: pct,
        validFrom: bulkForm.validFrom,
        validTo: bulkForm.validTo,
      });
      showToast("Promotion applied to all services.", "success");
      setBulkModalOpen(false);
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const performBulkClear = async () => {
    setBulkSubmitting(true);
    try {
      await applyPromotionBulk(businessId, { clear: true });
      showToast("All promotions cleared.", "success");
      setClearPromoModalOpen(false);
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const toggleActive = async (svc) => {
    const previous = services;
    const nextIsActive = !svc.isActive;
    setServices((prev) =>
      prev.map((item) =>
        item.id === svc.id ? { ...item, isActive: nextIsActive } : item,
      ),
    );
    try {
      await updateService(businessId, svc.id, {
        isActive: nextIsActive,
      });
    } catch (err) {
      setServices(previous);
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const deleteService = async (svc) => {
    try {
      await deleteServiceApi(businessId, svc.id);
      showToast("Service removed.", "success");
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const activeCount = services.filter((s) => s.isActive).length;
  const anyPromo = services.some((s) => s.promotion?.salePrice != null);

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
          <h1 className="dp-title">Services</h1>
          <p className="dp-subtitle">
            {loading ? (
              <span
                className="dp-skel dp-skel-line dp-skel-line--sub"
                style={{ display: "inline-block", maxWidth: 260 }}
                aria-hidden
              />
            ) : loadError ? (
              "We couldn’t load services."
            ) : (
              `${services.length} services · ${activeCount} active`
            )}
          </p>
          {canReorder ? (
            <p className="dp-subtitle" style={{ marginTop: 4 }}>
              Drag cards to reorder services.
              {reorderSaving ? " Saving order..." : ""}
            </p>
          ) : null}
        </div>
        {!loadError ? (
        <div className="dt-services-header-actions">
          {services.length > 0 ? (
            <button
              type="button"
              className={
                anyPromo ? "dt-promo-clear-btn" : "dt-promo-bulk-btn"
              }
              onClick={() => {
                if (anyPromo) {
                  setClearPromoModalOpen(true);
                } else {
                  setBulkForm((f) => ({
                    ...f,
                    validFrom: todayIsoDate(),
                    validTo: isoAddDaysFromToday(7),
                  }));
                  setBulkModalOpen(true);
                }
              }}
              disabled={bulkSubmitting}
            >
              {anyPromo ? (
                <>
                  <HiOutlineTrash size={18} />
                  Clear all sales
                </>
              ) : (
                <>
                  <HiOutlineTag size={18} />
                  Sale on all services
                </>
              )}
            </button>
          ) : null}
          <button type="button" className="dt-add-btn" onClick={openNew}>
            <HiOutlinePlus size={18} />
            Add Service
          </button>
        </div>
        ) : null}
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={load} />
      ) : (
      <div className="dt-services-grid">
        {loading ? (
          <DashboardSkeletonServiceCards rows={4} />
        ) : (
          <>
            {services.map((service) => {
          const pv = getPromotionView(service, today);
          return (
            <div
              key={service.id}
              className={`dt-service-card ${canReorder ? "dt-service-card--reorderable" : ""} ${!service.isActive ? "inactive" : ""} ${pv ? "dt-service-card--promo" : ""} ${draggingServiceId === service.id ? "dt-service-card--dragging" : ""} ${dragOverServiceId === service.id && draggingServiceId !== service.id ? "dt-service-card--drag-over" : ""}`}
              draggable={canReorder}
              onDragStart={(e) => {
                if (!canReorder) return;
                setDraggingServiceId(service.id);
                setDragOverServiceId(service.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", service.id);
              }}
              onDragOver={(e) => {
                if (!canReorder || !draggingServiceId) return;
                e.preventDefault();
                if (dragOverServiceId !== service.id) {
                  setDragOverServiceId(service.id);
                }
              }}
              onDrop={(e) => {
                if (!canReorder || !draggingServiceId) return;
                e.preventDefault();
                const prev = services;
                const next = moveService(prev, draggingServiceId, service.id);
                setDraggingServiceId(null);
                setDragOverServiceId(null);
                if (next === prev) return;
                setServices(next);
                persistReorder(next, prev);
              }}
              onDragEnd={() => {
                setDraggingServiceId(null);
                setDragOverServiceId(null);
              }}
            >
              <div className="dt-service-top">
                <div>
                  {canReorder ? (
                    <span className="dt-service-drag-hint" aria-hidden>
                      Drag to reorder
                    </span>
                  ) : null}
                  <h3>{service.name}</h3>
                  <p>{service.description || "—"}</p>
                </div>
                <div className="dt-service-actions">
                  <AppTooltip content="Edit">
                    <button
                      type="button"
                      className="dt-icon-btn"
                      onClick={() => openEdit(service)}
                    >
                      <HiOutlinePencil size={16} />
                    </button>
                  </AppTooltip>
                  <AppTooltip content="Delete">
                    <button
                      type="button"
                      className="dt-icon-btn danger"
                      onClick={() => deleteService(service)}
                    >
                      <HiOutlineTrash size={16} />
                    </button>
                  </AppTooltip>
                </div>
              </div>
              <div className="dt-service-bottom">
                <div className="dt-service-price-block">
                  {pv ? (
                    <>
                      <span className="dt-service-price-old">
                        {formatMoneyCompact(pv.basePrice, businessCurrency)}
                      </span>
                      <span className="dt-service-price">
                        {formatMoneyCompact(pv.salePrice, businessCurrency)}
                      </span>
                      <span className="dt-service-pct">−{pv.percentOff}%</span>
                    </>
                  ) : (
                    <span className="dt-service-price">
                      {formatMoneyCompact(service.price, businessCurrency)}
                    </span>
                  )}
                </div>
                <span className="dt-service-duration">
                  <HiOutlineClock size={14} /> {service.duration} min
                </span>
                <label className="dp-toggle sm">
                  <input
                    type="checkbox"
                    checked={service.isActive}
                    onChange={() => toggleActive(service)}
                  />
                  <span className="dp-toggle-slider" />
                </label>
              </div>
              {pv ? (
                <div className="dt-service-promo-dates">
                  Sale {pv.validFrom} → {pv.validTo}
                </div>
              ) : null}
            </div>
          );
        })}

            <button type="button" className="dt-add-card" onClick={openNew}>
              <HiOutlinePlus size={24} />
              <span>Add New Service</span>
            </button>
          </>
        )}
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
          >
            <div className="dt-modal-header">
              <h2>{editingService ? "Edit Service" : "Add New Service"}</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => setModalOpen(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <div className="dp-field">
                <label>Service Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Haircut"
                />
              </div>
              <div className="dt-modal-row">
                <div className="dp-field">
                  <label>Price ({businessCurrency})</label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => {
                      const price = e.target.value;
                      setForm((prev) => {
                        const next = { ...prev, price };
                        if (!prev.promoEnabled) return next;
                        let salePrice = syncSaleFromPercent(
                          price,
                          prev.promoPercent,
                        );
                        const b = Number(price);
                        const s = Number(salePrice);
                        if (
                          Number.isFinite(b) &&
                          b > 0 &&
                          salePrice !== "" &&
                          Number.isFinite(s) &&
                          s >= b
                        ) {
                          salePrice = String(maxSaleForBase(b));
                        }
                        next.salePrice = salePrice;
                        next.promoPercent = syncPercentFromSale(
                          price,
                          salePrice,
                        );
                        return next;
                      });
                    }}
                    placeholder="0"
                  />
                </div>
                <div className="dp-field">
                  <label>Duration (min)</label>
                  <input
                    type="number"
                    value={form.duration}
                    onChange={(e) =>
                      setForm({ ...form, duration: e.target.value })
                    }
                    placeholder="30"
                  />
                </div>
              </div>
              <div className="dp-field">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Brief description..."
                  rows="3"
                />
              </div>

              <div className="dt-promo-section">
                <label className="dt-promo-toggle-row">
                  <span className="dt-promo-toggle-label">
                    Limited-time sale
                  </span>
                  <span className="dp-toggle sm dt-promo-toggle-switch">
                    <input
                      type="checkbox"
                      checked={form.promoEnabled}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          promoEnabled: on,
                          salePrice: on
                            ? syncSaleFromPercent(
                                prev.price,
                                prev.promoPercent,
                              )
                            : "",
                        }));
                      }}
                    />
                    <span className="dp-toggle-slider" />
                  </span>
                </label>
                {form.promoEnabled ? (
                  <div className="dt-promo-fields">
                    <div className="dt-modal-row">
                      <div className="dp-field">
                        <label>Sale price ({businessCurrency})</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          max={
                            maxSaleForBase(form.price) != null
                              ? maxSaleForBase(form.price)
                              : undefined
                          }
                          className={
                            promoSaleError ? "dp-input--error" : undefined
                          }
                          aria-invalid={!!promoSaleError}
                          value={form.salePrice}
                          onChange={(e) => {
                            const raw = sanitizeDecimalInput(e.target.value, 2);
                            const base = Number(form.price);
                            const cap = maxSaleForBase(form.price);
                            if (raw === "" || raw === "." || raw === "-") {
                              setForm((prev) => ({
                                ...prev,
                                salePrice: raw,
                                promoPercent: "",
                              }));
                              return;
                            }
                            const n = Number(raw);
                            if (!Number.isFinite(n)) return;
                            let next = raw;
                            if (
                              Number.isFinite(base) &&
                              base > 0 &&
                              n >= base &&
                              cap != null
                            ) {
                              next = String(cap);
                            }
                            setForm((prev) => ({
                              ...prev,
                              salePrice: next,
                              promoPercent: syncPercentFromSale(
                                prev.price,
                                next,
                              ),
                            }));
                          }}
                          onBlur={() => {
                            const raw = String(form.salePrice ?? "").trim();
                            if (raw === "" || raw === "." || raw === "-") return;
                            const n = Number(raw);
                            if (!Number.isFinite(n)) return;
                            const base = Number(form.price);
                            const cap = maxSaleForBase(form.price);
                            let v = round2(n);
                            if (
                              Number.isFinite(base) &&
                              base > 0 &&
                              cap != null &&
                              v >= base
                            ) {
                              v = cap;
                            }
                            const normalized = String(v);
                            setForm((prev) => ({
                              ...prev,
                              salePrice: normalized,
                              promoPercent: syncPercentFromSale(
                                prev.price,
                                normalized,
                              ),
                            }));
                          }}
                          placeholder="0"
                        />
                        {promoSaleError ? (
                          <span className="dp-field-error" role="alert">
                            {promoSaleError}
                          </span>
                        ) : maxSaleHint ? (
                          <span className="dp-field-hint">{maxSaleHint}</span>
                        ) : null}
                      </div>
                      <div className="dp-field">
                        <label>Discount (%)</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={form.promoPercent}
                          onChange={(e) => {
                            const promoPercent = e.target.value;
                            setForm((prev) => ({
                              ...prev,
                              promoPercent,
                              salePrice: syncSaleFromPercent(
                                prev.price,
                                promoPercent,
                              ),
                            }));
                          }}
                        />
                      </div>
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
                              prev.validTo && ymd > prev.validTo
                                ? ymd
                                : prev.validTo,
                          }))
                        }
                        maxYmd={form.validTo || undefined}
                      />
                      <YmdDatePickerField
                        label="Until"
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
                    <p className="dt-promo-hint">
                      The discounted price applies to bookings whose appointment
                      date falls in this range (inclusive).
                    </p>
                  </div>
                ) : null}
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
                disabled={
                  !form.name ||
                  !form.price ||
                  !form.duration ||
                  (form.promoEnabled && !!promoSaleError)
                }
              >
                {editingService ? "Save Changes" : "Add Service"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModalOpen && (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !bulkSubmitting && setBulkModalOpen(false)}
        >
          <div className="dt-modal dt-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-header">
              <h2>Sale on all services</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !bulkSubmitting && setBulkModalOpen(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="dt-promo-hint" style={{ marginTop: 0 }}>
                We&apos;ll apply the same percent off to each service&apos;s
                current price for the dates you pick.
              </p>
              <div className="dp-field">
                <label>Percent off</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={bulkForm.percentOff}
                  onChange={(e) =>
                    setBulkForm({ ...bulkForm, percentOff: e.target.value })
                  }
                />
              </div>
              <div className="dt-modal-row dt-modal-row--promo-dates">
                <YmdDatePickerField
                  label="From"
                  value={bulkForm.validFrom}
                  onChange={(ymd) =>
                    setBulkForm((prev) => ({
                      ...prev,
                      validFrom: ymd,
                      validTo:
                        prev.validTo && ymd > prev.validTo ? ymd : prev.validTo,
                    }))
                  }
                  maxYmd={bulkForm.validTo || undefined}
                />
                <YmdDatePickerField
                  label="Until"
                  value={bulkForm.validTo}
                  onChange={(ymd) =>
                    setBulkForm((prev) => ({
                      ...prev,
                      validTo: ymd,
                      validFrom:
                        prev.validFrom && ymd < prev.validFrom
                          ? ymd
                          : prev.validFrom,
                    }))
                  }
                  minYmd={bulkForm.validFrom || undefined}
                  popoverAlign="end"
                />
              </div>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn cancel"
                onClick={() => setBulkModalOpen(false)}
                disabled={bulkSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-save-btn"
                onClick={handleBulkApply}
                disabled={bulkSubmitting}
              >
                {bulkSubmitting ? "Applying…" : "Apply to all"}
              </button>
            </div>
          </div>
        </div>
      )}

      {clearPromoModalOpen && (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !bulkSubmitting && setClearPromoModalOpen(false)}
        >
          <div
            className="dt-modal mb-delete-modal dt-clear-promo-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dt-clear-promo-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dt-clear-promo-title">Clear all sales?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !bulkSubmitting && setClearPromoModalOpen(false)}
                aria-label="Close"
                disabled={bulkSubmitting}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <div className="dt-clear-promo-modal-icon" aria-hidden>
                <HiOutlineTag size={26} />
              </div>
              <p className="mb-delete-modal-text">
                This removes every limited-time sale from your services. List
                prices stay the same — only the discount window and sale price
                are cleared.
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn cancel"
                onClick={() => setClearPromoModalOpen(false)}
                disabled={bulkSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-delete-modal-confirm"
                onClick={performBulkClear}
                disabled={bulkSubmitting}
              >
                {bulkSubmitting ? "Removing…" : "Remove all sales"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesManagement;
