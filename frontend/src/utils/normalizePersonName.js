/** Full name stored in lowercase for consistent display (e.g. headers, initials). */
export function normalizePersonName(value) {
  return String(value ?? "").trim().toLowerCase();
}
