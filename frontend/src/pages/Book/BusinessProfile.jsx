import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Link,
  useParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import "./style.css";
import ReviewModal from "../../utils/ReviewModal";
import BookingModal from "../../utils/BookingModal";
import AuthPromptModal from "../../components/AuthPromptModal";
import ImageLightbox from "../../utils/ImageLightbox";
import { getBusinessBySlugPublic } from "../../api/businesses";
import {
  getMyServiceSuggestions,
  getStaffReviewEligible,
} from "../../api/bookings";
import BusinessProfileSeo from "../../seo/BusinessProfileSeo";
import { resolveMediaUrl } from "../../utils/assets";
import { ICON_KEY_EMOJI } from "../../utils/categoryIcons";
import { useAuth } from "../../auth/AuthContext";
import { useLocations } from "../../hooks/useLocations";
import { formatClosingPeriodRange } from "../../utils/closingPeriods";
import { getPromotionView, todayIsoDate } from "../../utils/servicePromotion";
import { formatMoneyCompact, normalizeCurrency } from "../../utils/currency";
import {
  DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
  MAX_BOOKING_ADVANCE_DAYS,
} from "../../utils/bookingRulesLimits";
import { HiOutlineStar } from "react-icons/hi";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatWorkingHoursDisplay(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((r) => ({
    day: r.day,
    hours: !r.active
      ? "Closed"
      : r.open && r.close
        ? `${r.open} – ${r.close}`
        : "—",
  }));
}

function parseTimeToMinutes(timeStr) {
  if (timeStr == null || typeof timeStr !== "string") return null;
  const t = timeStr.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h === 24 && min === 0) return 24 * 60;
  if (
    Number.isNaN(h) ||
    Number.isNaN(min) ||
    h < 0 ||
    h > 23 ||
    min < 0 ||
    min > 59
  ) {
    return null;
  }
  return h * 60 + min;
}

function isBusinessOpenNow(workingHours) {
  if (!Array.isArray(workingHours) || workingHours.length === 0) return false;
  const now = new Date();
  const todayIndex = now.getDay();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const todayName = DAY_NAMES[todayIndex];
  const yesterdayName = DAY_NAMES[(todayIndex + 6) % 7];
  const todayRow = workingHours.find((h) => h.day === todayName);
  const yesterdayRow = workingHours.find((h) => h.day === yesterdayName);

  if (todayRow?.active === true) {
    const openM = parseTimeToMinutes(todayRow.open);
    const closeM = parseTimeToMinutes(todayRow.close);
    if (openM !== null && closeM !== null) {
      if (closeM > openM && nowM >= openM && nowM < closeM) return true;
      if (closeM <= openM && nowM >= openM) return true;
    }
  }

  if (yesterdayRow?.active === true) {
    const yOpen = parseTimeToMinutes(yesterdayRow.open);
    const yClose = parseTimeToMinutes(yesterdayRow.close);
    if (yOpen !== null && yClose !== null && yClose <= yOpen && nowM < yClose) {
      return true;
    }
  }

  return false;
}

function getTodaySchedule(workingHours) {
  const todayIndex = new Date().getDay();
  const todayName = DAY_NAMES[todayIndex];
  const display = formatWorkingHoursDisplay(workingHours || []);
  const todayRow = Array.isArray(workingHours)
    ? workingHours.find((h) => h.day === todayName)
    : undefined;
  const todayHours = display.find((h) => h.day === todayName);
  const isOpen = isBusinessOpenNow(workingHours);
  return { isOpen, todayHours, todayName };
}

