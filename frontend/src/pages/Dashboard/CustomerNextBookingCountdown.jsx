import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { HiOutlineCalendar, HiOutlineChevronRight } from "react-icons/hi";

/**
 * Local appointment start — same rules as MyBookings `parseBookingDateTime`.
 * @param {{ date: unknown, startTime?: string }} booking
 */
function parseBookingDateTime(booking) {
  const raw = booking.date;
  const st = String(booking.startTime || "00:00").trim();
  const timeParts = st.split(":");
  const hh = parseInt(timeParts[0], 10);
  const mm = parseInt(timeParts[1], 10) || 0;
  if (Number.isNaN(hh)) return null;

  let y;
  let mo;
  let day;
  if (typeof raw === "string") {
    const md = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (md) {
      y = parseInt(md[1], 10);
      mo = parseInt(md[2], 10) - 1;
      day = parseInt(md[3], 10);
    }
  }
  if (y == null || Number.isNaN(day)) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    y = d.getFullYear();
    mo = d.getMonth();
    day = d.getDate();
  }
  return new Date(y, mo, day, hh, mm, 0, 0);
}

function formatAppointmentHeadline(start) {
  const now = new Date();
  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const todayDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const diffDays = Math.round(
    (startDay - todayDay) / (24 * 60 * 60 * 1000),
  );
  const timeStr = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (diffDays === 0) return `Today · ${timeStr}`;
  if (diffDays === 1) return `Tomorrow · ${timeStr}`;
  return `${start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${timeStr}`;
}

function splitRemaining(ms) {
  if (ms <= 0) return null;
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  return { days, hours, minutes, seconds };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Live countdown to the customer’s single nearest upcoming booking (from dashboard overview).
 */
export default function CustomerNextBookingCountdown({
  booking,
  loading,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const start = useMemo(
    () => (booking ? parseBookingDateTime(booking) : null),
    [booking],
  );

  const durationMin = booking ? Number(booking.duration) || 0 : 0;
  const endMs = start
    ? start.getTime() +
      Math.max(1, durationMin) * 60 * 1000
    : null;

  let phase = "hidden";
  if (start && Number.isFinite(start.getTime())) {
    const s = start.getTime();
    if (nowMs < s) phase = "countdown";
    else if (endMs != null && nowMs <= endMs) phase = "live";
    else phase = "hidden";
  }

  if (loading) {
    return (
      <div
        className="dp-next-booking dp-next-booking--skeleton"
        role="status"
        aria-label="Loading next appointment"
      >
        <div className="dp-next-booking-inner">
          <span className="dp-skeleton dp-next-skel-title" />
          <div className="dp-next-units">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dp-next-unit">
                <span className="dp-skeleton dp-next-skel-num" />
                <span className="dp-skeleton dp-next-skel-label" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!booking || !start || phase === "hidden") {
    return null;
  }

  const headline = formatAppointmentHeadline(start);
  const serviceTitle =
    (booking.servicesLabel || "").trim() ||
    (booking.serviceName || "").trim() ||
    "Appointment";
  const biz = (booking.businessName || "").trim();
  const urgent =
    phase === "countdown" && start.getTime() - nowMs < 60 * 60 * 1000;

  if (phase === "live") {
    return (
      <div className="dp-next-booking dp-next-booking--live">
        <div className="dp-next-booking-inner">
          <div className="dp-next-booking-top">
            <span className="dp-next-eyebrow">
              <HiOutlineCalendar size={18} aria-hidden />
              Now
            </span>
            <h2 className="dp-next-title">Your appointment is underway</h2>
            <p className="dp-next-meta">
              {biz ? (
                <>
                  <strong>{biz}</strong>
                  <span className="dp-next-dot" aria-hidden>
                    ·
                  </span>
                </>
              ) : null}
              {serviceTitle}
            </p>
            <p className="dp-next-sub">{headline}</p>
          </div>
          <Link to="/dashboard/bookings" className="dp-next-cta">
            View booking
            <HiOutlineChevronRight size={18} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  const remainMs = start.getTime() - nowMs;
  const parts = splitRemaining(remainMs);
  if (!parts) {
    return null;
  }

  const { days, hours, minutes, seconds } = parts;
  const totalHours = days * 24 + hours;
  const secLeft = Math.floor(remainMs / 1000);
  const progress =
    totalHours < 24
      ? Math.min(1, Math.max(0, secLeft / 86400))
      : 0.85;

  const units = [];
  if (days > 0) {
    units.push({ label: "Days", value: String(days) });
  }
  units.push(
    { label: "Hours", value: pad2(hours) },
    { label: "Minutes", value: pad2(minutes) },
    { label: "Seconds", value: pad2(seconds) },
  );

  return (
    <div
      className={`dp-next-booking${urgent ? " dp-next-booking--urgent" : ""}`}
    >
      <div className="dp-next-booking-glow" aria-hidden />
      <div className="dp-next-booking-inner">
        <div className="dp-next-booking-top">
          <span className="dp-next-eyebrow">
            <HiOutlineCalendar size={18} aria-hidden />
            Next appointment
          </span>
          <h2 className="dp-next-title">Time until your visit</h2>
          <p className="dp-next-meta">
            {biz ? (
              <>
                <strong>{biz}</strong>
                <span className="dp-next-dot" aria-hidden>
                  ·
                </span>
              </>
            ) : null}
            {serviceTitle}
            {(booking.staffName || "").trim() ? (
              <>
                <span className="dp-next-dot" aria-hidden>
                  ·
                </span>
                {booking.staffName}
              </>
            ) : null}
          </p>
          <p className="dp-next-sub">{headline}</p>
        </div>

        <div
          className="dp-next-units"
          role="timer"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds until appointment`}
        >
          {units.map((u) => (
            <div key={u.label} className="dp-next-unit">
              <span className="dp-next-unit-value" tabIndex={-1}>
                {u.value}
              </span>
              <span className="dp-next-unit-label">{u.label}</span>
            </div>
          ))}
        </div>

        {totalHours < 24 ? (
          <div
            className="dp-next-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Share of 24 hours until appointment"
          >
            <div
              className="dp-next-progress-fill"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        ) : null}

        <Link to="/dashboard/bookings" className="dp-next-cta">
          Booking details
          <HiOutlineChevronRight size={18} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
