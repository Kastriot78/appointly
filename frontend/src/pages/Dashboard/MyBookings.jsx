import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, useParams, Navigate } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import { startOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-day-picker/style.css";
import { isTenantAccount, isStaffRole } from "../../utils/roles";
import {
  listMyBookings,
  listManagedBookings,
  cancelBooking,
  undoCancelBooking,
  getAvailability,
  rescheduleBooking,
  markBookingOutcome,
  notifyBookingsForDay,
  notifyBookingCustomer,
} from "../../api/bookings";
import { getApiErrorMessage } from "../../api/auth";
import { useToast } from "../../components/ToastContext";
import { getToken } from "../../auth/session";
import { getApiOrigin } from "../../api/http";
import { resolveMediaUrl } from "../../utils/assets";
import BookingsCalendarButton from "../../components/BookingsCalendarButton";
import AppTooltip from "../../components/AppTooltip";
import { HiOutlineSearch, HiOutlineCalendar } from "react-icons/hi";
import CustomSelect from "../../utils/CustomSelect";
import { DashboardSkeletonBookings } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { formatMoneyCompact } from "../../utils/currency";
import "./dashboard-pages.css";

const OFFLINE_BOOKING_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' rx='12' fill='#eef2ff'/><path d='M20 28h40v28H20z' fill='#fff'/><path d='M20 34h40' stroke='#6366f1' stroke-width='2'/><circle cx='32' cy='46' r='4' fill='#6366f1'/><circle cx='40' cy='46' r='4' fill='#22c55e'/><circle cx='48' cy='46' r='4' fill='#6366f1'/></svg>",
  );

const statusConfig = {
  confirmed: { label: "Confirmed", color: "#10b981", bg: "#ecfdf5" },
  completed: { label: "Completed", color: "#4f46e5", bg: "#eef2ff" },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "#fef2f2" },
  pending: { label: "Pending", color: "#f59e0b", bg: "#fffbeb" },
  pending_confirmation: {
    label: "Confirm time",
    color: "#d97706",
    bg: "#fffbeb",
  },
  expired: { label: "Expired", color: "#94a3b8", bg: "#f1f5f9" },
  no_show: { label: "No-show", color: "#64748b", bg: "#f1f5f9" },
  /**
   * Derived-only statuses — never persisted. Used in the UI to explain
   * why the Cancel button disappeared after the appointment start/end.
   */
  in_progress: { label: "In progress", color: "#0284c7", bg: "#e0f2fe" },
  past: { label: "Past", color: "#64748b", bg: "#f1f5f9" },
};

const FILTER_HINTS = {
  all: "Show every booking regardless of status",
  confirmed: "Only confirmed appointments",
  completed: "Only completed visits",
  cancelled: "Only cancelled bookings",
  no_show: "Only no-shows (client did not attend)",
  expired: "Only booking requests that expired before confirmation",
};

const CUSTOMER_SORT_OPTIONS = [
  {
    value: "priority_date",
    label: "Active first (recommended)",
  },
  { value: "date_asc", label: "Date (earliest first)" },
  { value: "date_desc", label: "Date (latest first)" },
  { value: "price_desc", label: "Price (highest first)" },
  { value: "price_asc", label: "Price (lowest first)" },
];

/** Customer list: actionable statuses on top; history below (see `applyCustomerSort`). */
function customerPrimarySortBucket(status) {
  const s = String(status || "");
  if (
    s === "confirmed" ||
    s === "pending" ||
    s === "pending_confirmation"
  ) {
    return 0;
  }
  return 1;
}

const STATUS_BADGE_HINTS = {
  confirmed: "Confirmed — waiting for the appointment",
  completed: "Visit completed",
  cancelled: "This booking was cancelled",
  pending: "Awaiting confirmation",
  pending_confirmation: "Confirm or adjust the proposed time",
  expired:
    "This was an alternative slot (not the client’s first choice) or the hold expired. The client didn’t confirm the suggested time in time. After the slot ends, you can mark completed or no-show if you need to record what happened.",
  no_show: "Marked as no-show",
  in_progress: "The appointment is happening right now",
  past: "The appointment time has passed — the business will mark it completed or no-show shortly",
};

/** Client asked for a different time than the slot stored on the booking (alternative hold). */
function slotDiffersFromRequested(requestedStartTime, heldStartTime) {
  const r = String(requestedStartTime || "").trim();
  const h = String(heldStartTime || "").trim();
  if (!r) return false;
  return r !== h;
}

function bookingCardImage(b) {
  const fromLogo = resolveMediaUrl(b.businessLogo);
  if (fromLogo) return fromLogo;
  const fromStaff = resolveMediaUrl(b.staffAvatar);
  if (fromStaff) return fromStaff;
  return OFFLINE_BOOKING_FALLBACK;
}

function BookingCardThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? OFFLINE_BOOKING_FALLBACK : src}
      alt={alt}
      className="dp-booking-img"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Appointment start in local time. Prefer YYYY-MM-DD from the stored value so the
 * calendar day matches the API (avoids UTC vs local shifting the day on ISO strings).
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

/** Start time is still in the future (reschedule / cancel). */
function isUpcoming(booking) {
  const t = parseBookingDateTime(booking);
  if (!t) return false;
  return t > new Date();
}

function bookingSlotEnd(booking) {
  const start = parseBookingDateTime(booking);
  if (!start) return null;
  const dur = Number(booking.duration) || 0;
  return new Date(start.getTime() + dur * 60 * 1000);
}

function isSlotEnded(booking) {
  const end = bookingSlotEnd(booking);
  if (!end) return false;
  return end <= new Date();
}

/**
 * Returns the status key we actually want to render — identical to the stored
 * status most of the time, but for `confirmed` / `pending` bookings that have
 * slipped past their start time we swap in a time-aware label so the user
 * understands why Cancel disappeared. Does NOT mutate the booking.
 *
 * - start <= now < end  → "in_progress"
 * - now >= end          → "past"
 */
function displayStatusKey(booking) {
  if (!booking) return "pending";
  const stored = booking.status;
  if (stored !== "confirmed" && stored !== "pending") return stored;

  const start = parseBookingDateTime(booking);
  if (!start) return stored;
  const now = new Date();
  if (start > now) return stored;

  const end = bookingSlotEnd(booking);
  if (end && end > now) return "in_progress";
  return "past";
}

