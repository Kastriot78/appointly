/**
 * Shared helpers for review requests and staff-review eligibility (booking end time, labels).
 */

function parseHmToMinutes(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Combine the booking's date (day) with its HH:mm endTime into a JS Date in local server time.
 */
function computeBookingEnd(booking) {
  if (!booking?.date) return null;
  const endMinutes = parseHmToMinutes(booking.endTime);
  if (endMinutes == null) return null;
  const d = new Date(booking.date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  return d;
}

function buildServiceLabel(booking) {
  const list = Array.isArray(booking.services) ? booking.services : [];
  if (list.length > 1) {
    const names = list
      .map((s) => (s?.name ? String(s.name).trim() : ""))
      .filter(Boolean);
    if (names.length > 0) return names.join(" + ");
  }
  if (list[0]?.name) return String(list[0].name).trim();
  return String(booking?.service?.name || "").trim();
}

function formatDateLabel(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

module.exports = {
  parseHmToMinutes,
  computeBookingEnd,
  buildServiceLabel,
  formatDateLabel,
};
