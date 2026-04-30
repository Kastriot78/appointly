import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Navigate, useOutletContext } from "react-router-dom";
import {
  HiOutlineArrowRight,
  HiOutlineArrowLeft,
  HiCheck,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePhotograph,
} from "react-icons/hi";
import { CategoryGlyph } from "../../utils/categoryIcons";
import CustomSelect from "../../utils/CustomSelect";
import { isValidPhoneNumber } from "react-phone-number-input";
import PhoneField from "../../components/PhoneField";
import { useCategories } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import {
  createBusiness,
  createService,
  createStaff,
} from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import { isTenantAccount } from "../../utils/roles";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import BusinessMapPicker from "../../components/BusinessMapPicker";
import { CURRENCY_OPTIONS, normalizeCurrency } from "../../utils/currency";
import "../Dashboard/dashboard-pages.css";

const defaultHours = [
  { day: "Monday", open: "09:00", close: "18:00", active: true },
  { day: "Tuesday", open: "09:00", close: "18:00", active: true },
  { day: "Wednesday", open: "09:00", close: "18:00", active: true },
  { day: "Thursday", open: "09:00", close: "18:00", active: true },
  { day: "Friday", open: "09:00", close: "18:00", active: true },
  { day: "Saturday", open: "09:00", close: "14:00", active: true },
  { day: "Sunday", open: "", close: "", active: false },
];

const stepLabels = [
  "Business Info",
  "Working Hours",
  "Services",
  "Staff",
  "Finish",
];

const CATEGORY_SKELETON_COUNT = 8;
const SIGNUP_BUSINESS_DRAFT_KEY = "appointly:signupBusinessDraft";

function getBusinessSubmitErrorMessage(err) {
  const data = err?.response?.data;
  const status = err?.response?.status;
  const statusText = String(err?.response?.statusText || "").trim();

  const message =
    (typeof data?.message === "string" && data.message.trim()) ||
    (typeof data?.error === "string" && data.error.trim()) ||
    (Array.isArray(data?.errors) && data.errors[0]
      ? String(data.errors[0]).trim()
      : "");

  const details =
    typeof data?.details === "string" ? data.details.trim() : "";

  if (message && details && details !== message) {
    return `${message} (${details})`;
  }
  if (message) return message;

  if (status) {
    return `Business creation failed (HTTP ${status}${statusText ? ` ${statusText}` : ""}). Please check backend logs and request data.`;
  }

  if (err?.request && !err?.response) {
    return "Could not reach the server while creating the business. Check API URL, CORS, and network.";
  }

  return "Business creation failed. Check backend logs for more details.";
}

const BusinessOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useOutletContext();
  const { showToast } = useToast();
  const {
    categories: apiCategories,
    loading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useCategories();
  const {
    locations: apiLocations,
    loading: locationsLoading,
    error: locationsError,
    refetch: refetchLocations,
  } = useLocations();

  const bootstrapLoading = categoriesLoading || locationsLoading;
  const bootstrapFailed =
    !bootstrapLoading &&
    (categoriesError != null || locationsError != null);
  const bootstrapMessage = categoriesError
    ? getApiErrorMessage(categoriesError)
    : locationsError
      ? getApiErrorMessage(locationsError)
      : "";

  const handleBootstrapRetry = useCallback(async () => {
    await Promise.all([refetchCategories(), refetchLocations()]);
  }, [refetchCategories, refetchLocations]);

  const locationSelectOptions = useMemo(
    () =>
      apiLocations.map((loc) => ({
        value: loc.id,
        label: loc.name,
      })),
    [apiLocations],
  );
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [logoPreview, setLogoPreview] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  /** Files are sent once on “Create business”, not on each selection. */
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);

  // Step 1 — Business Info
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [locationId, setLocationId] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  /**
   * Optional map pin — the tenant can drop it now so customers see the
   * exact location on day one. If left empty, the backend will auto-geocode
   * from address + city after creation.
   */
  const [coordinates, setCoordinates] = useState(null);
  const [currency, setCurrency] = useState("EUR");

  // Step 2 — Working Hours
  const [hours, setHours] = useState(defaultHours);

  // Step 3 — Services
  const [services, setServices] = useState([
    { id: 1, name: "", price: "", duration: "30" },
  ]);

  const [staff, setStaff] = useState([
    { id: 1, name: "", role: "", phone: "" },
  ]);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIGNUP_BUSINESS_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.name === "string" && parsed.name.trim()) {
        setBusinessName((prev) => (prev.trim() ? prev : parsed.name.trim()));
      }
    } catch {
      // ignore invalid local storage payload
    }
  }, []);

  const handleLogoFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(file));
    setLogoFile(file);
  };

  const handleCoverFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(URL.createObjectURL(file));
    setCoverFile(file);
  };

  const updateHour = (index, field, value) => {
    const updated = [...hours];
    updated[index] = { ...updated[index], [field]: value };
    setHours(updated);
  };

  const toggleDay = (index) => {
    const updated = [...hours];
    updated[index] = { ...updated[index], active: !updated[index].active };
    setHours(updated);
  };

  const addService = () => {
    setServices([
      ...services,
      { id: Date.now(), name: "", price: "", duration: "30" },
    ]);
  };

  const removeService = (id) => {
    if (services.length <= 1) return;
    setServices(services.filter((s) => s.id !== id));
  };

  const updateService = (id, field, value) => {
    setServices(
      services.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  const addStaff = () => {
    setStaff([...staff, { id: Date.now(), name: "", role: "", phone: "" }]);
  };

  const removeStaff = (id) => {
    if (staff.length <= 1) return;
    setStaff(staff.filter((s) => s.id !== id));
  };

  const updateStaff = (id, field, value) => {
    setStaff(staff.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const canProceed = () => {
    if (step === 1) {
      return (
        Boolean(businessName && category && phone && locationId) &&
        isValidPhoneNumber(phone)
      );
    }
    if (step === 2) return hours.some((h) => h.active);
    if (step === 3) return services.some((s) => s.name && s.price);
    if (step === 4) {
      const anyFilled = staff.some(
        (s) => s.name.trim() || s.role.trim() || s.phone.trim(),
      );
      if (!anyFilled) return true;
      return staff.every((s) => {
        if (!s.name.trim() && !s.role.trim() && !s.phone.trim()) return true;
        return s.name.trim() && s.role.trim();
      });
    }
    return true;
  };
  const handleFinish = async () => {
    if (submitLoading) return;
    setSubmitError(null);
    setSubmitLoading(true);
    try {
      const fd = new FormData();
      fd.append("name", businessName.trim());
      fd.append("category", category);
      fd.append("phone", phone.trim());
      fd.append("description", description.trim());
      fd.append("address", address.trim());
      fd.append("location", locationId.trim());
      fd.append("currency", normalizeCurrency(currency));
      if (
        coordinates &&
        Number.isFinite(coordinates.lat) &&
        Number.isFinite(coordinates.lng)
      ) {
        fd.append(
          "coordinates",
          JSON.stringify({
            lat: coordinates.lat,
            lng: coordinates.lng,
            manuallyPlaced: coordinates.manuallyPlaced === true,
          }),
        );
      }
      fd.append(
        "workingHours",
        JSON.stringify(
          hours.map(({ day, open, close, active }) => ({
            day,
            open,
            close,
            active,
          })),
        ),
      );
      if (logoFile) fd.append("logo", logoFile, logoFile.name);
      if (coverFile) fd.append("cover", coverFile, coverFile.name);

      const { data } = await createBusiness(fd);
      const businessId = data?.business?.id;
      if (!businessId) {
        showToast(
          "Business was created but we couldn’t read its id. Open My Businesses.",
          "error",
        );
        navigate("/dashboard/businesses", { replace: true });
        return;
      }

      const serviceIds = [];
      for (const s of services) {
        if (!s.name?.trim() || s.price === "" || s.price == null) continue;
        const price = Number(s.price);
        const duration = Number(s.duration) || 30;
        if (!Number.isFinite(price) || price < 0) continue;
        if (!Number.isFinite(duration) || duration < 1) continue;
        try {
          const res = await createService(businessId, {
            name: s.name.trim(),
            price,
            duration,
            description: "",
            isActive: true,
          });
          if (res?.data?.service?.id) {
            serviceIds.push(res.data.service.id);
          }
        } catch {
          /* continue with other services */
        }
      }

      for (const m of staff) {
        if (!m.name?.trim() || !m.role?.trim()) continue;
        try {
          await createStaff(businessId, {
            name: m.name.trim(),
            role: m.role.trim(),
            email: "",
            phone: m.phone?.trim() ?? "",
            workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
            services: serviceIds,
          });
        } catch {
          /* continue with other staff */
        }
      }

      showToast("Business created successfully.", "success");
      try {
        localStorage.removeItem(SIGNUP_BUSINESS_DRAFT_KEY);
      } catch {
        // non-fatal
      }
      navigate("/dashboard/businesses", { replace: true });
    } catch (err) {
      const msg = getBusinessSubmitErrorMessage(err);
      setSubmitError(msg);
      showToast(msg, "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (!isTenantAccount(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="ob-page">
      <div className="ob-bg">
        <div className="ob-orb ob-orb--1" />
        <div className="ob-orb ob-orb--2" />
      </div>

      <div className={`ob-container ${visible ? "visible" : ""}`}>
        <div className="ob-header">
          <h1>Set Up Your Business</h1>
          <p>Complete these steps to start receiving bookings</p>
        </div>

        {bootstrapFailed ? (
          <DashboardErrorPanel
            message={bootstrapMessage}
            onRetry={handleBootstrapRetry}
          />
        ) : (
          <>
        {/* Progress */}
        <div className="ob-progress">
          {stepLabels.map((label, i) => (
            <div
              key={i}
              className={`ob-progress-step ${i + 1 <= step ? "active" : ""} ${i + 1 < step ? "done" : ""}`}
            >
              <div className="ob-progress-dot">
                {i + 1 < step ? (
                  <HiCheck size={20} strokeWidth={2.5} />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className="ob-progress-label">{label}</span>
              {i < 4 && <div className="ob-progress-line" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="ob-card">
          {/* Step 1: Business Info */}
          {step === 1 && (
            <div className="ob-step">
              <h2>Tell us about your business</h2>
              <p className="ob-step-desc">
                This information will appear on your public booking page
              </p>

              <div className="ob-approval-notice" role="status">
                <strong>Admin review</strong>
                <p>
                  After you submit this business, a platform administrator will
                  review it before it can appear in public search and discovery.
                  You can still finish setup (hours, services, staff) in your
                  dashboard while you wait — we&apos;ll make it clear when your
                  listing is approved.
                </p>
              </div>

              <div className="ob-form">
                <div className="ob-field">
                  <label>Business Name *</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Kalas Barber"
                  />
                </div>

                <div className="ob-field">
                  <label>Category *</label>
                  {categoriesLoading ? (
                    <div
                      className="ob-category-grid ob-category-grid--skeleton"
                      role="status"
                      aria-label="Loading categories"
                    >
                      {Array.from({ length: CATEGORY_SKELETON_COUNT }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className="ob-category-skel-card"
                            aria-hidden
                          >
                            <span className="ob-category-skel-icon" />
                            <span className="ob-category-skel-line" />
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="ob-category-grid">
                      {apiCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`ob-category-card ${category === cat.slug ? "selected" : ""}`}
                          onClick={() => setCategory(cat.slug)}
                        >
                          <span className="ob-cat-icon">
                            <CategoryGlyph iconKey={cat.iconKey} size={22} />
                          </span>
                          <span>{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ob-field">
                  <label htmlFor="ob-phone">Phone Number *</label>
                  <PhoneField id="ob-phone" value={phone} onChange={setPhone} />
                </div>

                <div className="ob-row">
                  <div className="ob-field">
                    <label>Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, neighborhood"
                    />
                  </div>
                  <div className="ob-field">
                    <label>City / Location *</label>
                    {locationsLoading ? (
                      <div
                        className="ob-field-skeleton ob-field-skeleton--select"
                        role="status"
                        aria-live="polite"
                        aria-label="Loading cities"
                      />
                    ) : locationSelectOptions.length === 0 ? (
                      <p className="ob-step-desc" style={{ margin: 0 }}>
                        {locationsError
                          ? "Could not load cities. Check that the API is running and try again."
                          : "No cities available yet. Ask an admin to add locations in the dashboard."}
                      </p>
                    ) : (
                      <CustomSelect
                        options={locationSelectOptions}
                        value={locationId}
                        onChange={setLocationId}
                        placeholder="Select city"
                      />
                    )}
                  </div>
                </div>

                <div className="ob-field">
                  <label>Pricing currency</label>
                  <CustomSelect
                    options={CURRENCY_OPTIONS}
                    value={currency}
                    onChange={setCurrency}
                    placeholder="Currency"
                  />
                  <p className="ob-step-desc" style={{ margin: "8px 0 0" }}>
                    All service prices and booking totals will use this
                    currency.
                  </p>
                </div>

                <div className="ob-field">
                  <label>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell clients about your business..."
                    rows="3"
                  />
                </div>

                <div className="ob-field ob-field--map">
                  <BusinessMapPicker
                    value={coordinates}
                    onChange={setCoordinates}
                    defaultCity={
                      locationSelectOptions.find(
                        (o) => o.value === locationId,
                      )?.label || ""
                    }
                    label="Pin your business on the map (optional)"
                    hint="Search your street or landmark below so customers can find you. You can skip this — we'll try to place it automatically from your address."
                  />
                </div>

                <div className="ob-row">
                  <div className="ob-field">
                    <label>Business Logo</label>
                    <div
                      className={`ob-upload-box ob-upload-box--logo ${logoPreview ? "has-preview" : ""}`}
                    >
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt=""
                          className="ob-upload-preview-img"
                        />
                      ) : (
                        <>
                          <HiOutlinePhotograph size={24} />
                          <span>Upload Logo</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) handleLogoFile(f);
                        }}
                      />
                    </div>
                  </div>
                  <div className="ob-field">
                    <label>Cover Photo</label>
                    <div
                      className={`ob-upload-box ob-upload-box--cover ${coverPreview ? "has-preview" : ""}`}
                    >
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt=""
                          className="ob-upload-preview-img"
                        />
                      ) : (
                        <>
                          <HiOutlinePhotograph size={24} />
                          <span>Upload Cover</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) handleCoverFile(f);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Working Hours */}
          {step === 2 && (
            <div className="ob-step">
              <h2>Set your working hours</h2>
              <p className="ob-step-desc">
                Clients can only book during these hours
              </p>

              <div className="ob-hours-list">
                {hours.map((h, i) => (
                  <div
                    key={h.day}
                    className={`ob-hours-row ${!h.active ? "inactive" : ""}`}
                  >
                    <div className="ob-day-toggle">
                      <button
                        type="button"
                        className={`hours-toggle-visual ${h.active ? "active" : ""}`}
                        onClick={() => toggleDay(i)}
                        aria-pressed={h.active}
                        aria-label={`${h.day}: ${h.active ? "open" : "closed"}`}
                      >
                        {h.active ? (
                          <HiCheck className="hours-toggle-icon" />
                        ) : null}
                      </button>
                      <span className="ob-day-name">{h.day}</span>
                    </div>
                    {h.active ? (
                      <div className="ob-time-inputs">
                        <input
                          type="time"
                          value={h.open}
                          onChange={(e) =>
                            updateHour(i, "open", e.target.value)
                          }
                        />
                        <span className="ob-time-sep">to</span>
                        <input
                          type="time"
                          value={h.close}
                          onChange={(e) =>
                            updateHour(i, "close", e.target.value)
                          }
                        />
                      </div>
                    ) : (
                      <span className="ob-closed-label">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Services */}
          {step === 3 && (
            <div className="ob-step">
              <h2>Add your services</h2>
              <p className="ob-step-desc">
                You can always add more later from your dashboard
              </p>

              <div className="ob-services-list">
                {services.map((service, i) => (
                  <div key={service.id} className="ob-service-row">
                    <div className="ob-service-num">{i + 1}</div>
                    <div className="ob-service-fields">
                      <input
                        type="text"
                        value={service.name}
                        onChange={(e) =>
                          updateService(service.id, "name", e.target.value)
                        }
                        placeholder="Service name"
                        className="ob-service-name"
                      />
                      <div className="ob-service-meta-inputs">
                        <div className="ob-mini-field">
                          <span>{normalizeCurrency(currency)}</span>
                          <input
                            type="number"
                            value={service.price}
                            onChange={(e) =>
                              updateService(service.id, "price", e.target.value)
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="ob-mini-field">
                          <span>min</span>
                          <input
                            type="number"
                            value={service.duration}
                            onChange={(e) =>
                              updateService(
                                service.id,
                                "duration",
                                e.target.value,
                              )
                            }
                            placeholder="30"
                          />
                        </div>
                      </div>
                    </div>
                    {services.length > 1 && (
                      <button
                        className="ob-remove-btn"
                        onClick={() => removeService(service.id)}
                      >
                        <HiOutlineTrash size={16} />
                      </button>
                    )}
                  </div>
                ))}

                <button className="ob-add-service" onClick={addService}>
                  <HiOutlinePlus size={16} />
                  Add another service
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="ob-step">
              <h2>Add your team</h2>
              <p className="ob-step-desc">
                Add staff members who will provide services. You can add more
                later.
              </p>

              <div className="ob-services-list">
                {staff.map((member, i) => (
                  <div key={member.id} className="ob-service-row ob-staff-row">
                    <div className="ob-service-num">{i + 1}</div>
                    <div className="ob-service-fields">
                      <div className="ob-staff-inputs-row">
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) =>
                            updateStaff(member.id, "name", e.target.value)
                          }
                          placeholder="Full name"
                          className="ob-service-name"
                        />
                        <input
                          type="text"
                          value={member.role}
                          onChange={(e) =>
                            updateStaff(member.id, "role", e.target.value)
                          }
                          placeholder="Role"
                          className="ob-service-name"
                        />
                      </div>
                      <div className="ob-service-meta-inputs">
                        <div className="ob-mini-field">
                          {/* <span>📞</span> */}
                          <PhoneField
                            id={`ob-staff-phone-${member.id}`}
                            value={member.phone}
                            onChange={(v) =>
                              updateStaff(member.id, "phone", v)
                            }
                          />
                        </div>
                      </div>
                    </div>
                    {staff.length > 1 && (
                      <button
                        className="ob-remove-btn"
                        onClick={() => removeStaff(member.id)}
                      >
                        <HiOutlineTrash size={16} />
                      </button>
                    )}
                  </div>
                ))}

                <button className="ob-add-service" onClick={addStaff}>
                  <HiOutlinePlus size={16} />
                  Add another member
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Finish */}
          {step === 5 && (
            <div className="ob-step ob-finish">
              <div className="ob-finish-icon">🎉</div>
              <h2>Ready to create your business</h2>
              <p className="ob-step-desc">
                We&apos;ll create <strong>{businessName}</strong> and save the
                services and team members you entered. You can change them
                anytime under My Business → Services or Staff.
              </p>
              {submitError ? (
                <p className="ob-form-error" role="alert">
                  {submitError}
                </p>
              ) : null}

              <div className="ob-summary">
                <div className="ob-summary-item">
                  <span className="ob-summary-label">Business</span>
                  <span className="ob-summary-value">{businessName}</span>
                </div>
                <div className="ob-summary-item">
                  <span className="ob-summary-label">Category</span>
                  <span className="ob-summary-value">
                    {apiCategories.find((c) => c.slug === category)?.name ??
                      category}
                  </span>
                </div>
                <div className="ob-summary-item">
                  <span className="ob-summary-label">Working Days</span>
                  <span className="ob-summary-value">
                    {hours.filter((h) => h.active).length} days/week
                  </span>
                </div>
                <div className="ob-summary-item">
                  <span className="ob-summary-label">Services</span>
                  <span className="ob-summary-value">
                    {services.filter((s) => s.name).length} services
                  </span>
                </div>
                {(logoPreview || coverPreview) && (
                  <div className="ob-summary-media">
                    {logoPreview && (
                      <div className="ob-summary-thumb-wrap">
                        <span className="ob-summary-label">Logo</span>
                        <img
                          src={logoPreview}
                          alt=""
                          className="ob-summary-thumb ob-summary-thumb--logo"
                        />
                      </div>
                    )}
                    {coverPreview && (
                      <div className="ob-summary-thumb-wrap">
                        <span className="ob-summary-label">Cover</span>
                        <img
                          src={coverPreview}
                          alt=""
                          className="ob-summary-thumb ob-summary-thumb--cover"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ob-footer">
          {step > 1 && step < 5 && (
            <button className="ob-back-btn" onClick={() => setStep(step - 1)}>
              <HiOutlineArrowLeft size={16} />
              Back
            </button>
          )}
          {step < 5 ? (
            <button
              className="ob-next-btn"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              Continue
              <HiOutlineArrowRight size={16} />
            </button>
          ) : (
            <button
              className="ob-next-btn"
              onClick={handleFinish}
              disabled={submitLoading}
            >
              {submitLoading ? (
                <span className="ob-btn-spinner" aria-hidden />
              ) : (
                <>
                  Create business
                  <HiOutlineArrowRight size={16} />
                </>
              )}
            </button>
          )}
          {step < 5 && (
            <button className="ob-skip-btn" onClick={() => setStep(step + 1)}>
              Skip for now
            </button>
          )}
        </div>
          </>
        )}
      </div>
    </main>
  );
};

export default BusinessOnboarding;