/** Local calendar date from booking (ignore time). */
function bookingLocalDate(booking) {
  const d = new Date(booking.date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatYmdFromDate(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Stable YYYY-MM-DD for a list row (matches date chips / API). */
function bookingYmdFromRow(booking) {
  const raw = booking.date;
  if (
    raw != null &&
    typeof raw === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(raw)
  ) {
    return raw.slice(0, 10);
  }
  const d = bookingLocalDate(booking);
  return d && !Number.isNaN(d.getTime()) ? formatYmdFromDate(d) : "";
}

function formatYmdLongLabel(ymd) {
  const parts = String(ymd || "")
    .trim()
    .split("-")
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const NOTIFY_EMAIL_STATUSES = new Set([
  "confirmed",
  "pending",
  "pending_confirmation",
]);

function isSameCalendarDayLocal(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function applyPastTimeFilter(slots, selectedDate) {
  const now = new Date();
  if (!isSameCalendarDayLocal(selectedDate, now)) return slots;
  const nowM = now.getHours() * 60 + now.getMinutes();
  return slots.map((s) => {
    const parts = String(s.time).split(":");
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return s;
    const slotM = hh * 60 + mm;
    if (slotM <= nowM) return { ...s, available: false };
    return s;
  });
}

function isValidMongoId(s) {
  if (s == null) return false;
  const t = String(s).trim();
  return /^[a-f0-9]{24}$/i.test(t);
}

/** Sort oldest → newest (by local start, then id). */
function sortBookingsChronologicallyAsc(list) {
  return [...list].sort((a, b) => {
    const ta = parseBookingDateTime(a)?.getTime() ?? 0;
    const tb = parseBookingDateTime(b)?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Customer "My Bookings" sort: date or price (with stable tie-breakers). */
function applyCustomerSort(list, sortKey) {
  const items = [...list];
  const cmpId = (a, b) => String(a.id).localeCompare(String(b.id));
  switch (sortKey) {
    case "priority_date":
      return items.sort((a, b) => {
        const ba = customerPrimarySortBucket(a.status);
        const bb = customerPrimarySortBucket(b.status);
        if (ba !== bb) return ba - bb;
        const ta = parseBookingDateTime(a)?.getTime() ?? 0;
        const tb = parseBookingDateTime(b)?.getTime() ?? 0;
        if (ba === 0) {
          if (ta !== tb) return ta - tb;
        } else {
          if (tb !== ta) return tb - ta;
        }
        return cmpId(a, b);
      });
    case "date_desc":
      return items.sort((a, b) => {
        const ta = parseBookingDateTime(a)?.getTime() ?? 0;
        const tb = parseBookingDateTime(b)?.getTime() ?? 0;
        if (tb !== ta) return tb - ta;
        return cmpId(a, b);
      });
    case "price_desc":
      return items.sort((a, b) => {
        const pa = Number(a.price) || 0;
        const pb = Number(b.price) || 0;
        if (pb !== pa) return pb - pa;
        const ta = parseBookingDateTime(a)?.getTime() ?? 0;
        const tb = parseBookingDateTime(b)?.getTime() ?? 0;
        if (ta !== tb) return ta - tb;
        return cmpId(a, b);
      });
    case "price_asc":
      return items.sort((a, b) => {
        const pa = Number(a.price) || 0;
        const pb = Number(b.price) || 0;
        if (pa !== pb) return pa - pb;
        const ta = parseBookingDateTime(a)?.getTime() ?? 0;
        const tb = parseBookingDateTime(b)?.getTime() ?? 0;
        if (ta !== tb) return ta - tb;
        return cmpId(a, b);
      });
    case "date_asc":
    default:
      return sortBookingsChronologicallyAsc(items);
  }
}

/** Lowercase haystack for search (service, staff, business, time, price). */
function bookingSearchHaystack(booking) {
  const bits = [
    booking.customerName,
    booking.customerEmail,
    booking.requestedStartTime,
    booking.serviceName,
    booking.staffName,
    booking.businessName,
    booking.startTime,
    booking.date != null ? String(booking.date) : "",
    booking.price != null ? String(booking.price) : "",
  ];
  return bits
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x).toLowerCase())
    .join(" ");
}

/** Same party that cancelled may undo within the server’s undo window. */
function canUndoCancellation(booking, usesManagedBookings) {
  if (booking.status !== "cancelled") return false;
  const until = booking.undoCancelUntil;
  if (!until) return false;
  if (new Date(until).getTime() <= Date.now()) return false;
  const src = String(booking.cancellationSource || "").trim();
  if (usesManagedBookings) return src === "staff";
  return src === "customer";
}

function undoCancelSecondsRemaining(booking) {
  const until = booking.undoCancelUntil;
  if (!until) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(until).getTime() - Date.now()) / 1000),
  );
}

const MyBookings = () => {
  const { user, activeWorkspaceId } = useOutletContext();
  const { showToast } = useToast();
  const isTenant = isTenantAccount(user?.role);
  const isStaff = isStaffRole(user?.role);
  /** Tenant / staff: managed bookings API; sidebar scopes filter client-side. */
  const usesManagedBookings = isTenant || isStaff;
  const [filter, setFilter] = useState("all");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [undoingId, setUndoingId] = useState(null);
  /** Booking user is about to cancel (confirmation modal). */
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  /** Reschedule flow */
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState(null);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  /** From availability API: staff/business hours for selected day + service duration */
  const [rescheduleMeta, setRescheduleMeta] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customerSort, setCustomerSort] = useState(() =>
    isTenant || isStaff ? "date_asc" : "priority_date",
  );
  const [markingOutcomeId, setMarkingOutcomeId] = useState(null);
  /** Tenant/staff — email client about a change (e.g. staff sick day). */
  const [emailNotifyModal, setEmailNotifyModal] = useState(null);
  const [emailNotifySubject, setEmailNotifySubject] = useState("");
  const [emailNotifyBody, setEmailNotifyBody] = useState("");
  const [emailNotifySending, setEmailNotifySending] = useState(false);
  /**
   * Bumps every 30 seconds so `displayStatusKey` / `isUpcoming` re-evaluate
   * without requiring a data refetch — this is what flips the chip from
   * "Confirmed" → "In progress" → "Past" and removes the Cancel button the
   * moment the appointment start time passes.
   */
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const needsFastTick = bookings.some(
      (b) =>
        b.status === "cancelled" &&
        b.undoCancelUntil &&
        new Date(b.undoCancelUntil).getTime() > Date.now(),
    );
    const ms = needsFastTick ? 1000 : 30_000;
    const id = setInterval(() => setClockTick((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [bookings]);

  const currentUserId =
    user?.id != null ? String(user.id) : String(user?._id ?? "");
  const { listScope: listScopeParam } = useParams();

  /** Business / staff sidebar — /bookings, /all, /completed, /no-shows, /cancelled */
  const listScope = useMemo(() => {
    if (!usesManagedBookings) return "active";
    if (!listScopeParam) return "active";
    if (listScopeParam === "all") return "history";
    if (listScopeParam === "completed") return "completed";
    if (listScopeParam === "no-shows") return "no_show";
    if (listScopeParam === "cancelled") return "cancelled";
    return "active";
  }, [usesManagedBookings, listScopeParam]);

  const invalidManagedScope =
    usesManagedBookings &&
    listScopeParam != null &&
    !["all", "completed", "no-shows", "cancelled"].includes(listScopeParam);

  /** Tenant: filter by calendar day or weekday (Sat = 6). */
  const [datePreset, setDatePreset] = useState("all"); // 'all' | 'today' | 'pick'
  const [pickDate, setPickDate] = useState("");
  const [weekdayFilter, setWeekdayFilter] = useState(null); // null | 0–6

  const loadBookings = useCallback(
    async (options = {}) => {
      const silent = Boolean(options.silent);
      if (!silent) {
        setLoading(true);
      }
      setLoadError(null);
      try {
        const params = silent ? { _t: Date.now() } : undefined;
        const { data } = usesManagedBookings
          ? await listManagedBookings(params)
          : await listMyBookings(params);
        setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      } catch (err) {
        setLoadError(getApiErrorMessage(err));
        if (!silent) {
          setBookings([]);
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [usesManagedBookings],
  );

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    const apiOrigin = getApiOrigin();
    const params = new URLSearchParams();
    params.set("token", token);
    if (usesManagedBookings && activeWorkspaceId) {
      params.set("workspaceId", String(activeWorkspaceId));
    }
    const es = new EventSource(
      `${apiOrigin}/api/bookings/stream?${params.toString()}`,
    );
    let timer = null;
    const scheduleReload = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        loadBookings({ silent: true });
      }, 250);
    };
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data || "{}");
        if (!msg?.type || msg.type === "stream.ready") return;
        scheduleReload();
      } catch {
        // ignore malformed messages
      }
    };
    es.onerror = () => {
      // browser auto-reconnect handles transient drops
    };
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [usesManagedBookings, activeWorkspaceId, loadBookings]);

  useEffect(() => {
    setFilter("all");
    setSearchQuery("");
  }, [listScopeParam]);

  useEffect(() => {
    if (!cancelModalBooking) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !cancellingId) setCancelModalBooking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [cancelModalBooking, cancellingId]);

  useEffect(() => {
    if (!emailNotifyModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !emailNotifySending) {
        setEmailNotifyModal(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [emailNotifyModal, emailNotifySending]);

  const scopeFilteredBookings = useMemo(() => {
    if (!usesManagedBookings) return bookings;
    /** Sidebar scope — managed list is filtered client-side. */
    const activePipelineStatuses = new Set([
      "confirmed",
      "pending",
      "pending_confirmation",
      "expired",
    ]);
    if (listScope === "active") {
      return bookings.filter((b) => activePipelineStatuses.has(b.status));
    }
    if (listScope === "history") {
      /** “All bookings” = every booking regardless of status (full history). */
      return bookings;
    }
    if (listScope === "completed") {
      return bookings.filter((b) => b.status === "completed");
    }
    if (listScope === "no_show") {
      return bookings.filter((b) => b.status === "no_show");
    }
    if (listScope === "cancelled") {
      return bookings.filter((b) => b.status === "cancelled");
    }
    return bookings;
  }, [bookings, usesManagedBookings, listScope]);

  const dateFilteredBookings = useMemo(() => {
    if (datePreset === "today") {
      const t = new Date();
      return scopeFilteredBookings.filter((b) => {
        const d = bookingLocalDate(b);
        return d && isSameLocalDay(d, t);
      });
    }

    if (datePreset === "pick" && pickDate) {
      const parts = pickDate.split("-").map(Number);
      if (parts.length === 3) {
        const target = new Date(parts[0], parts[1] - 1, parts[2]);
        return scopeFilteredBookings.filter((b) => {
          const d = bookingLocalDate(b);
          return d && isSameLocalDay(d, target);
        });
      }
    }

    if (datePreset === "all" && weekdayFilter !== null) {
      return scopeFilteredBookings.filter((b) => {
        const d = bookingLocalDate(b);
        return d && d.getDay() === weekdayFilter;
      });
    }

    return scopeFilteredBookings;
  }, [scopeFilteredBookings, datePreset, pickDate, weekdayFilter]);

  const bulkNotifyYmd = useMemo(() => {
    if (datePreset === "today") return formatYmdFromDate(new Date());
    if (datePreset === "pick" && pickDate) return pickDate;
    return null;
  }, [datePreset, pickDate]);

  /** Bookings on the focused calendar day that can receive a sick-day / closure email. */
  const bulkNotifyTargetBookings = useMemo(() => {
    if (!usesManagedBookings || !bulkNotifyYmd) return [];
    return scopeFilteredBookings.filter((b) => {
      if (!NOTIFY_EMAIL_STATUSES.has(b.status)) return false;
      if (!String(b.customerEmail || "").trim()) return false;
      if (isSlotEnded(b)) return false;
      return bookingYmdFromRow(b) === bulkNotifyYmd;
    });
  }, [usesManagedBookings, bulkNotifyYmd, scopeFilteredBookings]);

  const bulkNotifyUniqueEmails = useMemo(() => {
    const s = new Set();
    for (const b of bulkNotifyTargetBookings) {
      const e = String(b.customerEmail || "").trim().toLowerCase();
      if (e) s.add(e);
    }
    return s.size;
  }, [bulkNotifyTargetBookings]);

  const searchDisabled =
    loading || dateFilteredBookings.length === 0;

  useEffect(() => {
    if (dateFilteredBookings.length === 0) setSearchQuery("");
  }, [dateFilteredBookings.length]);

  const filtered = useMemo(() => {
    const base = dateFilteredBookings;
    if (filter === "all") return base;
    return base.filter((b) => b.status === filter);
  }, [dateFilteredBookings, filter]);

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((b) => bookingSearchHaystack(b).includes(q));
  }, [filtered, searchQuery]);

  const bookingsSortSelectOptions = useMemo(
    () =>
      usesManagedBookings
        ? CUSTOMER_SORT_OPTIONS.filter((o) => o.value !== "priority_date")
        : CUSTOMER_SORT_OPTIONS,
    [usesManagedBookings],
  );

  useEffect(() => {
    if (usesManagedBookings && customerSort === "priority_date") {
      setCustomerSort("date_asc");
    }
  }, [usesManagedBookings, customerSort]);

  /** User-selected sort (date or price); customers default to active-first. */
  const sortedFiltered = useMemo(
    () => applyCustomerSort(searchFiltered, customerSort),
    [searchFiltered, customerSort],
  );

  const pageHeader = useMemo(() => {
    if (!usesManagedBookings) {
      return {
        title: "My Bookings",
        subtitle: "Only your appointments — no one else can see them here",
      };
    }
    const total = bookings.length;
    const totalLabel = `${total} total booking${total === 1 ? "" : "s"}`;
    if (isStaff) {
      switch (listScope) {
        case "history":
          return {
            title: "All bookings",
            subtitle: `Every booking across every status — ${totalLabel} on your schedule`,
          };
        case "completed":
          return {
            title: "Completed",
            subtitle: "Completed visits on your schedule",
          };
        case "no_show":
          return {
            title: "No-shows",
            subtitle: "No-shows on your schedule",
          };
        case "cancelled":
          return {
            title: "Cancelled",
            subtitle: "Appointments that were cancelled",
          };
        default:
          return {
            title: "My Bookings",
            subtitle:
              "Confirmed, pending, and expired — excludes cancelled, completed, and no-shows",
          };
      }
    }
    switch (listScope) {
      case "history":
        return {
          title: "All bookings",
          subtitle: `Every booking across every status — ${totalLabel} at your business`,
        };
      case "completed":
        return {
          title: "Completed",
          subtitle: "Completed visits at your business",
        };
      case "no_show":
        return {
          title: "No-shows",
          subtitle: "Appointments marked no-show at your business",
        };
      case "cancelled":
        return {
          title: "Cancelled",
          subtitle: "Appointments that were cancelled at your business",
        };
      default:
        return {
          title: "My Bookings",
          subtitle:
            "Confirmed, pending, and expired — excludes cancelled, completed, and no-shows",
        };
    }
  }, [usesManagedBookings, isStaff, listScope, bookings.length]);

  const counts = useMemo(() => {
    const c = {
      all: dateFilteredBookings.length,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      expired: 0,
    };
    for (const b of dateFilteredBookings) {
      if (b.status === "confirmed") c.confirmed += 1;
      if (b.status === "completed") c.completed += 1;
      if (b.status === "cancelled") c.cancelled += 1;
      if (b.status === "no_show") c.no_show += 1;
      if (b.status === "expired") c.expired += 1;
    }
    return c;
  }, [dateFilteredBookings]);

  const formatDate = (booking) => {
    const d = new Date(booking.date);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const performCancel = async (id) => {
    setCancellingId(id);
    setLoadError(null);
    try {
      const { data } = await cancelBooking(id);
      setCancelModalBooking(null);
      if (data?.booking) {
        setBookings((prev) =>
          prev.map((b) =>
            String(b.id) === String(data.booking.id)
              ? { ...b, ...data.booking }
              : b,
          ),
        );
      }
      await loadBookings({ silent: true });
      showToast(
        "Booking cancelled. You can undo for about 30 seconds.",
        "success",
      );
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setCancellingId(null);
    }
  };

  const performUndoCancel = async (id) => {
    setUndoingId(id);
    setLoadError(null);
    try {
      const { data } = await undoCancelBooking(id);
      if (data?.booking) {
        setBookings((prev) =>
          prev.map((b) =>
            String(b.id) === String(data.booking.id)
              ? { ...b, ...data.booking }
              : b,
          ),
        );
      }
      await loadBookings({ silent: true });
      showToast("Cancellation undone. Your booking is back.", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setUndoingId(null);
    }
  };

  const performMarkOutcome = async (id, status) => {
    setMarkingOutcomeId(id);
    setLoadError(null);
    try {
      const { data } = await markBookingOutcome(id, status);
      showToast(
        status === "completed"
          ? "Marked as completed."
          : "Marked as no-show.",
        "success",
      );
      if (data?.booking) {
        setBookings((prev) =>
          prev.map((b) =>
            String(b.id) === String(data.booking.id)
              ? { ...b, ...data.booking }
              : b,
          ),
        );
      }
      await loadBookings({ silent: true });
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setMarkingOutcomeId(null);
    }
  };

  const openEmailNotifyForBooking = (booking) => {
    setEmailNotifySubject("");
    setEmailNotifyBody("");
    setEmailNotifyModal({ mode: "single", booking });
  };

  const openEmailNotifyForDay = () => {
    if (!bulkNotifyYmd) return;
    setEmailNotifySubject("");
    setEmailNotifyBody("");
    setEmailNotifyModal({ mode: "day", dateYmd: bulkNotifyYmd });
  };

  const performEmailNotify = async () => {
    const subj = emailNotifySubject.trim();
    const body = emailNotifyBody.trim();
    if (!subj || !body) {
      showToast("Subject and message are required.", "error");
      return;
    }
    if (!emailNotifyModal) return;
    setEmailNotifySending(true);
    try {
      if (emailNotifyModal.mode === "single") {
        await notifyBookingCustomer(emailNotifyModal.booking.id, {
          subject: subj,
          description: body,
        });
        showToast("Email sent to the client.", "success");
      } else {
        const payload = {
          date: emailNotifyModal.dateYmd,
          subject: subj,
          description: body,
        };
        if (activeWorkspaceId) {
          payload.businessId = activeWorkspaceId;
        }
        const { data } = await notifyBookingsForDay(payload);
        const n = data?.delivered ?? 0;
        const u = data?.uniqueRecipients;
        showToast(
          u != null
            ? `Sent ${n} email(s) to ${u} recipient(s).`
            : `Sent ${n} email(s).`,
          "success",
        );
      }
      setEmailNotifyModal(null);
      setEmailNotifySubject("");
      setEmailNotifyBody("");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setEmailNotifySending(false);
    }
  };

  const openReschedule = (b) => {
    const d = new Date(b.date);
    setRescheduleDate(Number.isNaN(d.getTime()) ? new Date() : d);
    setRescheduleTime(b.startTime || null);
    setRescheduleSlots([]);
    setRescheduleSlotsError(null);
    setRescheduleMeta(null);
    setRescheduleTarget(b);
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    setRescheduleSubmitting(true);
    try {
      const { data } = await rescheduleBooking(rescheduleTarget.id, {
        date: formatYmdFromDate(rescheduleDate),
        startTime: rescheduleTime,
      });
      showToast("Booking rescheduled.", "success");
      setRescheduleTarget(null);
      if (data?.booking) {
        setBookings((prev) =>
          prev.map((b) =>
            String(b.id) === String(data.booking.id)
              ? { ...b, ...data.booking }
              : b,
          ),
        );
      }
      await loadBookings({ silent: true });
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  useEffect(() => {
    if (!rescheduleTarget || !rescheduleDate) return;
    const b = rescheduleTarget;
    const businessId = String(b.businessId || "");
    const serviceId = String(b.serviceId || "");
    const staffId = String(b.staffId || "");
    if (
      !isValidMongoId(businessId) ||
      !isValidMongoId(serviceId) ||
      !isValidMongoId(staffId)
    ) {
      setRescheduleSlotsError(
        "This booking is missing valid staff or service data. Refresh the page and try again.",
      );
      setRescheduleSlots([]);
      setRescheduleMeta(null);
      setRescheduleSlotsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setRescheduleSlotsLoading(true);
      setRescheduleSlotsError(null);
      setRescheduleMeta(null);
      try {
        const dateStr = formatYmdFromDate(rescheduleDate);
        const { data } = await getAvailability({
          businessId,
          serviceId,
          staffId,
          date: dateStr,
          excludeBookingId: b.id,
        });
        if (cancelled) return;
        const raw = Array.isArray(data.slots) ? data.slots : [];
        setRescheduleSlots(applyPastTimeFilter(raw, rescheduleDate));
        setRescheduleMeta({
          effectiveWindow: data.effectiveWindow ?? null,
          duration: typeof data.duration === "number" ? data.duration : null,
        });
      } catch (err) {
        if (!cancelled) {
          setRescheduleSlotsError(getApiErrorMessage(err));
          setRescheduleSlots([]);
          setRescheduleMeta(null);
        }
      } finally {
        if (!cancelled) setRescheduleSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rescheduleTarget, rescheduleDate]);

  useEffect(() => {
    if (!rescheduleTarget || !rescheduleTime || !rescheduleSlots.length) return;
    const slot = rescheduleSlots.find((s) => s.time === rescheduleTime);
    if (!slot || !slot.available) setRescheduleTime(null);
  }, [rescheduleSlots, rescheduleTime, rescheduleTarget]);

  useEffect(() => {
    if (!rescheduleTarget) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !rescheduleSubmitting) {
        setRescheduleTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [rescheduleTarget, rescheduleSubmitting]);

  if (!usesManagedBookings && listScopeParam) {
    return <Navigate to="/dashboard/bookings" replace />;
  }

  if (invalidManagedScope) {
    return <Navigate to="/dashboard/bookings" replace />;
  }

  return (
    <div className="dp-page">
      <div className="dp-header dp-header--row">
        <div>
          <h1 className="dp-title">{pageHeader.title}</h1>
          <p className="dp-subtitle">{pageHeader.subtitle}</p>
        </div>
        {!loadError ? (
        <div
          className={`dp-bookings-search${searchDisabled ? " dp-bookings-search--disabled" : ""}`}
          title={
            searchDisabled
              ? loading
                ? "Loading bookings…"
                : "No bookings in this view to search yet."
              : undefined
          }
        >
          <HiOutlineSearch size={20} aria-hidden />
          <input
            id="dp-bookings-search-input"
            type="search"
            className="form-control dp-bookings-search-input"
            placeholder={
              usesManagedBookings
                ? "Search clients, services, staff…"
                : "Search your bookings…"
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={searchDisabled}
          />
        </div>
        ) : null}
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel
          message={loadError}
          onRetry={() => loadBookings()}
        />
      ) : (
        <>
      {!loading ? (
        <div
          className="dp-date-filters"
          aria-label={
            usesManagedBookings
              ? "Filter bookings by date"
              : "Filter your bookings by date"
          }
        >
          <div className="dp-date-filters-row">
            <span className="dp-date-filters-label">Date</span>
            <button
              type="button"
              className={`dp-date-chip ${datePreset === "all" && weekdayFilter === null ? "active" : ""}`}
              onClick={() => {
                setDatePreset("all");
                setPickDate("");
                setWeekdayFilter(null);
              }}
            >
              All dates
            </button>
            <button
              type="button"
              className={`dp-date-chip ${datePreset === "today" ? "active" : ""}`}
              onClick={() => {
                setDatePreset("today");
                setPickDate("");
                setWeekdayFilter(null);
              }}
            >
              Today
            </button>
            <BookingsCalendarButton
              pickDate={pickDate}
              datePreset={datePreset}
              active={datePreset === "pick" && Boolean(pickDate)}
              onPickYmd={(ymd) => {
                setPickDate(ymd);
                setDatePreset("pick");
                setWeekdayFilter(null);
              }}
            />
          </div>
          <div className="dp-date-filters-row dp-date-filters-row--week">
            <span className="dp-date-filters-label">By weekday</span>
            <button
              type="button"
              className={`dp-date-chip dp-date-chip--sm ${datePreset === "all" && weekdayFilter === null ? "active" : ""}`}
              onClick={() => {
                setDatePreset("all");
                setPickDate("");
                setWeekdayFilter(null);
              }}
            >
              Any
            </button>
            {WEEKDAY_SHORT.map((label, day) => (
              <AppTooltip key={label} content={`Every ${label}`}>
                <button
                  type="button"
                  className={`dp-date-chip dp-date-chip--sm ${datePreset === "all" && weekdayFilter === day ? "active" : ""}`}
                  onClick={() => {
                    setDatePreset("all");
                    setPickDate("");
                    setWeekdayFilter(day);
                  }}
                >
                  {label}
                </button>
              </AppTooltip>
            ))}
          </div>
        </div>
      ) : null}

      {usesManagedBookings && bulkNotifyYmd ? (
        <div className="dp-bulk-notify-bar">
          <p>
            <strong>Notify clients</strong> for{" "}
            <strong>{formatYmdLongLabel(bulkNotifyYmd)}</strong>
            {bulkNotifyUniqueEmails > 0
              ? ` — ${bulkNotifyUniqueEmails} recipient(s) with email (${bulkNotifyTargetBookings.length} booking${bulkNotifyTargetBookings.length === 1 ? "" : "s"}).`
              : " — no active bookings with a client email on this day in the current view."}
          </p>
          <button
            type="button"
            disabled={
              emailNotifySending || bulkNotifyUniqueEmails === 0
            }
            onClick={openEmailNotifyForDay}
          >
            Email all on this day
          </button>
        </div>
      ) : null}

      <div className="dp-filters">
        {[
          "all",
          "confirmed",
          "completed",
          "cancelled",
          "no_show",
          "expired",
        ].map((f) => (
          <AppTooltip key={f} content={FILTER_HINTS[f]}>
            <button
              type="button"
              className={`dp-filter-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : statusConfig[f]?.label}
              <span className="dp-filter-count">
                {f === "all" ? counts.all : (counts[f] ?? 0)}
              </span>
            </button>
          </AppTooltip>
        ))}
      </div>

      <div className="dp-bookings-sort-row">
        <span className="dp-bookings-sort-label" id="dp-customer-sort-label">
          Sort by
        </span>
        <div
          className="dp-bookings-sort-cselect"
          aria-labelledby="dp-customer-sort-label"
        >
          <CustomSelect
            options={bookingsSortSelectOptions}
            value={customerSort}
            onChange={setCustomerSort}
            placeholder="Sort bookings…"
          />
        </div>
      </div>

      <div className="dp-bookings-list">
        {loading ? (
          <DashboardSkeletonBookings rows={6} />
        ) : (
          <>
            {sortedFiltered.map((booking) => {
            const displayKey = displayStatusKey(booking);
            const status =
              statusConfig[displayKey] ||
              statusConfig[booking.status] ||
              statusConfig.pending;
            const upcoming = isUpcoming(booking);
            const bookingCustomerId =
              booking.customerId != null ? String(booking.customerId) : "";
            /** Customers: /mine rows are always yours. Tenants: strict match for reschedule-as-client. */
            const viewerIsBookingCustomer = usesManagedBookings
              ? Boolean(
                  currentUserId &&
                    bookingCustomerId &&
                    currentUserId === bookingCustomerId,
                )
              : Boolean(
                  currentUserId &&
                    (!bookingCustomerId ||
                      currentUserId === bookingCustomerId),
                );
            /** Reschedule: only the client who booked, before the slot starts. */
            const canReschedule =
              upcoming &&
              (booking.status === "confirmed" ||
                booking.status === "pending") &&
              viewerIsBookingCustomer;
            /**
             * Cancel rules:
             *  - Status must still allow it (confirmed / pending / pending_confirmation).
             *  - Customer can cancel only BEFORE the appointment starts — once the
             *    slot is in progress or over, they must contact the business.
             *  - Tenant/admin can cancel up until the slot actually ends (edge cases
             *    like power outage, client walked out, etc.).
             */
            const statusAllowsCancel =
              booking.status === "confirmed" ||
              booking.status === "pending" ||
              booking.status === "pending_confirmation";
            const slotNotStarted = upcoming;
            const slotNotEnded = !isSlotEnded(booking);
            const viewerCanCancel = viewerIsBookingCustomer
              ? slotNotStarted
              : isTenant
                ? slotNotEnded
                : false;
            const canCancel = statusAllowsCancel && viewerCanCancel;
            const canMarkOutcome =
              isTenant &&
              (booking.status === "confirmed" ||
                booking.status === "expired") &&
              isSlotEnded(booking);
            const canEmailClient =
              usesManagedBookings &&
              NOTIFY_EMAIL_STATUSES.has(booking.status) &&
              Boolean(booking.customerEmail?.trim()) &&
              !isSlotEnded(booking);

            return (
              <div key={booking.id} className="dp-booking-card">
                <BookingCardThumb src={bookingCardImage(booking)} alt="" />
                <div className="dp-booking-info">
                  <div className="dp-booking-top">
                    {(() => {
                      const svcList = Array.isArray(booking.services)
                        ? booking.services
                        : [];
                      const hasMulti = svcList.length > 1;
                      const titleName =
                        booking.servicesLabel ||
                        (hasMulti
                          ? svcList.map((s) => s.name).filter(Boolean).join(" + ")
                          : booking.serviceName) ||
                        "Service";
                      const tipBody = hasMulti
                        ? `Booked services (${svcList.length}): ${svcList.map((s) => s.name).join(", ")}`
                        : `Booked service: ${booking.serviceName || "—"}`;
                      return (
                        <AppTooltip content={tipBody}>
                          <h3>
                            {titleName}
                            {hasMulti ? (
                              <span
                                className="dp-booking-multi-pill"
                                aria-label={`${svcList.length} services combined`}
                              >
                                {svcList.length} services
                              </span>
                            ) : null}
                          </h3>
                        </AppTooltip>
                      );
                    })()}
                    <AppTooltip
                      content={
                        STATUS_BADGE_HINTS[booking.status] || status.label
                      }
                    >
                      <span
                        className="dp-status"
                        style={{ color: status.color, background: status.bg }}
                      >
                        {status.label}
                      </span>
                    </AppTooltip>
                  </div>
                  <p
                    className={`dp-booking-business ${usesManagedBookings ? "dp-booking-business--tenant" : ""}`}
                  >
                    {usesManagedBookings ? (
                      <>
                        <span className="dp-booking-detail-row">
                          <span className="dp-booking-kicker">Booked by</span>{" "}
                          <AppTooltip
                            content={
                              (booking.customerName?.trim() ||
                                booking.customerEmail?.trim())
                                ? `Customer: ${[booking.customerName?.trim(), booking.customerEmail?.trim()].filter(Boolean).join(" — ")}`
                                : "Customer name not provided"
                            }
                          >
                            <span className="dp-booking-client-name">
                              {booking.customerName?.trim() || "Client"}
                              {booking.customerEmail?.trim()
                                ? ` - ${booking.customerEmail.trim()}`
                                : ""}
                            </span>
                          </AppTooltip>
                        </span>
                        <span className="dp-booking-detail-row">
                          <span className="dp-booking-kicker">Staff</span>{" "}
                          <AppTooltip
                            content={
                              booking.staffName
                                ? `Assigned staff: ${booking.staffName}`
                                : "Staff"
                            }
                          >
                            <span>{booking.staffName}</span>
                          </AppTooltip>
                        </span>
                      </>
                    ) : (
                      <>
                        <AppTooltip
                          content={
                            booking.businessName
                              ? `Business: ${booking.businessName}`
                              : "Business"
                          }
                        >
                          <span>{booking.businessName}</span>
                        </AppTooltip>
                        {" · "}
                        <AppTooltip
                          content={
                            booking.staffName
                              ? `Staff: ${booking.staffName}`
                              : "Staff"
                          }
                        >
                          <span>{booking.staffName}</span>
                        </AppTooltip>
                      </>
                    )}
                  </p>
                  {slotDiffersFromRequested(
                    booking.requestedStartTime,
                    booking.startTime,
                  ) ? (
                    <p className="dp-booking-requested-vs-held">
                      <span className="dp-booking-kicker">Requested time</span>{" "}
                      {String(booking.requestedStartTime).trim()}
                      {" · "}
                      <span className="dp-booking-kicker">Held slot</span>{" "}
                      {booking.startTime}
                    </p>
                  ) : null}
                  {usesManagedBookings && booking.status === "expired" ? (
                    <p className="dp-booking-status-note">
                      This happens when the client’s first choice wasn’t available (or was taken
                      while booking) and the system held a nearby time instead — or the client
                      declined that slot. They must confirm that alternative; if they don’t,
                      the hold expires. After the slot time passes, you can mark completed or
                      no-show if needed.
                    </p>
                  ) : null}
                  <div className="dp-booking-meta">
                    <span className="dp-meta-item">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <rect
                          x="1.5"
                          y="2"
                          width="11"
                          height="10.5"
                          rx="1.5"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                        <path
                          d="M1.5 5H12.5"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                        <path
                          d="M4.5 0.5V3"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9.5 0.5V3"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                      </svg>
                      {formatDate(booking)}
                    </span>
                    <span className="dp-meta-item">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <circle
                          cx="7"
                          cy="7"
                          r="5.5"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                        <path
                          d="M7 4V7L9 8.5"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                      </svg>
                      {booking.startTime} · {booking.duration} min
                    </span>
                    <span className="dp-meta-item dp-booking-price-wrap">
                      <span className="dp-price">
                        {formatMoneyCompact(
                          booking.price,
                          booking.currency,
                        )}
                      </span>
                      {booking.couponDiscountPercent != null ? (
                        <span className="dp-booking-coupon-tag">
                          · Used coupon (
                          {booking.couponCode ? (
                            <>
                              <strong>{booking.couponCode}</strong>
                              {` ${booking.couponDiscountPercent}%`}
                            </>
                          ) : (
                            `${booking.couponDiscountPercent}%`
                          )}
                          )
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {canUndoCancellation(booking, usesManagedBookings) ? (
                    <div
                      className="dp-booking-undo-cancel"
                      role="region"
                      aria-label="Undo cancellation"
                    >
                      <p className="dp-booking-undo-cancel-msg">
                        Undo cancel (within{" "}
                        <strong>{undoCancelSecondsRemaining(booking)}</strong>{" "}
                        second
                        {undoCancelSecondsRemaining(booking) === 1 ? "" : "s"}
                        )
                      </p>
                      <button
                        type="button"
                        className="dp-booking-undo-cancel-btn"
                        disabled={undoingId === booking.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          performUndoCancel(booking.id);
                        }}
                      >
                        {undoingId === booking.id
                          ? "Restoring…"
                          : "Undo cancel"}
                      </button>
                    </div>
                  ) : null}
                  {!canCancel &&
                  viewerIsBookingCustomer &&
                  statusAllowsCancel &&
                  !slotNotStarted ? (
                    <div
                      className="dp-booking-lock-hint"
                      role="note"
                      aria-live="polite"
                    >
                      <span className="dp-booking-lock-hint-icon" aria-hidden>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 14 14"
                          fill="none"
                        >
                          <path
                            d="M4 6V4.25A3 3 0 0 1 10 4.25V6"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                          <rect
                            x="2.75"
                            y="6"
                            width="8.5"
                            height="5.5"
                            rx="1.25"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                        </svg>
                      </span>
                      Cancellation closed — please contact the business
                      directly.
                    </div>
                  ) : null}
                </div>
                {canReschedule || canCancel || canMarkOutcome || canEmailClient ? (
                  <div className="dp-booking-actions">
                    {canReschedule || canCancel ? (
                      <>
                        {canReschedule ? (
                          <AppTooltip content="Pick a new date and time">
                            <button
                              type="button"
                              className="dp-action-btn reschedule"
                              onClick={(e) => {
                                e.stopPropagation();
                                openReschedule(booking);
                              }}
                            >
                              Reschedule
                            </button>
                          </AppTooltip>
                        ) : null}
                        {canCancel ? (
                          <AppTooltip
                            content={
                              viewerIsBookingCustomer
                                ? "Cancel before the appointment starts. Once it's in progress, contact the business directly."
                                : "Cancel this booking on behalf of your business (allowed until the slot ends)"
                            }
                            disabled={!!cancellingId}
                          >
                            <button
                              type="button"
                              className="dp-action-btn cancel"
                              disabled={!!cancellingId}
                              onClick={() => setCancelModalBooking(booking)}
                            >
                              Cancel
                            </button>
                          </AppTooltip>
                        ) : null}
                      </>
                    ) : null}
                    {canEmailClient ? (
                      <AppTooltip content="Send a custom email (e.g. staff sick, closure) — uses your subject and message.">
                        <button
                          type="button"
                          className="dp-action-btn email-client"
                          disabled={!!emailNotifySending}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEmailNotifyForBooking(booking);
                          }}
                        >
                          Email client
                        </button>
                      </AppTooltip>
                    ) : null}
                    {canMarkOutcome ? (
                      <>
                        <AppTooltip
                          content="Client attended — move to completed"
                          disabled={!!markingOutcomeId}
                        >
                          <button
                            type="button"
                            className="dp-action-btn dp-action-btn--done"
                            disabled={!!markingOutcomeId}
                            onClick={(e) => {
                              e.stopPropagation();
                              performMarkOutcome(booking.id, "completed");
                            }}
                          >
                            {markingOutcomeId === booking.id
                              ? "…"
                              : "Mark completed"}
                          </button>
                        </AppTooltip>
                        <AppTooltip
                          content="Client did not attend"
                          disabled={!!markingOutcomeId}
                        >
                          <button
                            type="button"
                            className="dp-action-btn dp-action-btn--noshow"
                            disabled={!!markingOutcomeId}
                            onClick={(e) => {
                              e.stopPropagation();
                              performMarkOutcome(booking.id, "no_show");
                            }}
                          >
                            {markingOutcomeId === booking.id ? "…" : "No-show"}
                          </button>
                        </AppTooltip>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {sortedFiltered.length === 0 ? (
            <div className="dp-empty">
              <div className="dp-empty-icon" aria-hidden>
                <HiOutlineCalendar size={40} />
              </div>
              <h3>No bookings found</h3>
              <p>
                {searchQuery.trim() && filtered.length > 0
                  ? usesManagedBookings
                    ? "No bookings match your search. Try a different client name, service, or staff member."
                    : "No bookings match your search. Try a different service, business, or staff member."
                  : bookings.length > 0 && dateFilteredBookings.length === 0
                    ? "No bookings match the selected date. Try another day or choose “All dates”."
                    : dateFilteredBookings.length > 0 && filter !== "all"
                      ? `No ${statusConfig[filter]?.label?.toLowerCase() || filter} bookings in this date range.`
                      : filter === "all"
                        ? usesManagedBookings
                          ? isStaff
                            ? "No bookings assigned to you in this view yet."
                            : "No bookings for your business in this view yet."
                          : "You don't have any bookings yet."
                        : `You don't have any ${filter} bookings yet.`}
              </p>
            </div>
          ) : null}
        </>
      )}
      </div>

      {rescheduleTarget ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !rescheduleSubmitting && setRescheduleTarget(null)}
        >
          <div
            className="dt-modal dp-reschedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-reschedule-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-reschedule-title">Reschedule appointment</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() =>
                  !rescheduleSubmitting && setRescheduleTarget(null)
                }
                aria-label="Close"
                disabled={rescheduleSubmitting}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M5 15L15 5M5 5L15 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="dp-reschedule-service">
                {rescheduleTarget.serviceName}
              </p>
              <p className="dp-reschedule-desc">
                With{" "}
                <strong>{rescheduleTarget.staffName || "your stylist"}</strong>.
                Choose a day, then an available time.
              </p>
              {rescheduleMeta?.effectiveWindow ? (
                <p className="dp-reschedule-window-hint">
                  Hours for this day:{" "}
                  <strong>
                    {rescheduleMeta.effectiveWindow.open}–
                    {rescheduleMeta.effectiveWindow.close}
                  </strong>
                  {rescheduleMeta.duration != null ? (
                    <>
                      {" "}
                      · {rescheduleMeta.duration} min appointment (last start is
                      early enough to finish before closing).
                    </>
                  ) : null}
                </p>
              ) : null}
              <div className="dp-field dp-reschedule-cal-field">
                <span className="dp-sr-only" id="dp-reschedule-cal-label">
                  Choose date
                </span>
                <div
                  className="dp-reschedule-calendar-wrap"
                  aria-labelledby="dp-reschedule-cal-label"
                >
                  <DayPicker
                    mode="single"
                    selected={rescheduleDate}
                    onSelect={(d) => {
                      if (d && !rescheduleSubmitting) setRescheduleDate(d);
                    }}
                    disabled={{ before: startOfDay(new Date()) }}
                    locale={enUS}
                    defaultMonth={rescheduleDate ?? new Date()}
                    className="dp-booking-day-picker"
                  />
                </div>
              </div>
              {rescheduleSlotsLoading ? (
                <p className="dp-reschedule-loading">
                  Loading available times…
                </p>
              ) : null}
              {rescheduleSlotsError ? (
                <p className="dp-reschedule-error" role="alert">
                  {rescheduleSlotsError}
                </p>
              ) : null}
              {!rescheduleSlotsLoading &&
              !rescheduleSlotsError &&
              rescheduleSlots.length === 0 ? (
                <p className="dp-reschedule-empty">
                  No time slots for this day. Try another date.
                </p>
              ) : null}
              <div className="bm-times-grid dp-reschedule-times">
                {rescheduleSlots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    className={`bm-time-slot ${rescheduleTime === s.time ? "selected" : ""} ${!s.available ? "unavailable" : ""}`}
                    disabled={!s.available || rescheduleSubmitting}
                    onClick={() => s.available && setRescheduleTime(s.time)}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn reschedule"
                onClick={() =>
                  !rescheduleSubmitting && setRescheduleTarget(null)
                }
                disabled={rescheduleSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-save-btn"
                onClick={confirmReschedule}
                disabled={
                  !rescheduleTime ||
                  rescheduleSubmitting ||
                  rescheduleSlotsLoading
                }
              >
                {rescheduleSubmitting ? "Saving…" : "Confirm new time"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {emailNotifyModal ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !emailNotifySending && setEmailNotifyModal(null)}
        >
          <div
            className="dt-modal dp-email-notify-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-email-notify-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-email-notify-title">
                {emailNotifyModal.mode === "single"
                  ? "Email this client"
                  : "Email all clients on this day"}
              </h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() =>
                  !emailNotifySending && setEmailNotifyModal(null)
                }
                aria-label="Close"
                disabled={!!emailNotifySending}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M5 15L15 5M5 5L15 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="dt-modal-body">
              {emailNotifyModal.mode === "single" ? (
                <p className="dp-email-notify-recipient">
                  To:{" "}
                  <strong>
                    {emailNotifyModal.booking.customerName?.trim() || "Client"}
                  </strong>
                  {emailNotifyModal.booking.customerEmail?.trim() ? (
                    <span className="dp-email-notify-address">
                      {" "}
                      &lt;{emailNotifyModal.booking.customerEmail.trim()}&gt;
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="dp-email-notify-recipient">
                  Sends one message per email address for{" "}
                  <strong>
                    {formatYmdLongLabel(emailNotifyModal.dateYmd)}
                  </strong>{" "}
                  (appointment details are included automatically). Recipients:{" "}
                  <strong>{bulkNotifyUniqueEmails}</strong>.
                </p>
              )}
              <label className="dp-field dp-email-notify-field">
                <span className="dp-field-label">Subject</span>
                <input
                  type="text"
                  className="form-control"
                  value={emailNotifySubject}
                  onChange={(e) => setEmailNotifySubject(e.target.value)}
                  placeholder="e.g. Your stylist is unavailable today"
                  disabled={emailNotifySending}
                  maxLength={300}
                  autoComplete="off"
                />
              </label>
              <label className="dp-field dp-email-notify-field">
                <span className="dp-field-label">Message</span>
                <textarea
                  className="form-control dp-email-notify-textarea"
                  value={emailNotifyBody}
                  onChange={(e) => setEmailNotifyBody(e.target.value)}
                  placeholder="Explain what changed and what the client should do next (reschedule, contact you, etc.)."
                  disabled={emailNotifySending}
                  rows={6}
                  maxLength={20000}
                />
              </label>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn reschedule"
                onClick={() =>
                  !emailNotifySending && setEmailNotifyModal(null)
                }
                disabled={!!emailNotifySending}
              >
                Close
              </button>
              <button
                type="button"
                className="dp-save-btn"
                onClick={performEmailNotify}
                disabled={
                  emailNotifySending ||
                  !emailNotifySubject.trim() ||
                  !emailNotifyBody.trim()
                }
              >
                {emailNotifySending ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelModalBooking ? (
        <div
          className="dt-modal-overlay"
          role="presentation"
          onClick={() => !cancellingId && setCancelModalBooking(null)}
        >
          <div
            className="dt-modal mb-delete-modal dp-cancel-booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-cancel-booking-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="dp-cancel-booking-title">Cancel this booking?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={() => !cancellingId && setCancelModalBooking(null)}
                aria-label="Close"
                disabled={!!cancellingId}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M5 15L15 5M5 5L15 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                Are you sure you want to cancel this booking? You won&apos;t be
                able to undo this action.
              </p>
              <p className="dp-cancel-booking-summary">
                <strong>{cancelModalBooking.serviceName}</strong>
                {usesManagedBookings &&
                cancelModalBooking.customerName?.trim() ? (
                  <span className="dp-cancel-booking-summary-client">
                    Booked by {cancelModalBooking.customerName.trim()}
                  </span>
                ) : null}
                <span className="dp-cancel-booking-summary-meta">
                  {formatDate(cancelModalBooking)} ·{" "}
                  {cancelModalBooking.startTime} ·{" "}
                  {formatMoneyCompact(
                    cancelModalBooking.price,
                    cancelModalBooking.currency,
                  )}
                </span>
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn reschedule"
                onClick={() => !cancellingId && setCancelModalBooking(null)}
                disabled={!!cancellingId}
              >
                Keep appointment
              </button>
              <button
                type="button"
                className="mb-delete-modal-confirm"
                onClick={() => performCancel(cancelModalBooking.id)}
                disabled={!!cancellingId}
              >
                {cancellingId ? "Cancelling…" : "Yes, cancel booking"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
};

export default MyBookings;
