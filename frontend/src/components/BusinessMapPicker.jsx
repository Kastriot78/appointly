import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { HiOutlineSearch, HiOutlineLocationMarker } from "react-icons/hi";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  createColoredMarker,
} from "../utils/mapUtils";
import { searchAddressSuggestions } from "../utils/geocodeClient";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 3;


function MapRecenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.flyTo([center.lat, center.lng], zoom ?? map.getZoom(), {
      duration: 0.6,
    });
  }, [center, zoom, map]);
  return null;
}

/**
 * Let the tenant drop a pin by clicking anywhere on the map. This is the
 * fine-tuning step after searching — click the exact doorway of the shop.
 */
function ClickToPlace({ onPlace }) {
  useMapEvents({
    click(e) {
      onPlace({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        manuallyPlaced: true,
      });
    },
  });
  return null;
}

/**
 * Lets the tenant place their business on the map. The primary interaction
 * is an autocomplete search ("Search a street, landmark, or address") —
 * picking a suggestion drops a pin there. Secondary interactions:
 *   - click anywhere on the map to place/move the pin
 *   - drag the pin for fine-tuning
 *   - "Use my current location" for small-business owners editing on-site
 *
 * @param {object} props
 * @param {{lat:number,lng:number}|null} props.value
 * @param {(next: {lat:number,lng:number,manuallyPlaced?:boolean} | null) => void} props.onChange
 * @param {{lat:number,lng:number}|null} [props.suggestedCenter] — map start
 *   center when no value is set yet (e.g. user selected city centroid).
 * @param {string} [props.defaultCity] — city name to bias autocomplete results.
 */
