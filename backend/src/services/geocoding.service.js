/**
 * Thin wrapper around OpenStreetMap's Nominatim service for turning a free-text
 * address + city into lat/lng coordinates.
 *
 * Design notes:
 *  - Nominatim's usage policy allows ~1 request/second per app — we queue every
 *    call through `pQueue` so a burst of tenant edits can't get us banned.
 *  - Results are cached in-memory for 24 hours. Addresses rarely move, and the
 *    cache is keyed by the normalized query string so "Rr.Agim Ramadani" and
 *    "rr. agim ramadani" hit the same entry.
 *  - The `User-Agent` header is REQUIRED by Nominatim. Anonymous requests are
 *    rate-limited aggressively and may be denied outright.
 *  - This service is intentionally non-fatal: on any error it resolves to
 *    `null` so the calling controller can just skip coordinates and move on.
 *    Geocoding is a best-effort enrichment, never a save-blocker.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ||
  "Appointly/1.0 (+https://appointly.app; contact: support@appointly.app)";

const MIN_REQUEST_GAP_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

/** @type {Map<string, { at: number, value: { lat: number, lng: number } | null }>} */
const cache = new Map();

let lastCallAt = 0;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();

function normalizeKey(parts) {
  return parts
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => p.trim().toLowerCase())
    .join("|")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function readFromCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

/** Block further queued calls until ~1s has passed since the last request. */
async function waitForSlot() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - elapsed));
  }
  lastCallAt = Date.now();
}

async function fetchWithTimeout(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Turn an address + city into coordinates. Returns null when we can't resolve
 * anything — never throws.
 *
 * @param {object} input
 * @param {string} [input.address] — street / neighbourhood
 * @param {string} [input.city] — city name (resolved from Location document)
 * @param {string} [input.country] — optional country bias (defaults to Kosovo)
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function geocodeAddress({ address, city, country } = {}) {
  const addr = String(address || "").trim();
  const town = String(city || "").trim();
  const ctry = String(country || "Kosovo").trim();

  if (!addr && !town) return null;
  const key = normalizeKey([addr, town, ctry]);
  const cached = readFromCache(key);
  if (cached) return cached.value;

  const run = queue.then(async () => {
    /** Re-check cache after awaiting the queue — a sibling call may have filled it. */
    const fresh = readFromCache(key);
    if (fresh) return fresh.value;

    await waitForSlot();

    const q = [addr, town, ctry].filter(Boolean).join(", ");
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;

    const data = await fetchWithTimeout(url);
    let value = null;
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        value = { lat, lng };
      }
    }

    cache.set(key, { at: Date.now(), value });
    return value;
  });

  queue = run.catch(() => null);
  return run;
}

module.exports = {
  geocodeAddress,
  /** Exported only for tests. */
  _normalizeKey: normalizeKey,
};