function initialsFromName(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatReviewDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function mapApiToProfile(api) {
  const workingHours = formatWorkingHoursDisplay(api.workingHours || []);

  return {
    businessId: api.id || "",
    name: api.name,
    slug: api.slug,
    /** Category display name */
    category: api.categoryName || api.category,
    /** Category slug (for SEO / schema) */
    categorySlug: String(api.category || "").trim(),
    categoryIcon: ICON_KEY_EMOJI[api.iconKey] || "🏢",
    rating: api.rating ?? 0,
    reviewCount: api.reviewCount ?? 0,
    cover: resolveMediaUrl(api.cover),
    logo: resolveMediaUrl(api.logo),
    locationId: api.location || "",
    address: api.address || "",
    area: api.area || "",
    phone: api.phone || "",
    email: api.email || "",
    description: api.description || "",
    workingHours,
    workingHoursRaw: api.workingHours || [],
    services: (api.services || []).map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      duration: s.duration,
      description: s.description || "",
      promotion: s.promotion || null,
    })),
    staff: (api.staff || []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      email: m.email || "",
      phone: m.phone || "",
      avatar: m.avatar
        ? resolveMediaUrl(m.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&size=80&background=e0e7ff&color=4f46e5`,
      workingDays: m.workingDays || [],
      /** YYYY-MM-DD inclusive ranges — must match public API / booking modal. */
      timeOff: Array.isArray(m.timeOff)
        ? m.timeOff.map((r) => ({
            startsOn: String(r.startsOn || "").trim(),
            endsOn: String(r.endsOn || "").trim(),
            note: String(r.note || "").trim().slice(0, 200),
          }))
        : [],
      services: m.services || [],
    })),
    reviews: (api.reviews || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text || "",
      name: r.customerName || "Anonymous",
      avatar: r.avatar
        ? resolveMediaUrl(r.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(r.customerName || "User")}&size=80&background=e0e7ff&color=4f46e5`,
      date: formatReviewDate(r.createdAt),
    })),
    gallery: Array.isArray(api.gallery)
      ? api.gallery
          .slice()
          .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
          .map((g) => ({
            url: resolveMediaUrl(g.url),
            caption: String(g.caption || ""),
          }))
          .filter((g) => g.url)
      : [],
    closingPeriods: Array.isArray(api.closingPeriods)
      ? api.closingPeriods.map((c) => ({
          id: String(c.id ?? ""),
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          reason: String(c.reason ?? "").trim(),
        }))
      : [],
    maxAdvanceDays: (() => {
      const m = api.bookingRules?.maxAdvanceDays;
      if (typeof m === "number" && Number.isFinite(m)) {
        return Math.min(
          MAX_BOOKING_ADVANCE_DAYS,
          Math.max(1, Math.floor(m)),
        );
      }
      return DEFAULT_MAX_BOOKING_ADVANCE_DAYS;
    })(),
    currency: normalizeCurrency(api.currency),
    coordinates:
      api.coordinates &&
      typeof api.coordinates.lat === "number" &&
      typeof api.coordinates.lng === "number"
        ? { lat: api.coordinates.lat, lng: api.coordinates.lng }
        : null,
  };
}

function StarRating({ rating, size = 14 }) {
  return (
    <div className="bp-stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width={size}
          height={size}
          viewBox="0 0 14 14"
          fill="none"
        >
          <path
            d="M7 1L8.85 4.75L13 5.35L10 8.25L10.7 12.35L7 10.4L3.3 12.35L4 8.25L1 5.35L5.15 4.75L7 1Z"
            fill={
              star <= Math.floor(rating)
                ? "#F59E0B"
                : star <= rating + 0.5
                  ? "#F59E0B"
                  : "#E2E8F0"
            }
            stroke={star <= rating ? "#F59E0B" : "#E2E8F0"}
            strokeWidth="0.5"
          />
        </svg>
      ))}
    </div>
  );
}

