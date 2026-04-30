import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineSearch,
  HiOutlineLocationMarker,
  HiOutlineStar,
  HiOutlineSwitchVertical,
  HiOutlineSearchCircle,
  HiOutlineViewList,
  HiOutlineMap,
  HiOutlineInformationCircle,
  HiOutlineCalendar,
  HiOutlineCash,
  HiOutlinePhone,
} from "react-icons/hi";
import DiscoverMap from "./DiscoverMap";
import { haversineKm, formatDistance } from "../../utils/mapUtils";
import CustomSelect from "../../utils/CustomSelect";
import { CategoryGlyph } from "../../utils/categoryIcons";
import { useCategories } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import { listPublicBusinesses } from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { resolveMediaUrl } from "../../utils/assets";
import { getPromotionView, todayIsoDate } from "../../utils/servicePromotion";
import { formatMoneyCompact, normalizeCurrency } from "../../utils/currency";
import { useAuth } from "../../auth/AuthContext";
import CustomerServiceSuggestions from "../Dashboard/CustomerServiceSuggestions";

const sortOptions = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest Rated" },
  { value: "reviews", label: "Most Reviews" },
  { value: "newest", label: "Newest" },
  /**
   * Only usable once the customer has shared their location — the reducer
   * falls back to "recommended" when they haven't.
   */
  { value: "nearest", label: "Nearest to me" },
];

const ratingOptions = [
  { value: 0, label: "All Ratings" },
  { value: 4, label: "4+ Stars" },
  { value: 4.5, label: "4.5+ Stars" },
];

const radiusOptions = [
  { value: 5, label: "Within 5 km" },
  { value: 10, label: "Within 10 km" },
  { value: 25, label: "Within 25 km" },
  { value: 50, label: "Within 50 km" },
  { value: "all", label: "Any distance" },
];

const SKELETON_COUNT = 9;
const OFFLINE_CARD_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#eef2ff'/><stop offset='100%' stop-color='#e2e8f0'/></linearGradient></defs><rect width='640' height='360' fill='url(#g)'/><g fill='none' stroke='#6366f1' stroke-width='10'><rect x='210' y='110' width='220' height='150' rx='18'/><path d='M210 150h220'/><circle cx='270' cy='198' r='14'/><circle cx='320' cy='198' r='14'/><circle cx='370' cy='198' r='14'/></g></svg>",
  );

function StarRating({ rating }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} width="14" height="14" viewBox="0 0 14 14" fill="none">
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

function BusinessCardSkeleton({ index }) {
  return (
    <div
      className="business-card business-card--skeleton"
      style={{ animationDelay: `${index * 55}ms` }}
      aria-hidden
    >
      <div className="card-image-wrapper">
        <div className="card-image-skeleton" />
      </div>
      <div className="card-body">
        <div className="skeleton-rating-row">
          <div className="skeleton-stars">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton-star" />
            ))}
          </div>
          <div className="skeleton-line skeleton-line--meta" />
        </div>
        <div className="skeleton-line skeleton-line--lg skeleton-line--medium" />
        <div className="skeleton-location">
          <div className="skeleton-pin" />
          <div className="skeleton-line skeleton-line--long" />
        </div>
        <div className="card-services">
          <div className="skeleton-service-row">
            <div className="skeleton-line skeleton-line--medium" />
            <div className="skeleton-line skeleton-line--price" />
          </div>
          <div className="skeleton-service-row">
            <div className="skeleton-line skeleton-line--short" />
            <div className="skeleton-line skeleton-line--price" />
          </div>
        </div>
        <div className="card-footer">
          <div className="skeleton-line" style={{ width: 72, height: 14 }} />
        </div>
      </div>
    </div>
  );
}

