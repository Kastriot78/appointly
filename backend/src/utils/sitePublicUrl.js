/**
 * Public marketing / SPA origin (booking pages, sitemap, canonical URLs).
 * Prefer FRONTEND_URL in production so sitemap matches the domain users open.
 */
function getPublicSiteBase() {
  const corsOriginsRaw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const corsFirstOrigin = corsOriginsRaw
    .split(",")
    .map((s) => String(s || "").trim())
    .find(Boolean);
  const raw =
    corsFirstOrigin ||
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.CLIENT_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    "http://localhost:5173";
  return String(raw).trim().replace(/\/+$/, "");
}

module.exports = {
  getPublicSiteBase,
};
