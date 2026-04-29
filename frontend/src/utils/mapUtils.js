import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet ships marker-icon assets as static files. In a Vite build they
 * need to be imported explicitly so the bundler rewrites the URLs — the
 * default "Leaflet.Icon.Default" configuration hardcodes marker-icon.png
 * relative to the webpage, which breaks 404s otherwise.
 */
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

/** Default map focus for Kosovo / Western Balkans. */
export const DEFAULT_CENTER = { lat: 42.6629, lng: 21.1655 };
export const DEFAULT_ZOOM = 13;
export const DISCOVER_ZOOM = 12;

/**
 * Fast, reasonably accurate great-circle distance between two lat/lng
 * points using the Haversine formula. Returns kilometers.
 */
export function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Colored circular marker — used for businesses (indigo) and the "you are
 * here" pin (sky blue). Returns a Leaflet DivIcon so we can style the pin
 * with HTML/CSS instead of shipping a dozen PNGs.
 */
export function createColoredMarker({ color = "#4f46e5", label = "", size = 34 } = {}) {
  const inner = label
    ? `<span class="map-pin-label">${label}</span>`
    : `<span class="map-pin-dot"></span>`;
  return L.divIcon({
    className: "map-pin",
    html: `
      <div class="map-pin-shape" style="--pin-color:${color};width:${size}px;height:${size}px">
        ${inner}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 6],
  });
}

export function createUserLocationMarker() {
  return L.divIcon({
    className: "map-user-pin",
    html: `
      <div class="map-user-pin-ring"></div>
      <div class="map-user-pin-dot"></div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}
