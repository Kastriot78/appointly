import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  useParams,
  useNavigate,
  Navigate,
  useOutletContext,
  Link,
} from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlinePhotograph,
  HiCheck,
  HiOutlineTrash,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlinePlus,
  HiOutlineDuplicate,
} from "react-icons/hi";
import { ICON_KEY_EMOJI } from "../../utils/categoryIcons";
import CustomSelect from "../../utils/CustomSelect";
import PhoneField from "../../components/PhoneField";
import { useCategories } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import {
  getBusiness,
  updateBusiness,
  uploadBusinessImage,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import { resolveMediaUrl } from "../../utils/assets";
import { canAccessMyBusinessesNav } from "../../utils/roles";
import { DashboardPageSkeletonDefault } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import BusinessMapPicker from "../../components/BusinessMapPicker";
import { CURRENCY_OPTIONS, normalizeCurrency } from "../../utils/currency";
import {
  getPublicAppOrigin,
  getPublicBookingPageUrl,
} from "../../utils/publicAppUrl";
import {
  DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
  MAX_BOOKING_ADVANCE_DAYS,
} from "../../utils/bookingRulesLimits";
import "./dashboard-pages.css";

/** Must match backend `bookingRules.timeOfferStepMinutes` enum. */
const TIME_OFFER_STEP_ALLOWED = [5, 10, 15, 30, 45, 60, 90];

const TIME_OFFER_STEP_OPTIONS = [
  { value: 5, label: "Every 5 minutes" },
  { value: 10, label: "Every 10 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 45, label: "Every 45 minutes" },
  { value: 60, label: "Every 1 hour" },
  { value: 90, label: "Every 1 hour 30 minutes" },
];

const defaultHoursSeed = [
  { day: "Monday", open: "09:00", close: "18:00", active: true },
  { day: "Tuesday", open: "09:00", close: "18:00", active: true },
  { day: "Wednesday", open: "09:00", close: "18:00", active: true },
  { day: "Thursday", open: "09:00", close: "18:00", active: true },
  { day: "Friday", open: "09:00", close: "18:00", active: true },
  { day: "Saturday", open: "09:00", close: "14:00", active: true },
  { day: "Sunday", open: "", close: "", active: false },
];

const BusinessEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();

  /** Mirror the sidebar workspace switcher on the edit page too. */
  useEffect(() => {
    if (!activeWorkspaceId || !id) return;
    if (String(activeWorkspaceId) === String(id)) return;
    navigate(`/dashboard/businesses/${activeWorkspaceId}/edit`, {
      replace: true,
    });
  }, [activeWorkspaceId, id, navigate]);
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const { categories: apiCategories } = useCategories();
  const { locations: apiLocations } = useLocations();

  const categoryOptions = useMemo(
    () =>
      apiCategories.map((c) => ({
        value: c.slug,
        label: c.name,
        iconKey: c.iconKey,
      })),
    [apiCategories],
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [logoPath, setLogoPath] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [logoPreviewBlob, setLogoPreviewBlob] = useState(null);
  const [coverPreviewBlob, setCoverPreviewBlob] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState("info");
  const [saved, setSaved] = useState(false);

  const [info, setInfo] = useState({
    name: "",
    category: "",
    phone: "",
    email: "",
    address: "",
    location: "",
    description: "",
    currency: "EUR",
  });

  const locationSelectOptions = useMemo(() => {
    const opts = apiLocations.map((loc) => ({
      value: loc.id,
      label: loc.name,
    }));
    const cur = (info.location || "").trim();
    if (cur && !opts.some((o) => o.value === cur)) {
      opts.push({ value: cur, label: cur });
    }
    return opts;
  }, [apiLocations, info.location]);

  /** Public booking URL slug — used for “Book with me” share links. */
  const [publicSlug, setPublicSlug] = useState("");

  const bookUrl = useMemo(
    () => getPublicBookingPageUrl(publicSlug),
    [publicSlug],
  );

  const captionBio = useMemo(() => {
    if (!bookUrl) return "";
    return `Book with me 👇\n${bookUrl}`;
  }, [bookUrl]);

  const captionPost = useMemo(() => {
    if (!bookUrl) return "";
    const name = (info.name || "").trim() || "us";
    return `Book ${name} online — tap the link below.\n${bookUrl}`;
  }, [bookUrl, info.name]);

  const shareOriginHint = useMemo(() => {
    const o = getPublicAppOrigin();
    if (!o) return "";
    if (typeof window !== "undefined" && window.location?.origin === o) {
      return "This link uses your current browser origin. If customers use a different domain in production, set VITE_PUBLIC_APP_URL when you build the app.";
    }
    return "This link uses VITE_PUBLIC_APP_URL from your environment.";
  }, []);

  const copyToClipboard = useCallback(
    async (text, message = "Copied.") => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast(message, "success");
      } catch {
        showToast("Could not copy. Try selecting the text manually.", "error");
      }
    },
    [showToast],
  );

  const [hours, setHours] = useState(defaultHoursSeed);
  const [reviewRequests, setReviewRequests] = useState({
    enabled: true,
    delayHours: 2,
  });
  const [reminders, setReminders] = useState({
    enabled: true,
    before24h: true,
    before2h: true,
  });
  const [bookingRules, setBookingRules] = useState({
    maxAdvanceDays: DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
    minAdvanceHours: 2,
    autoConfirm: true,
    bookingBufferMinutes: 0,
    timeOfferStepMinutes: 5,
  });
  /** @type {[Array<{url: string, caption: string, order: number}>, Function]} */
  const [gallery, setGallery] = useState([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const galleryInputRef = useRef(null);
  const GALLERY_MAX_ITEMS = 60;

  /**
   * Coordinates for the map pin. `null` means the business hasn't been
   * geocoded yet — the map picker will show an empty state with a
   * "Locate from address" button.
   * @type {[{lat: number, lng: number, manuallyPlaced?: boolean} | null, Function]}
   */
  const [coordinates, setCoordinates] = useState(null);

  const [serviceCount, setServiceCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);

  const loadBusiness = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await getBusiness(id);
      const b = data.business;
      setInfo({
        name: b.name || "",
        category: b.category || "",
        phone: b.phone || "",
        email: b.email || "",
        address: b.address || "",
        location: (b.location || "").trim(),
        description: b.description || "",
        currency: normalizeCurrency(b.currency),
      });
      setLogoPath(b.logo || "");
      setCoverPath(b.cover || "");
      setHours(
        Array.isArray(b.workingHours) && b.workingHours.length > 0
          ? b.workingHours
          : defaultHoursSeed,
      );
      const rr = b.reviewRequests || {};
      setReviewRequests({
        enabled: rr.enabled !== false,
        delayHours:
          Number.isFinite(Number(rr.delayHours)) && Number(rr.delayHours) >= 1
            ? Math.min(168, Math.max(1, Math.round(Number(rr.delayHours))))
            : 2,
      });
      const rm = b.reminders || {};
      setReminders({
        enabled: rm.enabled !== false,
        before24h: rm.before24h !== false,
        before2h: rm.before2h !== false,
      });
      const br = b.bookingRules || {};
      const rawMax = Number(br.maxAdvanceDays);
      const maxAdvanceDays =
        Number.isFinite(rawMax) && rawMax >= 1
          ? Math.min(MAX_BOOKING_ADVANCE_DAYS, Math.max(1, Math.round(rawMax)))
          : DEFAULT_MAX_BOOKING_ADVANCE_DAYS;
      const rawMinH = Number(br.minAdvanceHours);
      const rawBuf = Number(br.bookingBufferMinutes);
      const rawOffer = Number(br.timeOfferStepMinutes);
      setBookingRules({
        maxAdvanceDays,
        minAdvanceHours:
          Number.isFinite(rawMinH) && rawMinH >= 0
            ? Math.max(0, Math.round(rawMinH))
            : 2,
        autoConfirm: br.autoConfirm !== false,
        bookingBufferMinutes:
          Number.isFinite(rawBuf) && rawBuf >= 0
            ? Math.min(60, Math.round(rawBuf))
            : 0,
        timeOfferStepMinutes: TIME_OFFER_STEP_ALLOWED.includes(rawOffer)
          ? rawOffer
          : 5,
      });
      setGallery(
        Array.isArray(b.gallery)
          ? b.gallery
              .slice()
              .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
              .map((g, i) => ({
                url: String(g.url || ""),
                caption: String(g.caption || ""),
                order: i,
              }))
              .filter((g) => g.url)
          : [],
      );
      /**
       * Mongoose serializes unset subdoc fields as `null`. `Number(null)` is
       * `0`, which would slip past `Number.isFinite` and render a bogus pin
       * at (0,0) — guard against that by checking for null/undefined first.
       */
      const coords = b.coordinates;
      const hasValidCoords =
        coords &&
        coords.lat != null &&
        coords.lng != null &&
        Number.isFinite(Number(coords.lat)) &&
        Number.isFinite(Number(coords.lng));
      setCoordinates(
        hasValidCoords
          ? {
              lat: Number(coords.lat),
              lng: Number(coords.lng),
              manuallyPlaced: coords.manuallyPlaced === true,
            }
          : null,
      );
      setServiceCount(b.serviceCount ?? 0);
      setStaffCount(b.staffCount ?? 0);
      setPublicSlug(
        String(b.slug || "")
          .trim()
          .toLowerCase(),
      );
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBusiness();
  }, [loadBusiness]);

  const handleLogoPick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (logoPreviewBlob) URL.revokeObjectURL(logoPreviewBlob);
    setLogoPreviewBlob(URL.createObjectURL(f));
    setLogoFile(f);
  };

  const handleCoverPick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (coverPreviewBlob) URL.revokeObjectURL(coverPreviewBlob);
    setCoverPreviewBlob(URL.createObjectURL(f));
    setCoverFile(f);
  };

  /**
   * Upload gallery images. Each file uploads to the generic business-image
   * endpoint (returns a stored URL), and the resulting URLs are appended to
   * local gallery state. The tenant still has to hit "Save Changes" for the
   * new list to persist on the business document.
   */
  const handleGalleryPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = Math.max(0, GALLERY_MAX_ITEMS - gallery.length);
    if (remaining === 0) {
      showToast(`Gallery is full (max ${GALLERY_MAX_ITEMS} images).`, "error");
      return;
    }
    const toUpload = files
      .filter((f) => f && f.type && f.type.startsWith("image/"))
      .slice(0, remaining);
    if (toUpload.length === 0) return;

    setGalleryUploading(true);
    try {
      const uploaded = [];
      for (const f of toUpload) {
        try {
          const { data } = await uploadBusinessImage(f);
          if (data?.url) uploaded.push({ url: data.url, caption: "" });
        } catch (err) {
          showToast(getApiErrorMessage(err), "error");
        }
      }
      if (uploaded.length > 0) {
        setGallery((prev) => {
          const combined = [...prev, ...uploaded];
          return combined.map((g, i) => ({ ...g, order: i }));
        });
      }
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleGalleryRemove = (idx) => {
    setGallery((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((g, i) => ({ ...g, order: i }));
    });
  };

  const handleGalleryMove = (idx, direction) => {
    setGallery((prev) => {
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next.map((g, i) => ({ ...g, order: i }));
    });
  };

  const handleGalleryCaption = (idx, caption) => {
    setGallery((prev) =>
      prev.map((g, i) =>
        i === idx ? { ...g, caption: caption.slice(0, 200) } : g,
      ),
    );
  };

  const handleSave = async () => {
    if (saving) return;
    if (!info.location.trim()) {
      showToast("City / location is required.", "error");
      return;
    }
    setSaving(true);
    try {
      let logo = logoPath;
      let cover = coverPath;
      if (logoFile) {
        const { data } = await uploadBusinessImage(logoFile);
        logo = data.url;
      }
      if (coverFile) {
        const { data } = await uploadBusinessImage(coverFile);
        cover = data.url;
      }
      const { data } = await updateBusiness(id, {
        name: info.name.trim(),
        category: info.category,
        phone: info.phone.trim(),
        email: info.email.trim(),
        address: info.address.trim(),
        location: info.location.trim(),
        description: info.description.trim(),
        currency: normalizeCurrency(info.currency),
        logo,
        cover,
        workingHours: hours.map(({ day, open, close, active }) => ({
          day,
          open,
          close,
          active,
        })),
        reviewRequests: {
          enabled: reviewRequests.enabled !== false,
          delayHours: Math.min(
            168,
            Math.max(1, Math.round(Number(reviewRequests.delayHours) || 2)),
          ),
        },
        reminders: {
          enabled: reminders.enabled !== false,
          before24h: reminders.before24h !== false,
          before2h: reminders.before2h !== false,
        },
        bookingRules: {
          maxAdvanceDays: Math.min(
            MAX_BOOKING_ADVANCE_DAYS,
            Math.max(
              1,
              Math.round(Number(bookingRules.maxAdvanceDays)) ||
                DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
            ),
          ),
          minAdvanceHours: Math.max(
            0,
            Math.round(Number(bookingRules.minAdvanceHours)) || 2,
          ),
          autoConfirm: bookingRules.autoConfirm !== false,
          bookingBufferMinutes: Math.min(
            60,
            Math.max(
              0,
              Math.round(Number(bookingRules.bookingBufferMinutes)) || 0,
            ),
          ),
          timeOfferStepMinutes: TIME_OFFER_STEP_ALLOWED.includes(
            Number(bookingRules.timeOfferStepMinutes),
          )
            ? Number(bookingRules.timeOfferStepMinutes)
            : 5,
        },
        gallery: gallery.map((g, i) => ({
          url: g.url,
          caption: (g.caption || "").trim().slice(0, 200),
          order: i,
        })),
        coordinates:
          coordinates &&
          Number.isFinite(coordinates.lat) &&
          Number.isFinite(coordinates.lng)
            ? {
                lat: coordinates.lat,
                lng: coordinates.lng,
                manuallyPlaced: coordinates.manuallyPlaced === true,
              }
            : null,
      });
      const b = data.business;
      setLogoPath(b.logo || "");
      setCoverPath(b.cover || "");
      setGallery(
        Array.isArray(b.gallery)
          ? b.gallery
              .slice()
              .sort((a, c) => (a?.order ?? 0) - (c?.order ?? 0))
              .map((g, i) => ({
                url: String(g.url || ""),
                caption: String(g.caption || ""),
                order: i,
              }))
              .filter((g) => g.url)
          : [],
      );
      const coords = b.coordinates;
      const hasValidCoords =
        coords &&
        coords.lat != null &&
        coords.lng != null &&
        Number.isFinite(Number(coords.lat)) &&
        Number.isFinite(Number(coords.lng));
      setCoordinates(
        hasValidCoords
          ? {
              lat: Number(coords.lat),
              lng: Number(coords.lng),
              manuallyPlaced: coords.manuallyPlaced === true,
            }
          : null,
      );
      setServiceCount(b.serviceCount ?? 0);
      setStaffCount(b.staffCount ?? 0);
      setPublicSlug(
        String(b.slug || "")
          .trim()
          .toLowerCase(),
      );
      const brSaved = b.bookingRules || {};
      const rawMaxSaved = Number(brSaved.maxAdvanceDays);
      const rawBufSaved = Number(brSaved.bookingBufferMinutes);
      const rawOfferSaved = Number(brSaved.timeOfferStepMinutes);
      setBookingRules({
        maxAdvanceDays:
          Number.isFinite(rawMaxSaved) && rawMaxSaved >= 1
            ? Math.min(
                MAX_BOOKING_ADVANCE_DAYS,
                Math.max(1, Math.round(rawMaxSaved)),
              )
            : DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
        minAdvanceHours: Math.max(
          0,
          Math.round(Number(brSaved.minAdvanceHours)) || 2,
        ),
        autoConfirm: brSaved.autoConfirm !== false,
        bookingBufferMinutes:
          Number.isFinite(rawBufSaved) && rawBufSaved >= 0
            ? Math.min(60, Math.round(rawBufSaved))
            : 0,
        timeOfferStepMinutes: TIME_OFFER_STEP_ALLOWED.includes(rawOfferSaved)
          ? rawOfferSaved
          : 5,
      });
      setLogoFile(null);
      setCoverFile(null);
      if (logoPreviewBlob) URL.revokeObjectURL(logoPreviewBlob);
      if (coverPreviewBlob) URL.revokeObjectURL(coverPreviewBlob);
      setLogoPreviewBlob(null);
      setCoverPreviewBlob(null);
      showToast("Business updated.", "success");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (user && !canAccessMyBusinessesNav(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="be-page">
        <DashboardPageSkeletonDefault rows={5} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="be-page">
        <button
          type="button"
          className="be-back"
          onClick={() => navigate("/dashboard/businesses")}
        >
          <HiOutlineArrowLeft size={18} />
          Back to Businesses
        </button>
        <DashboardErrorPanel message={loadError} onRetry={loadBusiness} />
      </div>
    );
  }

  const logoSrc =
    logoPreviewBlob || (logoPath ? resolveMediaUrl(logoPath) : "");
  const coverSrc =
    coverPreviewBlob || (coverPath ? resolveMediaUrl(coverPath) : "");

  const tabs = [
    { id: "info", label: "Business Info" },
    { id: "hours", label: "Working Hours" },
    { id: "automation", label: "Automation" },
    { id: "gallery", label: `Gallery (${gallery.length})` },
    { id: "services", label: `Services (${serviceCount})` },
    { id: "staff", label: `Staff (${staffCount})` },
    { id: "share", label: "Share" },
  ];

  return (
    <div className="be-page">
      {/* Header */}
      <div className="be-header">
        <button
          className="be-back"
          onClick={() => navigate("/dashboard/businesses")}
        >
          <HiOutlineArrowLeft size={18} />
          Back to Businesses
        </button>
        <div className="be-header-info">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="be-header-logo" />
          ) : (
            <div className="be-header-logo be-header-logo--placeholder" />
          )}
          <div>
            <h1>{info.name}</h1>
            <span className="be-header-cat">
              {(() => {
                const c = categoryOptions.find(
                  (x) => x.value === info.category,
                );
                const emoji = c ? ICON_KEY_EMOJI[c.iconKey] || "🏢" : "🏢";
                return `${emoji} ${c?.label ?? info.category}`;
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="be-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`be-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="be-content">
        {/* Business Info */}
        {activeTab === "info" && (
          <div className="be-section">
            <div className="be-photos-row">
              <div className="be-photo-box">
                <label>Business Logo</label>
                <div className="be-upload">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="be-upload-input"
                    onChange={handleLogoPick}
                  />
                  {logoSrc ? (
                    <img src={logoSrc} alt="" className="be-upload-preview" />
                  ) : (
                    <div className="be-upload-fallback">No logo</div>
                  )}
                  <button
                    type="button"
                    className="be-upload-btn"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <HiOutlinePhotograph size={16} /> Change
                  </button>
                </div>
              </div>
              <div className="be-photo-box">
                <label>Cover Photo</label>
                <div className="be-upload wide">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="be-upload-input"
                    onChange={handleCoverPick}
                  />
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt=""
                      className="be-upload-preview-wide"
                    />
                  ) : (
                    <div className="be-upload-fallback be-upload-fallback--wide">
                      No cover image
                    </div>
                  )}
                  <button
                    type="button"
                    className="be-upload-btn"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <HiOutlinePhotograph size={16} /> Change
                  </button>
                </div>
              </div>
            </div>

            <div className="be-form-grid">
              <div className="be-field">
                <label>Business Name</label>
                <input
                  type="text"
                  value={info.name}
                  onChange={(e) => setInfo({ ...info, name: e.target.value })}
                />
              </div>
              <div className="be-field">
                <label>Category</label>
                <select
                  value={info.category}
                  onChange={(e) =>
                    setInfo({ ...info, category: e.target.value })
                  }
                >
                  {categoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {ICON_KEY_EMOJI[c.iconKey] || "🏢"} {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="be-field">
                <label htmlFor="be-phone">Phone</label>
                <PhoneField
                  id="be-phone"
                  value={info.phone}
                  onChange={(v) => setInfo({ ...info, phone: v })}
                />
              </div>
              <div className="be-field">
                <label>Email</label>
                <input
                  type="email"
                  value={info.email}
                  onChange={(e) => setInfo({ ...info, email: e.target.value })}
                />
              </div>
              <div className="be-field">
                <label>Address</label>
                <input
                  type="text"
                  value={info.address}
                  onChange={(e) =>
                    setInfo({ ...info, address: e.target.value })
                  }
                />
              </div>
              <div className="be-field">
                <label>City / Location *</label>
                <CustomSelect
                  options={locationSelectOptions}
                  value={info.location}
                  onChange={(v) => setInfo({ ...info, location: v })}
                  placeholder="Select city"
                />
              </div>
              <div className="be-field">
                <label>Pricing currency</label>
                <CustomSelect
                  options={CURRENCY_OPTIONS}
                  value={info.currency}
                  onChange={(v) => setInfo({ ...info, currency: v })}
                  placeholder="Currency"
                />
                <p className="be-field-hint" style={{ marginTop: 6 }}>
                  Service prices and booking totals use this currency for your
                  business.
                </p>
              </div>
              <div className="be-field full">
                <label>Description</label>
                <textarea
                  value={info.description}
                  onChange={(e) =>
                    setInfo({ ...info, description: e.target.value })
                  }
                  rows="4"
                />
              </div>
              <div className="be-field full">
                <BusinessMapPicker
                  value={coordinates}
                  onChange={setCoordinates}
                  defaultCity={
                    locationSelectOptions.find((o) => o.value === info.location)
                      ?.label || ""
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Working Hours */}
        {activeTab === "hours" && (
          <div className="be-section">
            <div className="be-hours-list">
              {hours.map((h, i) => (
                <div
                  key={h.day}
                  className={`be-hours-row ${!h.active ? "inactive" : ""}`}
                >
                  <div className="be-day-toggle">
                    <button
                      type="button"
                      className={`hours-toggle-visual ${h.active ? "active" : ""}`}
                      onClick={() => {
                        const u = [...hours];
                        u[i] = { ...u[i], active: !u[i].active };
                        setHours(u);
                      }}
                      aria-pressed={h.active}
                      aria-label={`${h.day}: ${h.active ? "open" : "closed"}`}
                    >
                      {h.active ? (
                        <HiCheck className="hours-toggle-icon" />
                      ) : null}
                    </button>
                    <span className="be-day-name">{h.day}</span>
                  </div>
                  {h.active ? (
                    <div className="be-time-inputs">
                      <input
                        type="time"
                        value={h.open}
                        onChange={(e) => {
                          const u = [...hours];
                          u[i] = { ...u[i], open: e.target.value };
                          setHours(u);
                        }}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={h.close}
                        onChange={(e) => {
                          const u = [...hours];
                          u[i] = { ...u[i], close: e.target.value };
                          setHours(u);
                        }}
                      />
                    </div>
                  ) : (
                    <span className="be-closed">Closed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Automation — review-request emails + reminder sequences */}
        {activeTab === "automation" && (
          <div className="be-section be-automation-stack">
            <div className="be-automation-card">
              <div className="be-automation-head">
                <div>
                  <h3 className="be-automation-title">Online booking window</h3>
                  <p className="be-automation-desc">
                    Controls how far into the future customers can pick a date
                    on your public booking page. Increase this if months ahead
                    look greyed out or you take long-lead appointments.
                  </p>
                </div>
              </div>
              <div className="be-automation-body">
                <div className="be-automation-field">
                  <label htmlFor="be-max-advance-days">
                    How many days ahead can customers book?
                  </label>
                  <div className="be-delay-input">
                    <input
                      id="be-max-advance-days"
                      type="number"
                      min="1"
                      max={MAX_BOOKING_ADVANCE_DAYS}
                      step="1"
                      value={bookingRules.maxAdvanceDays}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBookingRules((r) => ({
                          ...r,
                          maxAdvanceDays: v === "" ? "" : Number(v),
                        }));
                      }}
                      onBlur={() => {
                        setBookingRules((r) => {
                          const n = Number(r.maxAdvanceDays);
                          const clamped =
                            Number.isFinite(n) && n >= 1
                              ? Math.min(
                                  MAX_BOOKING_ADVANCE_DAYS,
                                  Math.max(1, Math.round(n)),
                                )
                              : DEFAULT_MAX_BOOKING_ADVANCE_DAYS;
                          return { ...r, maxAdvanceDays: clamped };
                        });
                      }}
                    />
                    <span className="be-delay-suffix">days</span>
                  </div>
                  <p className="be-automation-hint">
                    The last selectable day is this many calendar days after
                    today (up to {MAX_BOOKING_ADVANCE_DAYS} days / about five
                    years). Example: 60–90 for a few months; 730 for two years.
                  </p>
                </div>
                <div className="be-automation-field">
                  <label>Suggested time spacing (online booking)</label>
                  <div style={{ maxWidth: 400 }}>
                    <CustomSelect
                      options={TIME_OFFER_STEP_OPTIONS}
                      value={bookingRules.timeOfferStepMinutes}
                      onChange={(v) =>
                        setBookingRules((r) => ({
                          ...r,
                          timeOfferStepMinutes: v,
                        }))
                      }
                      placeholder="Select spacing"
                    />
                  </div>
                  <p className="be-automation-hint">
                    How often we list possible start times. Actual openings still
                    follow real gaps between bookings on the calendar.
                  </p>
                </div>
                <div className="be-automation-field">
                  <label htmlFor="be-booking-buffer">
                    Buffer / cleanup after each visit (minutes)
                  </label>
                  <div className="be-delay-input">
                    <input
                      id="be-booking-buffer"
                      type="number"
                      min="0"
                      max="60"
                      step="1"
                      value={bookingRules.bookingBufferMinutes}
                      onChange={(e) =>
                        setBookingRules((r) => ({
                          ...r,
                          bookingBufferMinutes:
                            e.target.value === ""
                              ? ""
                              : Number(e.target.value),
                        }))
                      }
                      onBlur={() => {
                        setBookingRules((r) => {
                          const n = Number(r.bookingBufferMinutes);
                          const v =
                            Number.isFinite(n) && n >= 0
                              ? Math.min(60, Math.round(n))
                              : 0;
                          return { ...r, bookingBufferMinutes: v };
                        });
                      }}
                    />
                    <span className="be-delay-suffix">min</span>
                  </div>
                  <p className="be-automation-hint">
                    <strong>Turnover time.</strong> When suggesting open times,
                    each booking blocks the calendar until its end time plus this
                    many minutes (cleanup, notes, room reset). Example: with 10,
                    the next client cannot start until 10 minutes after the prior
                    visit ends. Use 0 only when back-to-back starts are realistic
                    for your workflow.
                  </p>
                </div>
              </div>
            </div>

            <div className="be-automation-card">
              <div className="be-automation-head">
                <div>
                  <h3 className="be-automation-title">Review request emails</h3>
                  <p className="be-automation-desc">
                    After an appointment ends, Appointly can automatically email
                    the customer and invite them to leave a review on your
                    business page. Customers who have already reviewed you are
                    skipped.
                  </p>
                </div>
                <label
                  className="be-switch"
                  aria-label={
                    reviewRequests.enabled
                      ? "Disable feature"
                      : "Enable feature"
                  }
                >
                  <input
                    type="checkbox"
                    checked={reviewRequests.enabled}
                    onChange={(e) =>
                      setReviewRequests((r) => ({
                        ...r,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                  <span className="be-switch-track">
                    <span className="be-switch-thumb" />
                  </span>
                </label>
              </div>

              <div
                className={`be-automation-body ${
                  reviewRequests.enabled ? "" : "be-automation-body--dim"
                }`}
              >
                <div className="be-automation-field">
                  <label htmlFor="be-review-delay">
                    Send email how many hours after the appointment ends?
                  </label>
                  <div className="be-delay-input">
                    <input
                      id="be-review-delay"
                      type="number"
                      min="1"
                      max="168"
                      step="1"
                      value={reviewRequests.delayHours}
                      disabled={!reviewRequests.enabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        setReviewRequests((r) => ({
                          ...r,
                          delayHours: v === "" ? "" : Number(v),
                        }));
                      }}
                      onBlur={() => {
                        setReviewRequests((r) => {
                          const n = Number(r.delayHours);
                          const clamped =
                            Number.isFinite(n) && n >= 1
                              ? Math.min(168, Math.max(1, Math.round(n)))
                              : 2;
                          return { ...r, delayHours: clamped };
                        });
                      }}
                    />
                    <span className="be-delay-suffix">hours</span>
                  </div>
                  <p className="be-automation-hint">
                    Between 1 and 168 hours (7 days). We recommend 2–24 hours —
                    late enough that the visit is fresh, early enough that the
                    customer hasn't forgotten.
                  </p>
                </div>
              </div>
            </div>

            {/* Appointment reminder sequences */}
            <div className="be-automation-card">
              <div className="be-automation-head">
                <div>
                  <h3 className="be-automation-title">Appointment reminders</h3>
                  <p className="be-automation-desc">
                    Automatically email the customer before their appointment so
                    they don't forget. We currently support a 24-hour reminder
                    ("you have an appointment tomorrow") and a 2-hour heads-up
                    on the day of.
                  </p>
                </div>
                <label
                  className="be-switch"
                  aria-label={
                    reminders.enabled ? "Disable reminders" : "Enable reminders"
                  }
                >
                  <input
                    type="checkbox"
                    checked={reminders.enabled}
                    onChange={(e) =>
                      setReminders((r) => ({
                        ...r,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                  <span className="be-switch-track">
                    <span className="be-switch-thumb" />
                  </span>
                </label>
              </div>

              <div
                className={`be-automation-body ${
                  reminders.enabled ? "" : "be-automation-body--dim"
                }`}
              >
                <div className="be-reminder-options">
                  <label className="be-reminder-option">
                    <input
                      type="checkbox"
                      checked={reminders.before24h}
                      disabled={!reminders.enabled}
                      onChange={(e) =>
                        setReminders((r) => ({
                          ...r,
                          before24h: e.target.checked,
                        }))
                      }
                    />
                    <span className="be-reminder-option-body">
                      <span className="be-reminder-option-title">
                        24 hours before
                      </span>
                      <span className="be-reminder-option-sub">
                        "You have an appointment tomorrow at 3:00 PM" — gives
                        customers time to reschedule if needed.
                      </span>
                    </span>
                  </label>

                  <label className="be-reminder-option">
                    <input
                      type="checkbox"
                      checked={reminders.before2h}
                      disabled={!reminders.enabled}
                      onChange={(e) =>
                        setReminders((r) => ({
                          ...r,
                          before2h: e.target.checked,
                        }))
                      }
                    />
                    <span className="be-reminder-option-body">
                      <span className="be-reminder-option-title">
                        2 hours before
                      </span>
                      <span className="be-reminder-option-sub">
                        Short heads-up so they leave on time — great for
                        reducing no-shows.
                      </span>
                    </span>
                  </label>
                </div>

                <p className="be-automation-hint">
                  Reminders only go to confirmed or pending bookings, never to
                  cancelled or past appointments. Each reminder is sent at most
                  once per booking.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Gallery — tenant uploads before/after / portfolio images */}
        {activeTab === "gallery" && (
          <div className="be-section">
            <div className="be-gallery-head">
              <div>
                <h3 className="be-gallery-title">Business gallery</h3>
                <p className="be-gallery-desc">
                  Upload photos of your work — before/after shots, portfolio
                  pieces, the interior. Customers can open any image from your
                  public page and swipe through the whole gallery.
                </p>
              </div>
              <div className="be-gallery-actions">
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="be-upload-input"
                  onChange={handleGalleryPick}
                />
                <button
                  type="button"
                  className="be-gallery-upload-btn"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={
                    galleryUploading || gallery.length >= GALLERY_MAX_ITEMS
                  }
                >
                  <HiOutlinePlus size={16} />
                  {galleryUploading
                    ? "Uploading…"
                    : gallery.length >= GALLERY_MAX_ITEMS
                      ? "Gallery full"
                      : "Add images"}
                </button>
                <span className="be-gallery-count">
                  {gallery.length} / {GALLERY_MAX_ITEMS}
                </span>
              </div>
            </div>

            {gallery.length === 0 ? (
              <div className="be-gallery-empty">
                <div className="be-gallery-empty-icon">
                  <HiOutlinePhotograph size={40} />
                </div>
                <h4>No photos yet</h4>
                <p>
                  Add before/after shots or portfolio photos so customers can
                  see the quality of your work before booking.
                </p>
                <button
                  type="button"
                  className="be-gallery-upload-btn"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={galleryUploading}
                >
                  <HiOutlinePlus size={16} />
                  Upload your first images
                </button>
              </div>
            ) : (
              <ul className="be-gallery-grid" aria-label="Gallery images">
                {gallery.map((g, i) => {
                  const src = resolveMediaUrl(g.url);
                  return (
                    <li key={`${g.url}-${i}`} className="be-gallery-item">
                      <div
                        className="be-gallery-thumb"
                        style={{ backgroundImage: `url(${src})` }}
                        role="img"
                        aria-label={g.caption || `Gallery image ${i + 1}`}
                      >
                        <div className="be-gallery-order">{i + 1}</div>
                      </div>
                      <input
                        type="text"
                        className="be-gallery-caption-input form-control"
                        placeholder="Caption (optional)"
                        value={g.caption}
                        maxLength={200}
                        onChange={(e) =>
                          handleGalleryCaption(i, e.target.value)
                        }
                      />
                      <div className="be-gallery-item-actions">
                        <button
                          type="button"
                          className="be-gallery-icon-btn"
                          onClick={() => handleGalleryMove(i, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                          title="Move up"
                        >
                          <HiOutlineArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="be-gallery-icon-btn"
                          onClick={() => handleGalleryMove(i, 1)}
                          disabled={i === gallery.length - 1}
                          aria-label="Move down"
                          title="Move down"
                        >
                          <HiOutlineArrowDown size={15} />
                        </button>
                        <button
                          type="button"
                          className="be-gallery-icon-btn be-gallery-icon-btn--danger"
                          onClick={() => handleGalleryRemove(i)}
                          aria-label="Remove image"
                          title="Remove"
                        >
                          <HiOutlineTrash size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="be-gallery-hint">
              Tip: the first image shows as the thumbnail wherever we surface
              your gallery. Click the arrows to reorder, or remove any photo.
              Changes take effect when you click <strong>Save Changes</strong>.
            </p>
          </div>
        )}

        {/* Services — full editor on dedicated page */}
        {activeTab === "services" && (
          <div className="be-section be-manage-bridge">
            <p className="dp-subtitle">
              Add services with price and duration, toggle availability, and
              keep your booking page up to date.
            </p>
            <Link
              to={`/dashboard/businesses/${id}/services`}
              className="mb-manage-btn"
            >
              Manage services
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7H12M12 7L8 3M12 7L8 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        )}

        {activeTab === "staff" && (
          <div className="be-section be-manage-bridge">
            <p className="dp-subtitle">
              Add team members, assign which services they perform, and set
              working days.
            </p>
            <div className="be-manage-bridge-row">
              <Link
                to={`/dashboard/businesses/${id}/staff`}
                className="mb-manage-btn"
              >
                Manage staff
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 7H12M12 7L8 3M12 7L8 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <Link
                to={`/dashboard/businesses/${id}/staff-ranking`}
                className="mb-manage-btn mb-manage-btn--switch"
              >
                Smart staff ranking
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 7H12M12 7L8 3M12 7L8 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </div>
        )}

        {activeTab === "share" && (
          <div className="be-section be-share-section">
            <h3 className="be-gallery-title">Book with me — social links</h3>
            <p className="be-share-lead">
              Copy your public booking URL for Instagram, TikTok, Linktree, or
              any &quot;link in bio&quot; tool. Use the suggested captions for
              posts and reels—edit the wording to match your voice.
            </p>
            {!bookUrl ? (
              <p className="dp-subtitle">
                We couldn&apos;t build a link yet. Save your business once the
                slug is set, or contact support if this persists.
              </p>
            ) : (
              <>
                <div className="be-share-url-row">
                  <input
                    type="text"
                    readOnly
                    className="be-share-url-input form-control"
                    value={bookUrl}
                    aria-label="Public booking page URL"
                  />
                  <button
                    type="button"
                    className="be-share-copy-btn"
                    onClick={() =>
                      copyToClipboard(
                        bookUrl,
                        "Link copied — paste it in your bio.",
                      )
                    }
                  >
                    <HiOutlineDuplicate size={18} aria-hidden />
                    Copy link
                  </button>
                </div>
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="be-share-preview-link"
                >
                  Open booking page in new tab
                </a>
                <h4 className="be-share-captions-title">Suggested captions</h4>
                <div className="be-share-caption-card">
                  <div className="be-share-caption-head">
                    <span className="be-share-caption-label">
                      Bio &amp; short posts
                    </span>
                    <button
                      type="button"
                      className="be-share-caption-copy"
                      onClick={() =>
                        copyToClipboard(captionBio, "Caption copied.")
                      }
                      disabled={!captionBio}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="be-share-caption-text">{captionBio}</p>
                </div>
                <div className="be-share-caption-card">
                  <div className="be-share-caption-head">
                    <span className="be-share-caption-label">
                      Longer caption (Instagram / TikTok)
                    </span>
                    <button
                      type="button"
                      className="be-share-caption-copy"
                      onClick={() =>
                        copyToClipboard(captionPost, "Caption copied.")
                      }
                      disabled={!captionPost}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="be-share-caption-text">{captionPost}</p>
                </div>
                {shareOriginHint ? (
                  <p className="be-share-note">{shareOriginHint}</p>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      {/* Save Bar */}
      <div className="be-save-bar">
        <button
          className="be-save-btn"
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default BusinessEdit;
