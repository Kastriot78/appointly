import { startOfDay, endOfDay } from "date-fns";

/** True if the local calendar day overlaps any scheduled closing interval. */
export function calendarDayOverlapsClosing(date, closingPeriods) {
  if (!closingPeriods?.length) return false;
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  return closingPeriods.some((p) => {
    const s = new Date(p.startsAt);
    const e = new Date(p.endsAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
    return s < dayEnd && e > dayStart;
  });
}

/** Format a closing window for customer-facing copy (locale-aware). */
export function formatClosingPeriodRange(p) {
  if (!p?.startsAt || !p?.endsAt) return "";
  const a = new Date(p.startsAt);
  const b = new Date(p.endsAt);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const sameCalDay =
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const dateOpts = { month: "short", day: "numeric", year: "numeric" };
  const timeOpts = { hour: "numeric", minute: "2-digit" };
  if (sameCalDay) {
    return `${a.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} – ${b.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${a.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} – ${b.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
}
