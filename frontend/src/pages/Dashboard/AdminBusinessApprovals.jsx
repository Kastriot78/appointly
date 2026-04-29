import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Navigate, useOutletContext } from "react-router-dom";
import {
  HiOutlineShieldCheck,
  HiOutlineXCircle,
  HiOutlineEye,
  HiOutlineSearch,
} from "react-icons/hi";
import { useToast } from "../../components/ToastContext";
import { getApiErrorMessage } from "../../api/auth";
import {
  listBusinesses,
  setBusinessApproval,
  getBusiness,
  listServices,
  listStaff,
} from "../../api/businesses";
import { isAdminRole } from "../../utils/roles";
import { resolveMediaUrl } from "../../utils/assets";
import { useCategories } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import { DashboardSkeletonTable } from "../../components/DashboardPageSkeleton";
import "./dashboard-pages.css";

const PLACEHOLDER_COVER =
  "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #a5b4fc 100%)";
const PLACEHOLDER_LOGO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88' viewBox='0 0 88 88'><rect fill='%23e2e8f0' width='88' height='88' rx='16'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-size='32' fill='%2394a3b8'>B</text></svg>";

function notifyPendingCountChanged() {
  window.dispatchEvent(new CustomEvent("appointly:pending-count-changed"));
}

function formatOwnerDisplay(owner) {
  if (owner == null) return "—";
  if (typeof owner === "string") return "—";
  if (typeof owner === "object") {
    const name = typeof owner.name === "string" ? owner.name.trim() : "";
    if (name) return name;
    const email = typeof owner.email === "string" ? owner.email.trim() : "";
    if (email) return email;
    return "—";
  }
  return "—";
}

function formatOwnerDetail(owner) {
  if (owner == null) return "—";
  if (typeof owner === "string") return "—";
  if (typeof owner === "object") {
    const name = typeof owner.name === "string" ? owner.name.trim() : "";
    const email = typeof owner.email === "string" ? owner.email.trim() : "";
    if (name && email) return `${name} · ${email}`;
    if (name) return name;
    if (email) return email;
    return "—";
  }
  return "—";
}