const BusinessMapPicker = ({
  value,
  onChange,
  suggestedCenter,
  defaultCity = "",
  label = "Pin your business on the map",
  hint = "Search for your street or landmark below — we'll drop a pin. Click the map or drag the pin to fine-tune the exact spot.",
}) => {
  const hasValue = Boolean(
    value && Number.isFinite(value.lat) && Number.isFinite(value.lng),
  );
  const markerRef = useRef(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState("");

  const abortRef = useRef(null);
  const wrapperRef = useRef(null);

  const initialCenter = useMemo(() => {
    if (hasValue) return value;
    if (
      suggestedCenter &&
      Number.isFinite(suggestedCenter.lat) &&
      Number.isFinite(suggestedCenter.lng)
    )
      return suggestedCenter;
    return DEFAULT_CENTER;
  }, [hasValue, value, suggestedCenter]);

  const icon = useMemo(
    () => createColoredMarker({ color: "#4f46e5", size: 36 }),
    [],
  );

  /**
   * Debounced autocomplete — aborts any in-flight request as the user keeps
   * typing. Minimum 3 characters to avoid hammering Nominatim with tiny
   * queries that return thousands of generic street matches.
   */
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoadingSug(false);
      return;
    }

    const handle = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoadingSug(true);
      try {
        const results = await searchAddressSuggestions(q, {
          city: defaultCity,
          signal: ac.signal,
          limit: 6,
        });
        if (!ac.signal.aborted) {
          setSuggestions(results);
          setActiveIdx(results.length > 0 ? 0 : -1);
        }
      } finally {
        if (!ac.signal.aborted) setLoadingSug(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, defaultCity]);

  /** Close the suggestion dropdown on outside clicks. */
  useEffect(() => {
    const onDocClick = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const applySuggestion = (sug) => {
    if (!sug) return;
    onChange({
      lat: sug.lat,
      lng: sug.lng,
      manuallyPlaced: false,
    });
    setQuery(sug.shortLabel || sug.label || "");
    setShowDropdown(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === "Enter" && query.trim().length >= MIN_QUERY_LENGTH) {
        setShowDropdown(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      applySuggestion(suggestions[Math.max(0, activeIdx)]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleUseMyLocation = () => {
    setGeoError("");
    if (!("geolocation" in navigator)) {
      setGeoError("Your browser doesn't support location sharing.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          manuallyPlaced: true,
        });
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        if (err?.code === 1) {
          setGeoError(
            "Location is blocked for this site. Allow it in your browser settings and try again.",
          );
        } else {
          setGeoError("Couldn't get your location. Please search instead.");
        }
      },
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: true },
    );
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
  };

  return (
    <div className="bmp-wrap">
      <div className="bmp-head">
        <div>
          <h4 className="bmp-title">{label}</h4>
          <p className="bmp-hint">{hint}</p>
        </div>
        {hasValue ? (
          <button
            type="button"
            className="bmp-btn bmp-btn--subtle"
            onClick={handleClear}
          >
            Clear pin
          </button>
        ) : null}
      </div>

      <div className="bmp-search-row">
        <div className="bmp-search" ref={wrapperRef}>
          <HiOutlineSearch
            className="bmp-search-icon"
            size={18}
            strokeWidth={2}
          />
          <input
            type="text"
            className="bmp-search-input form-control"
            placeholder="Search a street, landmark, or address…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-expanded={showDropdown}
          />
          {loadingSug ? <span className="bmp-search-spinner" /> : null}

          {showDropdown &&
          query.trim().length >= MIN_QUERY_LENGTH &&
          (suggestions.length > 0 || !loadingSug) ? (
            <ul className="bmp-suggestions" role="listbox">
              {suggestions.length === 0 ? (
                <li className="bmp-sug-empty">
                  No matches. Try a different street or drop a pin on the map
                  directly.
                </li>
              ) : (
                suggestions.map((s, i) => (
                  <li
                    key={`${s.lat}-${s.lng}-${i}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`bmp-sug${i === activeIdx ? " is-active" : ""}`}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => {
                      /** Prevent input blur before our click fires. */
                      e.preventDefault();
                      applySuggestion(s);
                    }}
                  >
                    <span className="bmp-sug-icon" aria-hidden>
                      <HiOutlineLocationMarker size={16} />
                    </span>
                    <span className="bmp-sug-text">
                      <span className="bmp-sug-primary">{s.shortLabel}</span>
                      {s.secondary ? (
                        <span className="bmp-sug-secondary">{s.secondary}</span>
                      ) : null}
                    </span>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          className="bmp-btn bmp-btn--ghost"
          onClick={handleUseMyLocation}
          disabled={geoBusy}
          title="Use my current location (great if you're editing from the shop)"
        >
          <HiOutlineLocationMarker size={16} strokeWidth={2} />
          {geoBusy ? "Locating…" : "Use my location"}
        </button>
      </div>

      {geoError ? <div className="bmp-error">{geoError}</div> : null}

      <div className="bmp-map">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={hasValue ? DEFAULT_ZOOM + 3 : DEFAULT_ZOOM}
          scrollWheelZoom
          className="bmp-leaflet"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <MapRecenter
            center={hasValue ? value : initialCenter}
            zoom={hasValue ? DEFAULT_ZOOM + 3 : DEFAULT_ZOOM}
          />
          <ClickToPlace onPlace={onChange} />
          {hasValue ? (
            <Marker
              ref={markerRef}
              position={[value.lat, value.lng]}
              draggable
              icon={icon}
              eventHandlers={{
                dragend() {
                  const m = markerRef.current;
                  if (!m) return;
                  const p = m.getLatLng();
                  onChange({
                    lat: p.lat,
                    lng: p.lng,
                    manuallyPlaced: true,
                  });
                },
              }}
            />
          ) : null}
        </MapContainer>
        {!hasValue ? (
          <div className="bmp-empty">
            <p>Start by searching for your street or landmark above.</p>
            <p className="bmp-empty-sub">
              You can also click anywhere on the map to drop a pin.
            </p>
          </div>
        ) : null}
      </div>

      {hasValue ? (
        <div className="bmp-coords">
          <span>
            <strong>Lat:</strong> {value.lat.toFixed(6)}
          </span>
          <span>
            <strong>Lng:</strong> {value.lng.toFixed(6)}
          </span>
          {value.manuallyPlaced ? (
            <span className="bmp-badge">Placed manually</span>
          ) : (
            <span className="bmp-badge bmp-badge--auto">From search</span>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default BusinessMapPicker;
