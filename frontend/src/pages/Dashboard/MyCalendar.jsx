import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import { enUS } from "date-fns/locale";
import { startOfDay } from "date-fns";
import "react-day-picker/style.css";
import {
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineOfficeBuilding,
  HiOutlineUser,
} from "react-icons/hi";
import { isCustomerRole } from "../../utils/roles";
import { listMyBookings } from "../../api/bookings";
import { getApiErrorMessage } from "../../api/auth";
import { resolveMediaUrl } from "../../utils/assets";
import { DashboardPageSkeletonDefault } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import "./dashboard-pages.css";

/**
 * Only “live” appointments show up on the customer calendar:
 *  - confirmed: will happen
 *  - pending: awaiting business action
 *  - pending_confirmation: the customer needs to accept an alternate slot
 * Completed, cancelled, no-show and expired rows are intentionally hidden.
 */
const ACTIVE_STATUSES = new Set([
  "confirmed",
  "pending",
  "pending_confirmation",
]);

const STATUS_STYLES = {
  confirmed: { label: "Confirmed", color: "#047857", bg: "#ecfdf5" },
  pending: { label: "Pending", color: "#b45309", bg: "#fffbeb" },
  pending_confirmation: {
    label: "Confirm time",
    color: "#c2410c",
    bg: "#fff7ed",
  },
};

/**
 * Build the appointment start in local time. The API returns `date` as a
 * YYYY-MM-DD string (sometimes full ISO) + a separate `startTime` HH:mm —
 * parsing as a Date directly would drift the calendar day across UTC, so we
 * assemble the parts manually.
 */
function parseBookingLocalStart(b) {
  const raw = b.date;
  const st = String(b.startTime || "00:00").trim();
  const [hhStr, mmStr] = st.split(":");
  const hh = parseInt(hhStr, 10);
  const mm = parseInt(mmStr, 10) || 0;
  if (Number.isNaN(hh)) return null;

  if (typeof raw === "string") {
    const md = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (md) {
      return new Date(
        parseInt(md[1], 10),
        parseInt(md[2], 10) - 1,
        parseInt(md[3], 10),
        hh,
        mm,
      );
    }
  }
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
}

function ymdKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatFullDay(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** “Tomorrow”, “Thu, 24 Apr” style relative helper for the upcoming list. */
function formatRelativeDay(start, today) {
  const diff = Math.round(
    (startOfDay(start).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) {
    return start.toLocaleDateString(undefined, { weekday: "long" });
  }
  return start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function bookingImage(b) {
  const fromLogo = resolveMediaUrl(b.businessLogo);
  if (fromLogo) return fromLogo;
  const fromStaff = resolveMediaUrl(b.staffAvatar);
  if (fromStaff) return fromStaff;
  const name = encodeURIComponent(b.businessName || "Appointly");
  return `https://ui-avatars.com/api/?name=${name}&size=80&background=e0e7ff&color=4f46e5`;
}

const MyCalendar = () => {
  const { user } = useOutletContext();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await listMyBookings();
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = useMemo(() => startOfDay(new Date()), []);

  /** Filter → active + not in the past → enriched with `_start`. */
  const activeUpcoming = useMemo(() => {
    return bookings
      .filter((b) => ACTIVE_STATUSES.has(b.status))
      .map((b) => ({ ...b, _start: parseBookingLocalStart(b) }))
      .filter((b) => b._start && startOfDay(b._start) >= today)
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }, [bookings, today]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const b of activeUpcoming) {
      const key = ymdKey(b._start);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(b);
    }
    return m;
  }, [activeUpcoming]);

  const daysWithAppt = useMemo(
    () =>
      Array.from(byDay.keys()).map((k) => {
        const [y, mo, d] = k.split("-").map(Number);
        return new Date(y, mo - 1, d);
      }),
    [byDay],
  );

  /**
   * When nothing is selected we default to the day of the *next* appointment
   * so the right pane immediately shows something useful.
   */
  const effectiveDate = selectedDate ?? activeUpcoming[0]?._start ?? null;
  const dayList = effectiveDate
    ? (byDay.get(ymdKey(effectiveDate)) ?? [])
    : [];

  const nextAppt = activeUpcoming[0] || null;

  const modifiers = useMemo(
    () => ({
      hasAppt: daysWithAppt,
    }),
    [daysWithAppt],
  );

  /** Keep calendar scoped to the currently visible months with appointments. */
  const monthBounds = useMemo(() => {
    if (daysWithAppt.length === 0) return null;
    const times = daysWithAppt.map((d) => d.getTime());
    return {
      from: new Date(Math.min(...times)),
      to: new Date(Math.max(...times)),
    };
  }, [daysWithAppt]);

  if (!user) return null;
  if (!isCustomerRole(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">My Calendar</h1>
          <p className="dp-subtitle">
            {loading
              ? "Loading your upcoming appointments…"
              : loadError
                ? "We couldn’t load your appointments."
                : activeUpcoming.length === 0
                  ? "Nothing booked yet — your next appointment will appear here."
                  : `${activeUpcoming.length} upcoming appointment${activeUpcoming.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link to="/book" className="dt-add-btn dp-calendar-cta">
          <HiOutlineCalendar size={18} />
          Book new
        </Link>
      </div>

      {loading ? (
        <DashboardPageSkeletonDefault rows={4} />
      ) : loadError ? (
        <DashboardErrorPanel message={loadError} onRetry={load} />
      ) : activeUpcoming.length === 0 ? (
        <div className="dp-cal-empty">
          <div className="dp-cal-empty-icon" aria-hidden>
            <HiOutlineCalendar size={28} />
          </div>
          <h3>No upcoming appointments</h3>
          <p>
            When you book something, the date will show up here with a dot so
            you can see your schedule at a glance.
          </p>
          <Link to="/book" className="dp-cal-empty-cta">
            Find a business to book
          </Link>
        </div>
      ) : (
        <div className="dp-cal-layout">
          <aside className="dp-cal-panel dp-cal-panel--month">
            <div className="dp-cal-month-wrap">
              <DayPicker
                mode="single"
                selected={effectiveDate ?? undefined}
                onSelect={(d) => setSelectedDate(d ?? null)}
                locale={enUS}
                defaultMonth={effectiveDate ?? new Date()}
                captionLayout="dropdown"
                fromYear={new Date().getFullYear()}
                toYear={new Date().getFullYear() + 2}
                modifiers={modifiers}
                modifiersClassNames={{
                  hasAppt: "dp-cal-day-has-appt",
                }}
                className="dp-booking-day-picker dp-cal-day-picker"
              />
            </div>
            <ul className="dp-cal-legend" role="note">
              <li>
                <span className="dp-cal-legend-swatch dp-cal-legend-swatch--appt" />
                Has an appointment
              </li>
              {monthBounds ? (
                <li className="dp-cal-legend-range">
                  Through{" "}
                  {monthBounds.to.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </li>
              ) : null}
            </ul>
          </aside>

          <section className="dp-cal-panel dp-cal-panel--list">
            {nextAppt ? (
              <div className="dp-cal-next" aria-live="polite">
                <span className="dp-cal-next-label">Next up</span>
                <span className="dp-cal-next-main">
                  {formatRelativeDay(nextAppt._start, today)} · {nextAppt.startTime}
                </span>
                <span className="dp-cal-next-sub">
                  {nextAppt.servicesLabel || nextAppt.serviceName} ·{" "}
                  {nextAppt.businessName}
                </span>
              </div>
            ) : null}

            <div className="dp-cal-day-head">
              <h2 className="dp-cal-day-title">
                {effectiveDate
                  ? formatFullDay(effectiveDate)
                  : "Pick a date"}
              </h2>
              {effectiveDate && !isSameLocalDay(effectiveDate, today) ? (
                <button
                  type="button"
                  className="dp-cal-today-btn"
                  onClick={() => setSelectedDate(today)}
                >
                  Jump to today
                </button>
              ) : null}
            </div>

            {dayList.length === 0 ? (
              <div className="dp-cal-day-empty" role="status">
                <HiOutlineCalendar size={22} aria-hidden />
                <p>No appointments on this day.</p>
                <p className="dp-cal-day-empty-hint">
                  Pick another highlighted day, or book a new service.
                </p>
              </div>
            ) : (
              <ul className="dp-cal-day-list">
                {dayList.map((b) => {
                  const style = STATUS_STYLES[b.status] || {
                    label: b.status,
                    color: "#475569",
                    bg: "#f1f5f9",
                  };
                  const durationMin = Number(b.duration) || 0;
                  return (
                    <li key={b.id} className="dp-cal-appt">
                      <div className="dp-cal-appt-time">
                        <span className="dp-cal-appt-time-start">
                          {b.startTime}
                        </span>
                        {b.endTime ? (
                          <span className="dp-cal-appt-time-end">
                            – {b.endTime}
                          </span>
                        ) : null}
                        {durationMin > 0 ? (
                          <span className="dp-cal-appt-duration">
                            <HiOutlineClock size={12} aria-hidden />
                            {durationMin} min
                          </span>
                        ) : null}
                      </div>
                      <div className="dp-cal-appt-body">
                        <img
                          src={bookingImage(b)}
                          alt=""
                          className="dp-cal-appt-img"
                        />
                        <div className="dp-cal-appt-main">
                          <div className="dp-cal-appt-service">
                            {b.servicesLabel || b.serviceName}
                            {Array.isArray(b.services) && b.services.length > 1 ? (
                              <span className="dp-cal-appt-pill">
                                {b.services.length} services
                              </span>
                            ) : null}
                          </div>
                          <div className="dp-cal-appt-meta">
                            <span>
                              <HiOutlineOfficeBuilding
                                size={13}
                                aria-hidden
                              />
                              {b.businessName || "Business"}
                            </span>
                            {b.staffName ? (
                              <span>
                                <HiOutlineUser size={13} aria-hidden />
                                {b.staffName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span
                          className="dp-cal-appt-status"
                          style={{
                            color: style.color,
                            background: style.bg,
                          }}
                        >
                          {style.label}
                        </span>
                      </div>
                      <div className="dp-cal-appt-actions">
                        <Link
                          to="/dashboard/bookings"
                          className="dp-cal-appt-action"
                        >
                          Manage →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default MyCalendar;
