/**
 * Browser-side geocoding helpers powering the business map picker.
 *
 * Two flavours:
 *   - `geocodeAddressClient` returns the single top hit (used by the
 *     "Locate from address" button).
 *   - `searchAddressSuggestions` returns up to N ranked suggestions for
 *     autocomplete-style UIs.
 *
 * We keep this intentionally small — no caching beyond the HTTP layer.
 * Nominatim's usage policy tolerates interactive autocomplete as long as
 * requests are debounced; the component is responsible for that.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_COUNTRY = "Kosovo";

/**
 * Geocode an address (optionally scoped to a city) via Nominatim. Returns
 * the best single hit, or null when nothing matches.
 *
 * @param {{address?: string, city?: string, country?: string}} input
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export async function geocodeAddressClient({ address, city, country } = {}) {
  const addr = String(address || "").trim();
  const town = String(city || "").trim();
  const ctry = String(country || DEFAULT_COUNTRY).trim();
  if (!addr && !town) return null;

  const q = [addr, town, ctry].filter(Boolean).join(", ");
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Autocomplete-style suggestions for a free-text place query. Returns up
 * to `limit` hits, each normalized with `{ lat, lng, label, shortLabel }`.
 * Empty array on no match or network failure.
 *
 * @param {string} query
 * @param {{city?: string, country?: string, limit?: number, signal?: AbortSignal}} [opts]
 * @returns {Promise<Array<{lat: number, lng: number, label: string, shortLabel: string}>>}
 */
export async function searchAddressSuggestions(query, opts = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  const { city, country = DEFAULT_COUNTRY, limit = 6, signal } = opts;

  /**
   * Bias results toward the selected city — Nominatim ranks hits in the
   * same locale higher, which is what the tenant almost always wants.
   */
  const parts = [q];
  if (city) parts.push(city);
  if (country) parts.push(country);
  const composed = parts.join(", ");

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(composed)}&format=json&limit=${limit}&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "en" },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((item) => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        /**
         * `display_name` is verbose ("Rruga X, Neighborhood, Prishtinë, …").
         * We build a short 2-line-ish label for compact rendering, keeping
         * the full string available as a secondary line.
         */
        const addr = item.address || {};
        const primary =
          item.name ||
          addr.road ||
          addr.pedestrian ||
          addr.suburb ||
          (item.display_name || "").split(",")[0];
        const secondaryParts = [
          addr.suburb && addr.suburb !== primary ? addr.suburb : null,
          addr.city || addr.town || addr.village,
          addr.country,
        ].filter(Boolean);
        const shortLabel = primary
          ? String(primary).trim()
          : String(item.display_name || "").trim();
        const label = String(item.display_name || "").trim();
        return {
          lat,
          lng,
          label,
          shortLabel,
          secondary: secondaryParts.join(", "),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