function BusinessDetailModal({ business, onClose, actingId, onApproveChange }) {
  const { categories } = useCategories();
  const { locations } = useLocations();

  const categoryName = useMemo(() => {
    const slug = business?.category;
    if (!slug) return "—";
    const c = categories.find((x) => x.slug === slug);
    return c?.name || slug;
  }, [business?.category, categories]);

  const locationName = useMemo(() => {
    const ref = business?.location;
    if (ref == null || ref === "") return "—";
    const s = String(ref).trim();
    const loc = locations.find((l) => l.id === s);
    return loc?.name || s;
  }, [business?.location, locations]);

  if (!business) return null;

  const coverSrc = resolveMediaUrl(business.cover) || null;
  const logoSrc = resolveMediaUrl(business.logo) || null;
  const pending = business.isApproved === false;
  const owner = business.owner;
  const rules = business.bookingRules || {};
  const hours = Array.isArray(business.workingHours)
    ? business.workingHours
    : [];
  const services = Array.isArray(business.services) ? business.services : [];
  const staff = Array.isArray(business.staff) ? business.staff : [];
  const gallery = Array.isArray(business.gallery) ? business.gallery : [];

  return createPortal(
    <div
      className="dt-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="dt-modal aba-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aba-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aba-detail-cover">
          {coverSrc ? (
            <img src={coverSrc} alt="" />
          ) : (
            <div
              className="aba-detail-cover-placeholder"
              style={{ background: PLACEHOLDER_COVER }}
            />
          )}
        </div>

        <div className="aba-detail-head">
          <img
            className="aba-detail-logo"
            src={logoSrc || PLACEHOLDER_LOGO}
            alt=""
          />
          <div className="aba-detail-head-text">
            <h2 id="aba-detail-title" className="aba-detail-title">
              {business.name}
            </h2>
            <p className="aba-detail-meta">
              <code className="ac-slug">{business.slug}</code>
              {pending ? (
                <span className="aba-status aba-status--pending">Pending</span>
              ) : (
                <span className="aba-status aba-status--live">Live</span>
              )}
            </p>
          </div>
        </div>

        <div className="aba-detail-body">
          <div className="aba-detail-section">
            <h3 className="aba-detail-section-title">Owner</h3>
            <p className="aba-detail-p">{formatOwnerDetail(owner)}</p>
          </div>

          {business.description ? (
            <div className="aba-detail-section">
              <h3 className="aba-detail-section-title">Description</h3>
              <p className="aba-detail-p aba-detail-desc">{business.description}</p>
            </div>
          ) : null}

          <div className="aba-detail-grid">
            <div className="aba-detail-section">
              <h3 className="aba-detail-section-title">Category</h3>
              <p className="aba-detail-p">{categoryName}</p>
            </div>
            <div className="aba-detail-section">
              <h3 className="aba-detail-section-title">Listing</h3>
              <p className="aba-detail-p">
                {business.isActive !== false ? "Active" : "Inactive"}
              </p>
            </div>
          </div>

          <div className="aba-detail-grid">
            <div className="aba-detail-section">
              <h3 className="aba-detail-section-title">Phone</h3>
              <p className="aba-detail-p">{business.phone || "—"}</p>
            </div>
            <div className="aba-detail-section">
              <h3 className="aba-detail-section-title">Email</h3>
              <p className="aba-detail-p">{business.email?.trim() || "—"}</p>
            </div>
          </div>

          <div className="aba-detail-section">
            <h3 className="aba-detail-section-title">Address &amp; area</h3>
            <p className="aba-detail-p">
              {[business.address, business.area, locationName]
                .filter((x) => x && String(x).trim())
                .join(" · ") || "—"}
            </p>
          </div>

          {hours.length > 0 ? (
            <div className="aba-detail-section">
              <h3 className="aba-detail-section-title">Working hours</h3>
              <ul className="aba-detail-hours">
                {hours.map((h, i) => (
                  <li key={`${h.day}-${i}`}>
                    <strong>{h.day}</strong>
                    {h.active === false
                      ? " — closed"
                      : ` — ${h.open || "—"}–${h.close || "—"}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="aba-detail-section">
            <h3 className="aba-detail-section-title">Services</h3>
            {services.length > 0 ? (
              <ul className="aba-detail-hours">
                {services.map((s) => (
                  <li key={s.id || s._id || s.name}>
                    <strong>{s.name || "Service"}</strong>
                    {s.price != null ? ` — €${Number(s.price).toFixed(0)}` : ""}
                    {s.duration ? ` · ${s.duration} min` : ""}
                    {s.isActive === false ? " · inactive" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="aba-detail-p">—</p>
            )}
          </div>

          <div className="aba-detail-section">
            <h3 className="aba-detail-section-title">Staff</h3>
            {staff.length > 0 ? (
              <ul className="aba-detail-hours">
                {staff.map((m) => (
                  <li key={m.id || m._id || m.name}>
                    <strong>{m.name || "Staff member"}</strong>
                    {m.role ? ` — ${m.role}` : ""}
                    {Array.isArray(m.services) ? ` · ${m.services.length} services` : ""}
                    {m.isActive === false ? " · inactive" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="aba-detail-p">—</p>
            )}
          </div>

          <div className="aba-detail-section">
            <h3 className="aba-detail-section-title">Gallery</h3>
            {gallery.length > 0 ? (
              <div className="aba-gallery-grid">
                {gallery.map((g, i) => {
                  const src = resolveMediaUrl(typeof g === "string" ? g : g?.url);
                  if (!src) return null;
                  return (
                    <img
                      key={`${src}-${i}`}
                      className="aba-gallery-thumb"
                      src={src}
                      alt={typeof g === "object" && g?.caption ? g.caption : ""}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="aba-detail-p">—</p>
            )}
          </div>

          <div className="aba-detail-section">
            <h3 className="aba-detail-section-title">Booking rules</h3>
            <p className="aba-detail-p">
              Min. {rules.minAdvanceHours ?? "—"}h ahead · Max.{" "}
              {rules.maxAdvanceDays ?? "—"} days ·{" "}
              {rules.autoConfirm !== false ? "Auto-confirm on" : "Auto-confirm off"}
            </p>
          </div>

          {business.createdAt ? (
            <p className="aba-detail-muted">
              Created{" "}
              {new Date(business.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </div>

        <div className="dt-modal-footer aba-detail-footer">
          <button
            type="button"
            className="dp-btn-ghost"
            onClick={onClose}
          >
            Close
          </button>
          {pending ? (
            <button
              type="button"
              className="dp-btn-primary"
              disabled={actingId === business.id}
              onClick={() => onApproveChange(business.id, true)}
            >
              <HiOutlineShieldCheck size={18} style={{ marginRight: 6 }} />
              {actingId === business.id ? "…" : "Approve"}
            </button>
          ) : (
            <button
              type="button"
              className="dp-btn-ghost"
              disabled={actingId === business.id}
              onClick={() => onApproveChange(business.id, false)}
            >
              <HiOutlineXCircle size={18} style={{ marginRight: 6 }} />
              {actingId === business.id ? "…" : "Remove approval"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const AdminBusinessApprovals = () => {
  const { user } = useOutletContext();
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [detailBusiness, setDetailBusiness] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const openBusinessDetails = async (b) => {
    setDetailBusiness(b);
    try {
      const [bizRes, servicesRes, staffRes] = await Promise.all([
        getBusiness(b.id),
        listServices(b.id),
        listStaff(b.id),
      ]);
      const fullBusiness = bizRes?.data?.business || {};
      const services = Array.isArray(servicesRes?.data?.services)
        ? servicesRes.data.services
        : [];
      const staff = Array.isArray(staffRes?.data?.staff) ? staffRes.data.staff : [];
      setDetailBusiness((prev) => {
        if (!prev || prev.id !== b.id) return prev;
        return {
          ...prev,
          ...fullBusiness,
          id: fullBusiness.id || prev.id,
          services,
          staff,
          gallery: Array.isArray(fullBusiness.gallery)
            ? fullBusiness.gallery
            : Array.isArray(prev.gallery)
              ? prev.gallery
              : [],
        };
      });
    } catch {
      // keep base modal data visible even if enriched fetch fails
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await listBusinesses({ populateOwner: "1" });
      const list = Array.isArray(data.businesses) ? data.businesses : [];
      setBusinesses(list);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (!detailBusiness) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDetailBusiness(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [detailBusiness]);

  const sorted = useMemo(() => {
    return [...businesses].sort((a, b) => {
      const pa = a.isApproved === false ? 0 : 1;
      const pb = b.isApproved === false ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [businesses]);

  const filteredBusinesses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((b) => {
      const businessName = String(b.name || "").toLowerCase();
      const ownerName = formatOwnerDisplay(b.owner).toLowerCase();
      return businessName.includes(q) || ownerName.includes(q);
    });
  }, [sorted, searchQuery]);

  const setApproval = async (id, approved) => {
    setActingId(id);
    try {
      const { data } = await setBusinessApproval(id, approved);
      const next = data?.business;
      if (next?.id) {
        setBusinesses((prev) =>
          prev.map((b) =>
            b.id === next.id ? { ...b, isApproved: next.isApproved } : b,
          ),
        );
        setDetailBusiness((prev) =>
          prev && prev.id === next.id
            ? { ...prev, isApproved: next.isApproved }
            : prev,
        );
      } else {
        await load();
      }
      showToast(
        approved
          ? "Business approved — visible on Find & Book."
          : "Approval removed — hidden from Find & Book.",
        "success",
      );
      notifyPendingCountChanged();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setActingId(null);
    }
  };

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page">
      {detailBusiness ? (
        <BusinessDetailModal
          business={detailBusiness}
          onClose={() => setDetailBusiness(null)}
          actingId={actingId}
          onApproveChange={setApproval}
        />
      ) : null}

      <div className="dp-header dp-header--row">
        <div>
          <h1 className="dp-title">Business approvals</h1>
          <p className="dp-subtitle">
            New businesses stay private until you approve them. Approved
            businesses appear on Find &amp; Book; you can remove approval at
            any time.
          </p>
        </div>
      </div>

      <div className="ac-table-wrap">
        <div className="ac-search-row">
          <div className="dp-bookings-search ac-search-input">
            <HiOutlineSearch size={18} aria-hidden />
            <input
              type="search"
              className="form-control dp-bookings-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search business or owner"
              aria-label="Search business approvals by business or owner"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        {loading ? (
          <DashboardSkeletonTable cols={6} rows={6} />
        ) : sorted.length === 0 ? (
          <p className="ac-muted">No businesses yet.</p>
        ) : filteredBusinesses.length === 0 ? (
          <p className="ac-muted text-center">No businesses match your search.</p>
        ) : (
          <table className="ac-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredBusinesses.map((b) => {
                const pending = b.isApproved === false;
                const ownerLabel = formatOwnerDisplay(b.owner);
                return (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                    </td>
                    <td className="ac-muted">{ownerLabel}</td>
                    <td>
                      <code className="ac-slug">{b.slug}</code>
                    </td>
                    <td>
                      {pending ? (
                        <span className="aba-status aba-status--pending">
                          Pending
                        </span>
                      ) : (
                        <span className="aba-status aba-status--live">
                          Live
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="aba-detail-link"
                        onClick={() => openBusinessDetails(b)}
                      >
                        <HiOutlineEye size={16} aria-hidden />
                        More details
                      </button>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {pending ? (
                        <button
                          type="button"
                          className="dp-btn-primary"
                          style={{ padding: "6px 12px", fontSize: 13 }}
                          disabled={actingId === b.id}
                          onClick={() => setApproval(b.id, true)}
                        >
                          <HiOutlineShieldCheck
                            size={16}
                            style={{ marginRight: 6, verticalAlign: "middle" }}
                          />
                          {actingId === b.id ? "…" : "Approve"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="dp-btn-ghost"
                          style={{ padding: "6px 12px", fontSize: 13 }}
                          disabled={actingId === b.id}
                          onClick={() => setApproval(b.id, false)}
                        >
                          <HiOutlineXCircle
                            size={16}
                            style={{ marginRight: 6, verticalAlign: "middle" }}
                          />
                          {actingId === b.id ? "…" : "Remove approval"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminBusinessApprovals;
