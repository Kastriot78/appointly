/**
 * Public site origin for customer-facing URLs (booking page, social share).
 * Set `VITE_PUBLIC_APP_URL` when the dashboard is hosted on a different
 * domain than your public booking site (no trailing slash).
 */
export function getPublicAppOrigin() {
  const env = import.meta.env.VITE_PUBLIC_APP_URL;
  if (typeof env === "string" && env.trim()) {
    return env.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

function normalizeSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/** Full URL to the public booking page (`/book/:slug`). */
export function getPublicBookingPageUrl(slug) {
  const s = normalizeSlug(slug);
  if (!s) return "";
  const base = getPublicAppOrigin();
  if (!base) return "";
  return `${base}/book/${encodeURIComponent(s)}`;
}