function BusinessProfileSkeleton() {
  return (
    <main className="bp-page bp-skel-page" aria-busy="true" aria-live="polite">
      <section className="bp-skel-cover bp-skel-shimmer" />
      <section className="bp-header-section">
        <div className="container">
          <div className="bp-header visible">
            <div className="bp-skel-avatar bp-skel-shimmer" />
            <div className="bp-header-info">
              <div className="bp-skel-line bp-skel-line--tag bp-skel-shimmer" />
              <div className="bp-skel-line bp-skel-line--title bp-skel-shimmer" />
              <div className="bp-skel-meta-row">
                <div className="bp-skel-line bp-skel-line--meta bp-skel-shimmer" />
                <div className="bp-skel-line bp-skel-line--meta bp-skel-shimmer" />
                <div className="bp-skel-line bp-skel-line--meta bp-skel-shimmer" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="bp-tabs-section">
        <div className="container">
          <div className="bp-tabs">
            <span className="bp-skel-tab bp-skel-shimmer" />
            <span className="bp-skel-tab bp-skel-shimmer" />
            <span className="bp-skel-tab bp-skel-shimmer" />
          </div>
        </div>
      </section>
      <section className="bp-content bp-content-skel visible">
        <div className="container">
          <div className="bp-layout">
            <div className="bp-main">
              <div className="bp-services-list">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="bp-skel-service-card bp-skel-shimmer" />
                ))}
              </div>
            </div>
            <aside className="bp-sidebar">
              <div className="bp-skel-side-card bp-skel-shimmer" />
              <div className="bp-skel-side-card bp-skel-shimmer" />
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

