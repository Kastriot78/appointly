import { getApiOrigin } from "../api/http";

/**
 * Turn a stored logo/cover value into a browser-usable URL.
 * Accepts absolute URLs or backend paths like `/uploads/xyz.jpg`.
 */
export function resolveMediaUrl(url) {
  if (url == null || typeof url !== "string") return "";
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = getApiOrigin();
  return u.startsWith("/") ? `${origin}${u}` : `${origin}/${u}`;
}