function BusinessCard({
  business,
  index,
  categoryMetaBySlug,
  locationNameById,
}) {
  const imgSrc = resolveMediaUrl(business.image);
  const [imageLoaded, setImageLoaded] = useState(!imgSrc);
  const [imageFailed, setImageFailed] = useState(false);
  /**
   * Ref to the <img> so we can handle the "browser already has the image
   * cached" case. When the image is already complete at mount time, the
   * `onLoad` event never fires (the browser fired it before React attached
   * the handler), so imageLoaded would otherwise be stuck at false and the
   * CSS would keep the image invisible.
   */
  const imgRef = useRef(null);

  const categoryInfo = categoryMetaBySlug.get(business.category) ?? null;

  useEffect(() => {
    setImageLoaded(!imgSrc);
    setImageFailed(false);
    if (!imgSrc) return;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [imgSrc]);

  const locRef = (business.location || "").trim();
  const locLabel =
    locRef && locationNameById
      ? locationNameById.get(locRef) || locRef
      : locRef || "";

  const locationLine =
    (business.address && String(business.address).trim()) ||
    [business.area, locLabel].filter(Boolean).join(", ");

  const phoneLine =
    business.phone != null && String(business.phone).trim()
      ? String(business.phone).trim()
      : "";

  /** Discover API caps `services` at 3; `serviceCount` is the real total. */
  const serviceTotal = business.serviceCount ?? business.services.length;
  const moreServiceCount = serviceTotal > 2 ? serviceTotal - 2 : 0;
  const cur = normalizeCurrency(business.currency);

  return (
    <Link
      to={`/book/${business.slug}`}
      className="business-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="card-image-wrapper">
        <div className={`card-image-skeleton ${imageLoaded ? "hidden" : ""}`} />
        {imgSrc ? (
          <img
            ref={imgRef}
            src={imageFailed ? OFFLINE_CARD_PLACEHOLDER : imgSrc}
            alt={business.name}
            className={`card-image ${imageLoaded ? "loaded" : ""}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageLoaded(true);
              setImageFailed(true);
            }}
          />
        ) : (
          /**
           * No logo/cover uploaded — instead of staring at a grey rectangle
           * that looks like it's still loading, paint a gradient backdrop
           * with the category glyph + business initials.
           */
          <div className="card-image-fallback" aria-hidden>
            {categoryInfo ? (
              <CategoryGlyph
                iconKey={categoryInfo.iconKey}
                id={categoryInfo.id}
                size={46}
              />
            ) : null}
            <span className="card-image-fallback-initials">
              {(business.name || "?").trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="card-image-overlay" />

        {business.featured && <div className="featured-badge">Featured</div>}

        <div className={`open-badge ${business.isOpen ? "open" : "closed"}`}>
          <div className="open-dot" />
          {business.isOpen ? "Open Now" : "Closed"}
        </div>

        <div className="card-category-badge">
          {categoryInfo && (
            <span className="card-category-glyph">
              <CategoryGlyph
                iconKey={categoryInfo.iconKey}
                id={categoryInfo.id}
                size={16}
              />
            </span>
          )}
          <span>{categoryInfo?.label ?? business.category}</span>
        </div>
      </div>

      <div className="card-body">
        <div className="card-rating-row">
          <StarRating rating={business.rating} />
          <span className="rating-text">
            {business.rating} ({business.reviewCount})
          </span>
        </div>

        <h3 className="card-business-name">{business.name}</h3>

        {phoneLine ? (
          <div className="card-phone">
            <HiOutlinePhone size={14} strokeWidth={1.75} aria-hidden />
            <span>{phoneLine}</span>
          </div>
        ) : null}

        <div className="card-location">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M12 6C12 9.5 7 13 7 13C7 13 2 9.5 2 6C2 3.24 4.24 1 7 1C9.76 1 12 3.24 12 6Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <circle
              cx="7"
              cy="6"
              r="1.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          <span>{locationLine || "—"}</span>
          {Number.isFinite(business._distanceKm) ? (
            <span className="card-distance">
              · {formatDistance(business._distanceKm)}
            </span>
          ) : null}
        </div>

        <div className="card-services">
          {business.services.length > 0 ? (
            <>
              {business.services.slice(0, 2).map((service, i) => {
                const pv = getPromotionView(service, todayIsoDate());
                return (
                  <div key={i} className="card-service-row">
                    <span className="service-name">{service.name}</span>
                    <span className="service-price">
                      {pv ? (
                        <>
                          <span className="service-price-old">
                            {formatMoneyCompact(pv.basePrice, cur)}
                          </span>
                          <span className="service-price-sale">
                            {formatMoneyCompact(pv.salePrice, cur)}
                          </span>
                        </>
                      ) : service.price === 0 ? (
                        "Free"
                      ) : (
                        formatMoneyCompact(service.price, cur)
                      )}
                    </span>
                  </div>
                );
              })}
              {moreServiceCount > 0 && (
                <span className="more-services">
                  +{moreServiceCount} more{" "}
                  {moreServiceCount === 1 ? "service" : "services"}
                </span>
              )}
            </>
          ) : (
            <span className="more-services" style={{ opacity: 0.75 }}>
              Services coming soon
            </span>
          )}
        </div>

        <div className="card-footer">
          <span className="book-now-link">
            Book Now
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7H12M12 7L8 3M12 7L8 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

const Book = () => {
  const { isAuthenticated } = useAuth();
  const [heroVisible, setHeroVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeLocation, setActiveLocation] = useState("All Locations");
  const [activeSort, setActiveSort] = useState("recommended");
  const [minRating, setMinRating] = useState(0);
  /** Only businesses with at least one bookable slot left today (client local date/time). */
  const [availableTodayOnly, setAvailableTodayOnly] = useState(false);
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [debouncedPrices, setDebouncedPrices] = useState({ min: "", max: "" });

  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  /** "list" | "map" — controls which view the results section renders. */
  const [viewMode, setViewMode] = useState("list");
  /** User-provided location (from Geolocation API). Null when not shared. */
  const [userLocation, setUserLocation] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  /**
   * Maximum distance (km) from the user location before a business is
   * filtered out of the "nearest" view. `null` means "no limit" — user
   * explicitly expanded the search. Default 25 km keeps the list local.
   */
  const [radiusKm, setRadiusKm] = useState(25);
  /** Controls the "how to unblock location" popover next to the near-me button. */
  const [blockedHelpOpen, setBlockedHelpOpen] = useState(false);
  const blockedHelpRef = useRef(null);
  /**
   * Live Permissions API state for geolocation: "granted" | "denied" |
   * "prompt" | "unknown". Tells us upfront whether clicking the button
   * will even get a chance to show the prompt, so we can disable it and
   * show a helpful hint instead of triggering a silent failure.
   */
  const [geoPermission, setGeoPermission] = useState("unknown");

  useEffect(() => {
    if (!blockedHelpOpen) return;
    const onDocClick = (e) => {
      if (!blockedHelpRef.current) return;
      if (!blockedHelpRef.current.contains(e.target)) setBlockedHelpOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [blockedHelpOpen]);

  /** Auto-close the popover the moment permission is granted again. */
  useEffect(() => {
    if (geoPermission !== "denied") setBlockedHelpOpen(false);
  }, [geoPermission]);

  useEffect(() => {
    if (!("permissions" in navigator) || !navigator.permissions?.query) {
      return;
    }
    let cancelled = false;
    let status = null;
    const onChange = () => {
      if (!status || cancelled) return;
      setGeoPermission(status.state);
      /** If the user just flipped the setting back to allow, clear the error. */
      if (status.state !== "denied") setGeoError("");
    };
    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        setGeoPermission(s.state);
        s.addEventListener("change", onChange);
      })
      .catch(() => {
        /* Some browsers reject on unknown name — silently ignore. */
      });
    return () => {
      cancelled = true;
      if (status) status.removeEventListener("change", onChange);
    };
  }, []);

  const { categories: apiCategories } = useCategories();
  const { locations: apiLocations } = useLocations();

  const locationNameById = useMemo(() => {
    const m = new Map();
    for (const l of apiLocations) {
      m.set(l.id, l.name);
    }
    return m;
  }, [apiLocations]);

  /** Full category metadata for cards (includes every API category). */
  const categoryMetaBySlug = useMemo(() => {
    const m = new Map();
    for (const c of apiCategories) {
      m.set(c.slug, {
        id: c.slug,
        label: c.name,
        iconKey: c.iconKey,
      });
    }
    return m;
  }, [apiCategories]);

  /**
   * Category chips in the nav bar — “All” already covers uncategorized / other;
   * hide the redundant “Other” filter chip.
   */
  const categoryChips = useMemo(
    () => [
      { id: "all", label: "All", iconKey: "all" },
      ...apiCategories
        .filter((c) => String(c.slug || "").toLowerCase() !== "other")
        .map((c) => ({
          id: c.slug,
          label: c.name,
          iconKey: c.iconKey,
        })),
    ],
    [apiCategories],
  );

  const locationOptions = useMemo(() => {
    const fromApi = apiLocations.map((l) => ({
      value: l.id,
      label: l.name,
    }));
    const seenIds = new Set(fromApi.map((o) => o.value));
    /** Avoid duplicates when businesses store a label (e.g. city name) that already exists in the locations table. */
    const seenLabels = new Set(
      apiLocations.map((l) =>
        String(l.name || "")
          .trim()
          .toLowerCase(),
      ),
    );
    const extra = new Set();
    for (const b of businesses) {
      const loc = (b.location || "").trim();
      if (!loc) continue;
      if (seenIds.has(loc)) continue;
      if (seenLabels.has(loc.toLowerCase())) continue;
      extra.add(loc);
    }
    const extras = Array.from(extra)
      .sort((a, z) => a.localeCompare(z, undefined, { sensitivity: "base" }))
      .map((loc) => ({ value: loc, label: loc }));
    return [
      { value: "All Locations", label: "All Locations" },
      ...fromApi,
      ...extras,
    ];
  }, [apiLocations, businesses]);

  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 100);
  }, []);

  useEffect(() => {
    if (activeCategory === "other") setActiveCategory("all");
  }, [activeCategory]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedPrices({
        min: priceMinInput.trim(),
        max: priceMaxInput.trim(),
      });
    }, 450);
    return () => window.clearTimeout(t);
  }, [priceMinInput, priceMaxInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = {};
        if (availableTodayOnly) {
          const now = new Date();
          const y = now.getFullYear();
          const mo = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");
          params.availableOn = `${y}-${mo}-${day}`;
          params.clientNowMinutes = now.getHours() * 60 + now.getMinutes();
        }
        const pMin =
          debouncedPrices.min === "" ? NaN : Number(debouncedPrices.min);
        const pMax =
          debouncedPrices.max === "" ? NaN : Number(debouncedPrices.max);
        if (Number.isFinite(pMin) && pMin >= 0) params.priceMin = pMin;
        if (Number.isFinite(pMax) && pMax >= 0) params.priceMax = pMax;

        const { data } = await listPublicBusinesses(params);
        if (!cancelled) {
          setBusinesses(Array.isArray(data.businesses) ? data.businesses : []);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(getApiErrorMessage(err));
          setBusinesses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [availableTodayOnly, debouncedPrices.min, debouncedPrices.max]);

  const filtered = useMemo(() => {
    let result = [...businesses];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.address && b.address.toLowerCase().includes(q)) ||
          (b.area && b.area.toLowerCase().includes(q)) ||
          (b.location && b.location.toLowerCase().includes(q)) ||
          b.services.some((s) => s.name.toLowerCase().includes(q)),
      );
    }

    if (activeCategory !== "all") {
      result = result.filter((b) => b.category === activeCategory);
    }

    if (activeLocation !== "All Locations") {
      const locMeta = apiLocations.find((l) => l.id === activeLocation);
      result = result.filter((b) => {
        const bl = (b.location || "").trim();
        if (!bl) return false;
        /** Dropdown value is the Location id; many businesses store `location` as the city name. */
        if (bl === activeLocation) return true;
        if (locMeta) {
          const name = locMeta.name.trim();
          return bl === name || bl.toLowerCase() === name.toLowerCase();
        }
        return bl === activeLocation;
      });
    }

    if (minRating > 0) {
      result = result.filter((b) => b.rating >= minRating);
    }

    /**
     * Decorate with distance from the user when we have their location. We
     * mutate a copy so the card component can display "2.3 km away" without
     * needing to know the geolocation state.
     */
    if (userLocation) {
      result = result.map((b) => {
        if (
          b.coordinates &&
          Number.isFinite(Number(b.coordinates.lat)) &&
          Number.isFinite(Number(b.coordinates.lng))
        ) {
          const d = haversineKm(userLocation, {
            lat: Number(b.coordinates.lat),
            lng: Number(b.coordinates.lng),
          });
          return { ...b, _distanceKm: d };
        }
        return { ...b, _distanceKm: Infinity };
      });
    }

    /**
     * When the user has shared their location AND set a radius, drop any
     * business beyond the radius — prevents a 59 km Prizren shop from
     * showing in a Pristina-based "near me" search just because sort is
     * distance-ascending. Businesses with no coordinates are always kept
     * so the list doesn't mysteriously shrink to zero for areas where
     * geocoding hasn't caught up yet.
     */
    if (userLocation && radiusKm != null) {
      result = result.filter(
        (b) => !Number.isFinite(b._distanceKm) || b._distanceKm <= radiusKm,
      );
    }

    if (activeSort === "rating") {
      result.sort((a, b) => b.rating - a.rating);
    } else if (activeSort === "reviews") {
      result.sort((a, b) => b.reviewCount - a.reviewCount);
    } else if (activeSort === "newest") {
      result.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    } else if (activeSort === "nearest" && userLocation) {
      result.sort(
        (a, b) => (a._distanceKm ?? Infinity) - (b._distanceKm ?? Infinity),
      );
    } else {
      result.sort(
        (a, b) =>
          (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating,
      );
    }

    return result;
  }, [
    businesses,
    search,
    activeCategory,
    activeLocation,
    activeSort,
    minRating,
    apiLocations,
    userLocation,
    radiusKm,
  ]);

  /**
   * Ask the browser for the user's location. Kept simple (no watchPosition,
   * no high accuracy) — for discovery use cases an approximate fix is enough
   * and avoids the GPS power spike on mobile.
   */
  const handleFindNearMe = () => {
    setGeoError("");
    if (!("geolocation" in navigator)) {
      setGeoError("Your browser doesn't support location sharing.");
      return;
    }
    /**
     * Permissions API told us it's already blocked — don't kick off
     * another getCurrentPosition that will silently fail, just open the
     * "how to unblock" popover anchored to the button.
     */
    if (geoPermission === "denied") {
      setBlockedHelpOpen(true);
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setActiveSort("nearest");
        setGeoLoading(false);
        setGeoError("");
      },
      (err) => {
        setGeoLoading(false);
        if (err?.code === 1) {
          /** First denial — flip to denied state and surface the popover. */
          setGeoPermission("denied");
          setBlockedHelpOpen(true);
        } else if (err?.code === 3) {
          setGeoError("Timed out getting your location. Please try again.");
        } else {
          setGeoError("Couldn't get your location. Please try again.");
        }
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  const handleClearLocation = () => {
    setUserLocation(null);
    setGeoError("");
    if (activeSort === "nearest") setActiveSort("recommended");
  };

  const clearFilters = () => {
    setSearch("");
    setActiveCategory("all");
    setActiveLocation("All Locations");
    setActiveSort("recommended");
    setMinRating(0);
    setAvailableTodayOnly(false);
    setPriceMinInput("");
    setPriceMaxInput("");
    setDebouncedPrices({ min: "", max: "" });
  };

  const hasActiveFilters =
    search ||
    activeCategory !== "all" ||
    activeLocation !== "All Locations" ||
    minRating > 0 ||
    availableTodayOnly ||
    Boolean(priceMinInput.trim()) ||
    Boolean(priceMaxInput.trim());

  const searchDisabled = loading || businesses.length === 0;
  const filtersDisabled = loading || Boolean(loadError) || businesses.length === 0;

  return (
    <main className="explore-page">
      {/* Hero / Search */}
      <section className="explore-hero">
        <div className="explore-hero-bg">
          <div className="explore-orb explore-orb--1" />
          <div className="explore-orb explore-orb--2" />
        </div>
        <div className="container">
          <div
            className={`explore-hero-content ${heroVisible ? "visible" : ""}`}
          >
            <h1 className="explore-title">
              Discover Local <span className="gradient-text">Businesses</span>
            </h1>
            <p className="explore-subtitle">
              Find and book appointments with top-rated professionals near you
            </p>

            <div
              className={`search-bar${searchDisabled ? " search-bar--disabled" : ""}`}
            >
              <svg
                className="search-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
              >
                <circle
                  cx="9"
                  cy="9"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M14 14L18 18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                placeholder="Search businesses, services, or areas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={searchDisabled}
                title={
                  searchDisabled
                    ? loading
                      ? "Loading businesses…"
                      : "No businesses available to search"
                    : undefined
                }
              />
              {search && !searchDisabled && (
                <button className="search-clear" onClick={() => setSearch("")}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 12L12 4M4 4L12 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="categories-bar">
        <div className="container">
          <div className="categories-scroll">
            {categoryChips.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`category-chip ${activeCategory === cat.id ? "active" : ""}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span className="chip-icon">
                  <CategoryGlyph id={cat.id} iconKey={cat.iconKey} size={18} />
                </span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {isAuthenticated ? (
        <CustomerServiceSuggestions variant="explore" />
      ) : null}

      {/* Filters + Results */}
      <section className="explore-results">
        <div className="container">
          <div
            className={`filters-row${filtersDisabled ? " filters-row--disabled" : ""}`}
            aria-disabled={filtersDisabled}
          >
            <div className="filters-left">
              <div className="filter-select-wrapper">
                <CustomSelect
                  options={locationOptions}
                  value={activeLocation}
                  onChange={setActiveLocation}
                  icon={<HiOutlineLocationMarker size={18} strokeWidth={1.5} />}
                  placeholder="Location"
                />
              </div>

              <div className="filter-select-wrapper">
                <CustomSelect
                  options={ratingOptions}
                  value={minRating}
                  onChange={setMinRating}
                  icon={<HiOutlineStar size={18} strokeWidth={1.5} />}
                  placeholder="Rating"
                />
              </div>

              <button
                type="button"
                role="checkbox"
                aria-checked={availableTodayOnly}
                className="explore-filter-toggle"
                onClick={() => setAvailableTodayOnly(!availableTodayOnly)}
                disabled={filtersDisabled}
              >
                <div
                  className={`bm-checkbox ${availableTodayOnly ? "checked" : ""}`}
                  aria-hidden
                >
                  {availableTodayOnly ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6.5L4.5 9L10 3"
                        stroke="#fff"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </div>
                <HiOutlineCalendar size={18} strokeWidth={1.5} aria-hidden />
                <span>Free slot today</span>
              </button>

              <div className="explore-price-range">
                <HiOutlineCash
                  size={16}
                  strokeWidth={1.5}
                  className="explore-price-range__icon"
                  aria-hidden
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="explore-price-input form-control"
                  placeholder="Min"
                  value={priceMinInput}
                  onChange={(e) => setPriceMinInput(e.target.value)}
                  aria-label="Minimum price"
                  disabled={filtersDisabled}
                />
                <span className="explore-price-dash">–</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="explore-price-input form-control"
                  placeholder="Max"
                  value={priceMaxInput}
                  onChange={(e) => setPriceMaxInput(e.target.value)}
                  aria-label="Maximum price"
                  disabled={filtersDisabled}
                />
              </div>

              {hasActiveFilters && (
                <button
                  className="clear-filters-btn"
                  onClick={clearFilters}
                  disabled={filtersDisabled}
                >
                  Clear All
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 11L11 3M3 3L11 11"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="filters-right">
              <span className="results-count">
                {loading
                  ? "Loading businesses…"
                  : loadError
                    ? "Couldn’t load list"
                    : userLocation && radiusKm != null
                      ? `${filtered.length} within ${radiusKm} km`
                      : `${filtered.length} businesses found`}
              </span>

              {userLocation ? (
                <div className="filter-select-wrapper">
                  <CustomSelect
                    options={radiusOptions}
                    value={radiusKm == null ? "all" : radiusKm}
                    onChange={(v) =>
                      setRadiusKm(v === "all" ? null : Number(v))
                    }
                    icon={
                      <HiOutlineLocationMarker size={16} strokeWidth={1.5} />
                    }
                    placeholder="Radius"
                  />
                </div>
              ) : null}

              <div className="near-me-slot" ref={blockedHelpRef}>
                <button
                  type="button"
                  className={`near-me-btn${userLocation ? " near-me-btn--active" : ""}${geoPermission === "denied" && !userLocation ? " near-me-btn--blocked" : ""}`}
                  onClick={
                    userLocation ? handleClearLocation : handleFindNearMe
                  }
                  disabled={filtersDisabled || geoLoading}
                  aria-disabled={filtersDisabled || geoLoading}
                  title={
                    userLocation
                      ? "Clear location & near-me sort"
                      : geoPermission === "denied"
                        ? "Location is blocked for this site — click to see how to re-enable."
                        : "Share your location to sort by distance"
                  }
                >
                  <HiOutlineLocationMarker size={16} strokeWidth={2} />
                  {geoLoading
                    ? "Locating…"
                    : userLocation
                      ? "Clear location"
                      : geoPermission === "denied"
                        ? "Location blocked"
                        : "Find near me"}
                </button>

                {blockedHelpOpen && geoPermission === "denied" ? (
                  <div className="near-me-help" role="dialog">
                    <div className="near-me-help-title">
                      Your browser is blocking location
                    </div>
                    <p className="near-me-help-text">
                      To sort by distance, allow this site to use your location:
                    </p>
                    <ol className="near-me-help-steps">
                      <li>
                        Click the <strong>lock / settings icon</strong> on the
                        left of the address bar.
                      </li>
                      <li>
                        Find <strong>Location</strong> in the list and set it to{" "}
                        <strong>Allow</strong>.
                      </li>
                      <li>Reload this page so the change takes effect.</li>
                    </ol>
                    <div className="near-me-help-actions">
                      <button
                        type="button"
                        className="near-me-help-reload"
                        onClick={() => window.location.reload()}
                      >
                        Reload page
                      </button>
                      <button
                        type="button"
                        className="near-me-help-close"
                        onClick={() => setBlockedHelpOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="filter-select-wrapper">
                <CustomSelect
                  options={sortOptions}
                  value={activeSort}
                  onChange={(v) => {
                    if (v === "nearest" && !userLocation) {
                      handleFindNearMe();
                      return;
                    }
                    setActiveSort(v);
                  }}
                  icon={<HiOutlineSwitchVertical size={18} strokeWidth={1.5} />}
                  placeholder="Sort by"
                />
              </div>

              <div
                className="view-toggle"
                role="group"
                aria-label="Results view"
              >
                <button
                  type="button"
                  className={`view-toggle-btn${viewMode === "list" ? " is-active" : ""}`}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  disabled={filtersDisabled}
                >
                  <HiOutlineViewList size={16} strokeWidth={2} />
                  List
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn${viewMode === "map" ? " is-active" : ""}`}
                  onClick={() => setViewMode("map")}
                  aria-pressed={viewMode === "map"}
                  disabled={filtersDisabled}
                >
                  <HiOutlineMap size={16} strokeWidth={2} />
                  Map
                </button>
              </div>
            </div>
          </div>

          {!userLocation ? (
            <p className="explore-distance-hint" role="note">
              <HiOutlineInformationCircle size={20} aria-hidden />
              <span>
                Turn on location and pick <strong>Nearest to me</strong> in Sort
                to see businesses by distance.
              </span>
            </p>
          ) : null}

          {geoError && !userLocation ? (
            <div className="geo-error" role="alert">
              <span>{geoError}</span>
              <button
                type="button"
                className="geo-error-close"
                onClick={() => setGeoError("")}
                aria-label="Dismiss location error"
              >
                ×
              </button>
            </div>
          ) : null}

          {loadError && !loading ? (
            <div className="no-results">
              <div className="no-results-icon" aria-hidden>
                <HiOutlineSearchCircle size={48} strokeWidth={1.25} />
              </div>
              <h3>Couldn&apos;t load businesses</h3>
              <p>{loadError}</p>
            </div>
          ) : loading ? (
            <div className="businesses-grid">
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <BusinessCardSkeleton key={i} index={i} />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            viewMode === "map" ? (
              <DiscoverMap businesses={filtered} userLocation={userLocation} />
            ) : (
              <div
                className="businesses-grid"
                key={`${activeCategory}-${activeLocation}-${minRating}-${activeSort}`}
              >
                {filtered.map((business, index) => (
                  <BusinessCard
                    key={business.id}
                    business={business}
                    index={index}
                    categoryMetaBySlug={categoryMetaBySlug}
                    locationNameById={locationNameById}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="no-results">
              <div className="no-results-icon" aria-hidden>
                <HiOutlineSearchCircle size={48} strokeWidth={1.25} />
              </div>
              <h3>No businesses found</h3>
              <p>Try adjusting your filters or search for something else</p>
              <button
                className="clear-filters-btn large"
                onClick={clearFilters}
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default Book;