const BusinessProfile = () => {
  const { id: slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const waitlistTokenRaw = searchParams.get("waitlist");
  const waitlistToken =
    waitlistTokenRaw && String(waitlistTokenRaw).trim().length >= 24
      ? String(waitlistTokenRaw).trim()
      : null;
  const { isAuthenticated } = useAuth();
  const { locations } = useLocations();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [activeTab, setActiveTab] = useState("services");
  const [heroVisible, setHeroVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  /** @type {null | { staffId: string, staffName: string, options: Array<{ bookingId: string, dateLabel: string, serviceLabel: string }> }} */
  const [staffReviewModalContext, setStaffReviewModalContext] = useState(null);
  const [eligibleStaffReviews, setEligibleStaffReviews] = useState([]);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  /** Pre-select service & start at staff step when opening from a service "Book" button */
  const [bookingInitialServiceId, setBookingInitialServiceId] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data } = await getBusinessBySlugPublic(slug);
        if (!cancelled) {
          setBusiness(mapApiToProfile(data.business));
        }
      } catch (err) {
        if (!cancelled) {
          setBusiness(null);
          setLoadError(err?.response?.status === 404 ? "notfound" : "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const consumeWaitlistUrl = useCallback(() => {
    if (!searchParams.get("waitlist")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("waitlist");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!waitlistToken || !business?.businessId) return;
    setBookingOpen(true);
  }, [waitlistToken, business?.businessId]);

  const refetchBusiness = useCallback(async () => {
    const { data } = await getBusinessBySlugPublic(slug);
    setBusiness(mapApiToProfile(data.business));
  }, [slug]);

  const locationPinLabel = useMemo(() => {
    if (!business) return "";
    const id = (business.locationId || "").trim();
    if (id) {
      const loc = locations.find((l) => l.id === id);
      return loc ? loc.name : business.locationId;
    }
    return business.area || business.address || "";
  }, [business, locations]);

  const openReviewOrPrompt = () => {
    if (!isAuthenticated) {
      setAuthPromptOpen(true);
      return;
    }
    setStaffReviewModalContext(null);
    setReviewModalOpen(true);
  };

  const openStaffReviewForMember = (member) => {
    if (!isAuthenticated) {
      setAuthPromptOpen(true);
      return;
    }
    const opts = eligibleStaffReviews.filter((e) => e.staffId === member.id);
    if (opts.length === 0) return;
    setStaffReviewModalContext({
      staffId: member.id,
      staffName: member.name,
      options: opts,
    });
    setReviewModalOpen(true);
  };

  const openBookingOrPrompt = useCallback((initialServiceId = null) => {
    setBookingInitialServiceId(initialServiceId);
    setBookingOpen(true);
  }, []);

  const [suggestForBiz, setSuggestForBiz] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  useEffect(() => {
    if (!business || !isAuthenticated) {
      setSuggestForBiz([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSuggestLoading(true);
      try {
        const { data } = await getMyServiceSuggestions({
          businessId: business.businessId,
        });
        if (!cancelled) {
          setSuggestForBiz(
            Array.isArray(data?.suggestions) ? data.suggestions : [],
          );
        }
      } catch {
        if (!cancelled) setSuggestForBiz([]);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business, isAuthenticated]);

  useEffect(() => {
    if (!business || !isAuthenticated) {
      setEligibleStaffReviews([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getStaffReviewEligible({
          businessId: business.businessId,
        });
        if (!cancelled) {
          setEligibleStaffReviews(
            Array.isArray(data?.eligible) ? data.eligible : [],
          );
        }
      } catch {
        if (!cancelled) setEligibleStaffReviews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business, isAuthenticated]);

  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 100);
    setTimeout(() => setContentVisible(true), 300);
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (!business) return;
    const params = new URLSearchParams(location.search);
    if (params.get("review") !== "1") return;

    if (isAuthenticated) {
      setStaffReviewModalContext(null);
      setReviewModalOpen(true);
    } else {
      setAuthPromptOpen(true);
    }

    params.delete("review");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    business,
    isAuthenticated,
    location.search,
    location.pathname,
    location.hash,
    navigate,
  ]);

  /**
   * Deep-link: /book/:slug?book=SERVICE_ID opens the booking modal with that service.
   */
  useEffect(() => {
    if (!business) return;
    const params = new URLSearchParams(location.search);
    const bookSvc = params.get("book");
    if (!bookSvc) return;

    const svc = business.services.find(
      (s) => String(s.id) === String(bookSvc),
    );
    if (!svc) {
      params.delete("book");
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: location.hash,
        },
        { replace: true },
      );
      return;
    }

    if (!isAuthenticated) {
      setAuthPromptOpen(true);
      return;
    }

    openBookingOrPrompt(bookSvc);
    params.delete("book");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    business,
    isAuthenticated,
    location.search,
    location.pathname,
    location.hash,
    navigate,
    openBookingOrPrompt,
  ]);

  const { isOpen, todayHours, todayName } = getTodaySchedule(
    business?.workingHoursRaw,
  );

  if (loading) {
    return <BusinessProfileSkeleton />;
  }

  if (loadError === "notfound") {
    return (
      <main className="bp-page bp-page--centered">
        <div className="bp-error-card">
          <h1>Business not found</h1>
          <p>This booking page doesn&apos;t exist or is no longer available.</p>
          <Link to="/book" className="bp-error-link">
            Find businesses
          </Link>
        </div>
      </main>
    );
  }

  if (loadError === "error" || !business) {
    return (
      <main className="bp-page bp-page--centered">
        <div className="bp-error-card">
          <h1>Something went wrong</h1>
          <p>We couldn&apos;t load this page. Try again later.</p>
          <Link to="/book" className="bp-error-link">
            Find businesses
          </Link>
        </div>
      </main>
    );
  }

  const minPrice =
    business.services.length > 0
      ? Math.min(...business.services.map((s) => s.price))
      : null;

  return (
    <main className="bp-page">
      <BusinessProfileSeo business={business} slug={slug} />
      <section className={`bp-cover ${heroVisible ? "visible" : ""}`}>
        {business.cover ? (
          <img src={business.cover} alt="" className="bp-cover-img" />
        ) : (
          <div className="bp-cover-img bp-cover-fallback" aria-hidden />
        )}
        <div className="bp-cover-overlay" />
      </section>

      <section className="bp-header-section">
        <div className="container">
          <div className={`bp-header ${heroVisible ? "visible" : ""}`}>
            <div className="bp-avatar">
              {business.logo ? (
                <img src={business.logo} alt={business.name} />
              ) : (
                <span className="bp-avatar-fallback">
                  {initialsFromName(business.name)}
                </span>
              )}
            </div>
            <div className="bp-header-info">
              <div className="bp-header-top">
                <div>
                  <div className="bp-category-tag">
                    <span>{business.categoryIcon}</span>
                    <span>{business.category}</span>
                  </div>
                  <h1 className="bp-name">{business.name}</h1>
                </div>
                <div className={`bp-open-status ${isOpen ? "open" : "closed"}`}>
                  <div className="bp-open-dot" />
                  {isOpen ? "Open Now" : "Closed"}
                </div>
              </div>
              <div className="bp-meta-row">
                <div className="bp-meta-item">
                  <StarRating rating={business.rating} />
                  <span className="bp-rating-text">
                    {business.rating} ({business.reviewCount} reviews)
                  </span>
                </div>
                <div className="bp-meta-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M14 7C14 11 8 15 8 15C8 15 2 11 2 7C2 3.69 4.69 1 8 1C11.31 1 14 3.69 14 7Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <circle
                      cx="8"
                      cy="7"
                      r="2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                  <span>{locationPinLabel || "—"}</span>
                </div>
                <div className="bp-meta-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle
                      cx="8"
                      cy="8"
                      r="6.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M8 4V8L10.5 9.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>{todayHours?.hours || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bp-tabs-section">
        <div className="container">
          <div className="bp-tabs">
            {[
              "services",
              "reviews",
              ...(business.gallery.length > 0 ? ["gallery"] : []),
              "about",
            ].map((tab) => (
              <button
                key={tab}
                className={`bp-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "services" && "Services"}
                {tab === "reviews" && `Reviews (${business.reviewCount})`}
                {tab === "gallery" && `Gallery (${business.gallery.length})`}
                {tab === "about" && "About"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`bp-content ${contentVisible ? "visible" : ""}`}>
        <div className="container">
          <div className="bp-layout">
            <div className="bp-main">
              {activeTab === "services" && (
                <>
                  {(suggestForBiz.length > 0 || suggestLoading) && (
                    <div className="bp-suggest" aria-busy={suggestLoading}>
                      <div className="bp-suggest-head">
                        <span className="bp-suggest-label">Book again</span>
                        <span className="bp-suggest-hint">
                          Based on your completed visits
                        </span>
                      </div>
                      {suggestLoading ? (
                        <div className="bp-suggest-chips bp-suggest-chips--loading">
                          <span className="bp-suggest-skel" />
                          <span className="bp-suggest-skel" />
                        </div>
                      ) : (
                        <div className="bp-suggest-chips">
                          {suggestForBiz.map((s) => (
                            <button
                              key={s.serviceId}
                              type="button"
                              className="bp-suggest-chip"
                              onClick={() => openBookingOrPrompt(s.serviceId)}
                            >
                              <span className="bp-suggest-chip-name">
                                {s.serviceName}
                              </span>
                              <span className="bp-suggest-chip-count" aria-hidden>
                                ×{s.bookCount}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="bp-services-list">
                  {business.services.length === 0 ? (
                    <p className="bp-empty-hint">
                      No services listed yet. The business owner may add them
                      soon.
                    </p>
                  ) : (
                    business.services.map((service, i) => {
                      const pv = getPromotionView(service, todayIsoDate());
                      return (
                        <div
                          key={service.id ?? i}
                          className={`bp-service-card ${pv ? "bp-service-card--promo" : ""}`}
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          <div className="bp-service-info">
                            <div className="bp-service-title-row">
                              <h3 className="bp-service-name">{service.name}</h3>
                              {pv ? (
                                <span className="bp-sale-pill" aria-label="On sale">
                                  −{pv.percentOff}%
                                </span>
                              ) : null}
                            </div>
                            <p className="bp-service-desc">
                              {service.description}
                            </p>
                            <span className="bp-service-duration">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                              >
                                <circle
                                  cx="7"
                                  cy="7"
                                  r="5.5"
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                />
                                <path
                                  d="M7 4V7L9 8.5"
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                  strokeLinecap="round"
                                />
                              </svg>
                              {service.duration} min
                            </span>
                          </div>
                          <div className="bp-service-right">
                            <div className="bp-service-price-stack">
                              {pv ? (
                                <>
                                  <span className="bp-service-price-old">
                                    {formatMoneyCompact(
                                      pv.basePrice,
                                      business.currency,
                                    )}
                                  </span>
                                  <span className="bp-service-price">
                                    {formatMoneyCompact(
                                      pv.salePrice,
                                      business.currency,
                                    )}
                                  </span>
                                </>
                              ) : (
                                <span className="bp-service-price">
                                  {formatMoneyCompact(
                                    service.price,
                                    business.currency,
                                  )}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="bp-service-book-btn"
                              onClick={() => openBookingOrPrompt(service.id)}
                            >
                              Book
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                </>
              )}

              {activeTab === "reviews" && (
                <div className="bp-reviews-section">
                  <div className="bp-reviews-summary">
                    <div>
                      <span className="bp-big-number">{business.rating}</span>
                      <StarRating rating={business.rating} size={18} />
                      <span className="bp-review-total">
                        {business.reviewCount} reviews
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bp-write-review-btn"
                      onClick={openReviewOrPrompt}
                    >
                      Write a Review
                    </button>
                  </div>
                  {business.reviews.length === 0 ? (
                    <p className="bp-empty-hint">No reviews yet.</p>
                  ) : (
                    <div className="bp-reviews-list">
                      {business.reviews.map((review, i) => (
                        <div
                          key={review.id ?? i}
                          className="bp-review-card"
                          style={{ animationDelay: `${i * 80}ms` }}
                        >
                          <div className="bp-review-header">
                            <img
                              src={review.avatar}
                              alt={review.name}
                              className="bp-review-avatar"
                            />
                            <div>
                              <span className="bp-review-name">
                                {review.name}
                              </span>
                              <span className="bp-review-date">
                                {review.date}
                              </span>
                            </div>
                            <div className="bp-review-rating">
                              <StarRating rating={review.rating} size={12} />
                            </div>
                          </div>
                          <p className="bp-review-text">{review.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "gallery" && (
                <div className="bp-gallery-section">
                  {business.gallery.length === 0 ? (
                    <p className="bp-empty-hint">
                      No photos have been added yet.
                    </p>
                  ) : (
                    <ul
                      className="bp-gallery-grid"
                      aria-label={`${business.name} gallery`}
                    >
                      {business.gallery.map((g, i) => (
                        <li
                          key={`${g.url}-${i}`}
                          className="bp-gallery-cell"
                          style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                        >
                          <button
                            type="button"
                            className="bp-gallery-thumb"
                            style={{ backgroundImage: `url(${g.url})` }}
                            onClick={() => {
                              setLightboxIndex(i);
                              setLightboxOpen(true);
                            }}
                            aria-label={
                              g.caption || `Open image ${i + 1} of ${business.gallery.length}`
                            }
                          >
                            <span className="bp-gallery-zoom" aria-hidden>
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 20 20"
                                fill="none"
                              >
                                <circle
                                  cx="9"
                                  cy="9"
                                  r="6"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                />
                                <path
                                  d="M13.5 13.5L17 17"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M6 9H12M9 6V12"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </span>
                            {g.caption ? (
                              <span className="bp-gallery-caption-overlay">
                                {g.caption}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {activeTab === "about" && (
                <div className="bp-about-section">
                  <div className="bp-about-block">
                    <h3>About Us</h3>
                    <p>
                      {business.description ||
                        "No description has been added yet."}
                    </p>
                  </div>
                  <div className="bp-about-block">
                    <h3>Our Team</h3>
                    {business.staff.length === 0 ? (
                      <p className="bp-empty-hint">No team members listed.</p>
                    ) : (
                      <>
                        <p className="bp-team-hint bp-team-hint--about">
                          You can rate a team member from here or from the
                          sidebar on the right (after you sign in and have a
                          finished visit with them).
                        </p>
                        <div className="bp-staff-grid">
                          {business.staff.map((member, i) => {
                            const canRateStaff = eligibleStaffReviews.some(
                              (e) => e.staffId === member.id,
                            );
                            return (
                              <div
                                key={member.id}
                                className="bp-staff-card"
                                style={{ animationDelay: `${i * 100}ms` }}
                              >
                                <img
                                  src={member.avatar}
                                  alt={member.name}
                                  className="bp-staff-avatar"
                                />
                                <span className="bp-staff-name">
                                  {member.name}
                                </span>
                                <span className="bp-staff-role">
                                  {member.role}
                                </span>
                                {canRateStaff ? (
                                  <button
                                    type="button"
                                    className="bp-member-rate-btn bp-member-rate-btn--card"
                                    onClick={() =>
                                      openStaffReviewForMember(member)
                                    }
                                  >
                                    Rate
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="bp-about-block">
                    <h3>Working Hours</h3>
                    {business.workingHours.length === 0 ? (
                      <p className="bp-empty-hint">No hours listed.</p>
                    ) : (
                      <div className="bp-hours-list">
                        {business.workingHours.map((item, i) => (
                          <div
                            key={i}
                            className={`bp-hours-row ${item.day === todayName ? "today" : ""}`}
                          >
                            <span className="bp-hours-day">{item.day}</span>
                            <span
                              className={`bp-hours-time ${item.hours === "Closed" ? "closed" : ""}`}
                            >
                              {item.hours}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bp-about-block">
                    <h3>Contact</h3>
                    <div className="bp-contact-list">
                      <a
                        href={`tel:${business.phone}`}
                        className="bp-contact-item"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M14 11.3V13.3C14 13.7 13.7 14 13.3 14C6.6 14 1 8.4 1 1.7C1 1.3 1.3 1 1.7 1H3.7C4.1 1 4.4 1.3 4.4 1.7C4.4 2.8 4.6 3.8 5 4.7L3.6 6.1C4.7 8.3 6.7 10.3 8.9 11.4L10.3 10C11.2 10.4 12.2 10.6 13.3 10.6C13.7 10.6 14 10.9 14 11.3Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                        <span>{business.phone || "—"}</span>
                      </a>
                      {business.email ? (
                        <a
                          href={`mailto:${business.email}`}
                          className="bp-contact-item"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <rect
                              x="1"
                              y="3"
                              width="14"
                              height="10"
                              rx="1.5"
                              stroke="currentColor"
                              strokeWidth="1.2"
                            />
                            <path
                              d="M1 4.5L8 9L15 4.5"
                              stroke="currentColor"
                              strokeWidth="1.2"
                            />
                          </svg>
                          <span>{business.email}</span>
                        </a>
                      ) : null}
                      <div className="bp-contact-item">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M14 7C14 11 8 15 8 15C8 15 2 11 2 7C2 3.69 4.69 1 8 1C11.31 1 14 3.69 14 7Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                          <circle
                            cx="8"
                            cy="7"
                            r="2"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                        <span>{business.address || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="bp-sidebar">
              <div className="bp-booking-card">
                <h3>Book an Appointment</h3>
                <p>Choose a service and pick a time that works for you</p>
                {business.closingPeriods?.length > 0 ? (
                  <div className="bp-closing-notice" role="status">
                    <div className="bp-closing-notice-title">
                      Not accepting new bookings during:
                    </div>
                    <ul className="bp-closing-notice-list">
                      {business.closingPeriods.map((p) => (
                        <li key={p.id}>
                          <span className="bp-closing-notice-range">
                            {formatClosingPeriodRange(p)}
                          </span>
                          {p.reason ? (
                            <span className="bp-closing-notice-reason">
                              {" "}
                              ({p.reason})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="bp-booking-preview">
                  <div className="bp-booking-row">
                    <span>Services available</span>
                    <span className="bp-booking-val">
                      {business.services.length}
                    </span>
                  </div>
                  <div className="bp-booking-row">
                    <span>Starting from</span>
                    <span className="bp-booking-val">
                      {minPrice != null
                        ? formatMoneyCompact(minPrice, business.currency)
                        : "—"}
                    </span>
                  </div>
                  <div className="bp-booking-row">
                    <span>Team members</span>
                    <span className="bp-booking-val">
                      {business.staff.length}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="bp-booking-cta"
                  onClick={() => openBookingOrPrompt(null)}
                >
                  View Services & Book
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8H13M13 8L9 4M13 8L9 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  className="bp-review-sidebar-btn"
                  onClick={openReviewOrPrompt}
                >
                  <HiOutlineStar size={18} aria-hidden className="bp-review-sidebar-btn-icon" />
                  Leave a Review
                </button>
              </div>
              <div className="bp-sidebar-card">
                <h4>Our Team</h4>
                {business.staff.length > 0 ? (
                  <p className="bp-team-hint">
                    {!isAuthenticated
                      ? "Sign in to rate a provider after your visit — a Rate button appears next to their name when you’re eligible."
                      : eligibleStaffReviews.length > 0
                        ? "Tap Rate next to someone you’ve already visited. Only the business sees this (not on the public Reviews tab)."
                        : "Rate shows up here after a past appointment has ended with that person (your booking must be confirmed or completed)."}
                  </p>
                ) : null}
                <div className="bp-sidebar-staff">
                  {business.staff.length === 0 ? (
                    <p className="bp-empty-hint bp-empty-hint--compact">
                      No team listed yet.
                    </p>
                  ) : (
                    business.staff.map((member) => {
                      const canRateStaff = eligibleStaffReviews.some(
                        (e) => e.staffId === member.id,
                      );
                      return (
                        <div key={member.id} className="bp-sidebar-member">
                          <img src={member.avatar} alt={member.name} />
                          <div className="bp-sidebar-member-text">
                            <span className="bp-member-name">{member.name}</span>
                            <span className="bp-member-role">{member.role}</span>
                          </div>
                          {canRateStaff ? (
                            <button
                              type="button"
                              className="bp-member-rate-btn"
                              onClick={() => openStaffReviewForMember(member)}
                            >
                              Rate
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false);
          setStaffReviewModalContext(null);
        }}
        businessName={business.name}
        businessId={business.businessId}
        onSuccess={async () => {
          await refetchBusiness();
          try {
            const { data } = await getStaffReviewEligible({
              businessId: business.businessId,
            });
            setEligibleStaffReviews(
              Array.isArray(data?.eligible) ? data.eligible : [],
            );
          } catch {
            setEligibleStaffReviews([]);
          }
        }}
        staffReviewContext={staffReviewModalContext}
      />
      <AuthPromptModal
        isOpen={authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        returnTo={returnTo}
      />
      <BookingModal
        isOpen={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          setBookingInitialServiceId(null);
        }}
        businessName={business.name}
        businessId={business.businessId}
        services={business.services}
        staff={business.staff}
        initialServiceId={bookingInitialServiceId}
        closingPeriods={business.closingPeriods}
        maxAdvanceDays={business.maxAdvanceDays}
        currencyCode={business.currency}
        initialWaitlistToken={waitlistToken || undefined}
        onWaitlistPrefillConsumed={consumeWaitlistUrl}
      />
      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={business.gallery}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        alt={`${business.name} gallery`}
      />
    </main>
  );
};

export default BusinessProfile;
