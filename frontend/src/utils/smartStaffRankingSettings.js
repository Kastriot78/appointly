/** Must match backend `bookingRules.smartStaffRanking.priority` keys. */
export const SMART_RANK_KEYS = ["performance", "ratings", "speed"];
export const DEFAULT_SMART_RANK_PRIORITY = ["ratings", "performance", "speed"];

export const SMART_RANK_LABELS = {
  performance: "Performance — completed visits vs. no-shows (last 90 days)",
  ratings: "Ratings — average stars from reviews linked to bookings",
  speed: "Availability — fewer upcoming appointments ranks higher (next 7 days)",
};

export function parseSmartStaffRankingFromApi(br) {
  const s = br?.smartStaffRanking;
  if (!s || typeof s !== "object") {
    return {
      enabled: true,
      tieBreakEarliestShift: true,
      priority: [...DEFAULT_SMART_RANK_PRIORITY],
    };
  }
  let priority = Array.isArray(s.priority)
    ? s.priority.map((x) => String(x).trim())
    : [];
  const allow = new Set(SMART_RANK_KEYS);
  priority = priority.filter((k) => allow.has(k));
  const seen = new Set();
  priority = priority.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (const k of DEFAULT_SMART_RANK_PRIORITY) {
    if (!seen.has(k)) priority.push(k);
  }
  return {
    enabled: s.enabled !== false,
    tieBreakEarliestShift: s.tieBreakEarliestShift !== false,
    priority,
  };
}
