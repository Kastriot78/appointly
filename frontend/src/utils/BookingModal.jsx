import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  cloneElement,
} from "react";
import { DayPicker } from "react-day-picker";
import { startOfDay, startOfMonth, addDays } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-day-picker/style.css";
import {
  getAvailability,
  getAvailabilitySummary,
  createSlotHold,
  releaseSlotHold,
  createBooking,
  confirmPendingBooking,
  declinePendingBooking,
  joinWaitlist,
  getWaitlistOffer,
} from "../api/bookings";
import { getApiErrorMessage } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import {
  formatClosingPeriodRange,
  calendarDayOverlapsClosing,
} from "./closingPeriods";
import {
  getPromotionView,
  getEffectivePriceForUi,
  todayIsoDate,
} from "./servicePromotion";
import { validateBusinessCoupon } from "../api/businesses";
import {
  HiCheck,
  HiOutlineUser,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineClipboardList,
} from "react-icons/hi";
import { formatMoneyCompact, normalizeCurrency } from "./currency";
import {
  DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
  MAX_BOOKING_ADVANCE_DAYS,
} from "./bookingRulesLimits";
import AppTooltip from "../components/AppTooltip";
import {
  persistActiveSlotHold,
  clearActiveSlotHoldStorage,
  releaseActiveSlotHoldFromStorage,
} from "./slotHoldSession";
import {
  loadBookingDraft,
  saveBookingDraft,
  clearBookingDraft,
} from "./bookingDraftSession";

/** Max services a single booking may combine (keep in sync with backend). */
const MAX_SERVICES_PER_BOOKING = 8;

const HELD_SLOT_TOOLTIP =
  "Temporarily held — another customer is finishing checkout. This time may open again in a minute or two; you can also pick a different slot.";

/** How often to refetch slots while the date step is open (holds expire in a few minutes). */
const AVAILABILITY_POLL_MS = 8000;

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive YYYY-MM-DD ranges from staff profile — no bookings that day. */
function ymdInStaffTimeOff(ymd, timeOff) {
  if (!timeOff || !Array.isArray(timeOff) || timeOff.length === 0) return false;
  if (!ISO_YMD.test(ymd)) return false;
  for (const r of timeOff) {
    const a = String(r.startsOn || "").trim();
    const b = String(r.endsOn || "").trim();
    if (!ISO_YMD.test(a) || !ISO_YMD.test(b) || a > b) continue;
    if (ymd >= a && ymd <= b) return true;
  }
  return false;
}

/**
 * Calendar heat levels 0–2 = closed or few openings (grey / red / amber).
 * Only 3–4 (lighter / full green) are selectable — matches “pick a free day”.
 */
const MIN_SELECTABLE_HEAT_LEVEL = 3;

function normalizeCouponCodeInput(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

/** First letter of the display name (trimmed). */
function staffNameInitial(name) {
  if (!name || typeof name !== "string") return "?";
  const t = name.trim();
  if (!t) return "?";
  return t[0].toUpperCase();
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Grey out times that already passed when the chosen day is today. */
function applyPastTimeFilter(slots, selectedDate) {
  const now = new Date();
  if (!isSameCalendarDay(selectedDate, now)) return slots;
  const nowM = now.getHours() * 60 + now.getMinutes();
  return slots.map((s) => {
    const parts = String(s.time).split(":");
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return s;
    const slotM = hh * 60 + mm;
    if (slotM <= nowM) {
      return { ...s, available: false, unavailableReason: "past" };
    }
    return s;
  });
}

function formatMinutesLabel(total) {
  const t = Number(total) || 0;
  if (t <= 0) return "0 min";
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function formatResumeDraftSummary(draft) {
  const n = Array.isArray(draft.serviceIds) ? draft.serviceIds.length : 0;
  const parts = [];
  if (n > 0) parts.push(`${n} service${n === 1 ? "" : "s"}`);
  if (draft.dateYmd && ISO_YMD.test(String(draft.dateYmd))) {
    const d = new Date(`${String(draft.dateYmd)}T12:00:00`);
    parts.push(
      d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    );
  }
  if (draft.time) parts.push(String(draft.time));
  return parts.length > 0 ? parts.join(" · ") : "Your last selections";
}

const BookingModal = ({
  isOpen,
  onClose,
  businessName,
  businessId,
  services = [],
  staff = [],
  /** When set, modal opens at step 2 (staff) with this service pre-selected */
  initialServiceId = null,
  /** Upcoming scheduled closures (from public business payload) */
  closingPeriods = [],
  /** How far ahead customers may book (from business booking rules) */
  maxAdvanceDays = DEFAULT_MAX_BOOKING_ADVANCE_DAYS,
  /** ISO 4217 — matches business pricing currency */
  currencyCode = "EUR",
  /** From /book/:slug?waitlist= — pre-fills services, staff, date & time */
  initialWaitlistToken = null,
  onWaitlistPrefillConsumed = () => {},
}) => {
  const currency = normalizeCurrency(currencyCode);
  /** Pretty money label; avoids trailing “.00” when cents are zero. */
  function formatPrice(value) {
    return formatMoneyCompact(value, currency);
  }

  const { isAuthenticated, login } = useAuth();
  const isGuest = !isAuthenticated;

  const serviceStep = isGuest ? 2 : 1;
  const staffStep = isGuest ? 3 : 2;
  const dateStep = isGuest ? 4 : 3;
  const confirmStep = isGuest ? 5 : 4;

  const [step, setStep] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  /** Ordered list of selected service objects (supports multi-service bookings). */
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  /** Server held another slot after original was taken */
  const [conflictHold, setConflictHold] = useState(null);
  const [guestCredentialsEmailed, setGuestCredentialsEmailed] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponMsg, setCouponMsg] = useState(null);
  const [couponApplyLoading, setCouponApplyLoading] = useState(false);
  /** Concrete staff resolved by the server when the customer chose “Anyone Available”. */
  const [resolvedHoldStaff, setResolvedHoldStaff] = useState(null);
  const [slotHoldBusy, setSlotHoldBusy] = useState(false);
  const [slotHoldError, setSlotHoldError] = useState(null);
  /** YYYY-MM-DD → heat level 0–4 from /availability-summary (calendar shading). */
  const [availabilityHeat, setAvailabilityHeat] = useState({});
  const [availabilityHeatLoading, setAvailabilityHeatLoading] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  /** Rounding step from GET /availability (suggested starts every N minutes). */
  const [availabilityOfferStep, setAvailabilityOfferStep] = useState(5);

  const holderSessionKeyRef = useRef("");
  const activeSlotHoldIdRef = useRef(null);
  const resumeDraftRef = useRef(null);

  const initialServiceIdRef = useRef(initialServiceId);
  const servicesRef = useRef(services);
  const staffRef = useRef(staff);
  initialServiceIdRef.current = initialServiceId;
  servicesRef.current = services;
  staffRef.current = staff;

  const waitlistPrefillUsedRef = useRef(null);
  const [pendingWaitlistToken, setPendingWaitlistToken] = useState(null);
  const [waitlistBusyTime, setWaitlistBusyTime] = useState(null);
  const [waitlistMessage, setWaitlistMessage] = useState(null);
  const [guestWaitlistSlot, setGuestWaitlistSlot] = useState(null);
  const [guestWaitlistName, setGuestWaitlistName] = useState("");
  const [guestWaitlistEmail, setGuestWaitlistEmail] = useState("");

  const releaseActiveSlotHold = useCallback(async () => {
    const id = activeSlotHoldIdRef.current;
    const hk = holderSessionKeyRef.current;
    if (!id || !hk) return;
    activeSlotHoldIdRef.current = null;
    clearActiveSlotHoldStorage();
    try {
      await releaseSlotHold(id, hk);
    } catch {
      /* expired or already released */
    }
  }, []);

  const applyDefaultOpenFormState = useCallback(() => {
    setConfirmed(false);
    setSelectedStaff(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setSlots([]);
    setSlotsError(null);
    setBookingError(null);
    setConflictHold(null);
    setGuestCredentialsEmailed(false);
    setSlotsLoading(false);
    setGuestName("");
    setGuestEmail("");
    setCouponCodeInput("");
    setCouponPreview(null);
    setCouponMsg(null);
    setResolvedHoldStaff(null);
    setSlotHoldBusy(false);
    setSlotHoldError(null);
    setAvailabilityHeat({});
    setAvailabilityHeatLoading(false);
    setPendingWaitlistToken(null);
    setWaitlistBusyTime(null);
    setWaitlistMessage(null);
    setGuestWaitlistSlot(null);
    setGuestWaitlistName("");
    setGuestWaitlistEmail("");
    const id = initialServiceIdRef.current;
    const list = servicesRef.current;
    const preselected =
      id != null && String(id).length > 0
        ? list.find((s) => String(s.id) === String(id)) || null
        : null;
    setSelectedServices(preselected ? [preselected] : []);
    if (isGuest) {
      setStep(1);
    } else if (preselected) {
      /** Jump to staff step when a specific service was clicked from the profile. */
      setStep(2);
    } else {
      setStep(1);
    }
  }, [isGuest]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      setShowResumePrompt(false);
      resumeDraftRef.current = null;
      return;
    }
    void releaseActiveSlotHoldFromStorage();
    holderSessionKeyRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    activeSlotHoldIdRef.current = null;
    document.body.style.overflow = "hidden";

    const draft = loadBookingDraft(businessId);
    const hasProgress =
      draft && Array.isArray(draft.serviceIds) && draft.serviceIds.length > 0;

    if (hasProgress) {
      resumeDraftRef.current = draft;
      setShowResumePrompt(true);
      setConfirmed(false);
      setSelectedStaff(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setSlots([]);
      setSlotsError(null);
      setBookingError(null);
      setConflictHold(null);
      setGuestCredentialsEmailed(false);
      setSlotsLoading(false);
      setGuestName("");
      setGuestEmail("");
      setCouponCodeInput("");
      setCouponPreview(null);
      setCouponMsg(null);
      setResolvedHoldStaff(null);
      setSlotHoldBusy(false);
      setSlotHoldError(null);
      setAvailabilityHeat({});
      setAvailabilityHeatLoading(false);
      setPendingWaitlistToken(null);
      setWaitlistBusyTime(null);
      setWaitlistMessage(null);
      setGuestWaitlistSlot(null);
      setGuestWaitlistName("");
      setGuestWaitlistEmail("");
      setSelectedServices([]);
      setAvailabilityOfferStep(5);
      setStep(1);
    } else {
      setShowResumePrompt(false);
      resumeDraftRef.current = null;
      setAvailabilityOfferStep(5);
      applyDefaultOpenFormState();
    }

    return () => {
      document.body.style.overflow = "";
    };
    // Only when the modal opens/closes (or business changes) — not when auth changes
    // mid-flow. Guest booking calls login() on success; including isGuest / stable form
    // reset callbacks here would re-run and hide the success screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit applyDefaultOpenFormState / isGuest
  }, [isOpen, businessId]);

  useEffect(() => {
    if (!isOpen) {
      waitlistPrefillUsedRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !initialWaitlistToken || !businessId) return;
    if (waitlistPrefillUsedRef.current === initialWaitlistToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await getWaitlistOffer(initialWaitlistToken);
        const o = data?.offer;
        if (
          cancelled ||
          !o ||
          String(o.businessId) !== String(businessId)
        ) {
          return;
        }
        clearBookingDraft(businessId);
        setShowResumePrompt(false);
        resumeDraftRef.current = null;

        const list = servicesRef.current;
        const svcObjs = o.serviceIds
          .map((id) => list.find((s) => String(s.id) === String(id)))
          .filter(Boolean);
        if (svcObjs.length !== o.serviceIds.length) return;

        setSelectedServices(svcObjs);

        const stf = staffRef.current || [];
        if (o.staffId === "any") {
          setSelectedStaff({ id: "any", name: "Anyone Available" });
        } else {
          const m = stf.find((x) => String(x.id) === String(o.staffId));
          if (!m) return;
          setSelectedStaff(m);
        }

        const parts = String(o.date || "").split("-");
        if (parts.length !== 3) return;
        const yy = parseInt(parts[0], 10);
        const mm = parseInt(parts[1], 10);
        const dd = parseInt(parts[2], 10);
        if (
          !Number.isFinite(yy) ||
          !Number.isFinite(mm) ||
          !Number.isFinite(dd)
        ) {
          return;
        }
        setSelectedDate(new Date(yy, mm - 1, dd));
        setSelectedTime(o.startTime);
        setPendingWaitlistToken(initialWaitlistToken);
        setStep(dateStep);
        waitlistPrefillUsedRef.current = initialWaitlistToken;
        onWaitlistPrefillConsumed();
      } catch {
        /* invalid or expired link */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    initialWaitlistToken,
    businessId,
    dateStep,
    onWaitlistPrefillConsumed,
  ]);

  /** Derived totals for the running summary + pricing display. */
  const totalDurationMinutes = useMemo(
    () =>
      selectedServices.reduce((sum, s) => sum + (Number(s.duration) || 0), 0),
    [selectedServices],
  );

  const bookingDayYmd = selectedDate ? formatYmd(selectedDate) : null;

  /** Sum of per-service effective prices on the booking day (honours promotions). */
  const totalEffectivePrice = useMemo(() => {
    if (selectedServices.length === 0) return 0;
    const iso = bookingDayYmd || todayIsoDate();
    const total = selectedServices.reduce(
      (sum, s) => sum + getEffectivePriceForUi(s, iso),
      0,
    );
    return Math.round(total * 100) / 100;
  }, [selectedServices, bookingDayYmd]);

  /** Sum of regular list prices (used as struck-through original when a promo is active). */
  const totalListPrice = useMemo(() => {
    if (selectedServices.length === 0) return 0;
    const total = selectedServices.reduce(
      (sum, s) => sum + (Number(s.price) || 0),
      0,
    );
    return Math.round(total * 100) / 100;
  }, [selectedServices]);

  const hasAnyActivePromo = useMemo(() => {
    if (!bookingDayYmd) return false;
    return selectedServices.some((s) => !!getPromotionView(s, bookingDayYmd));
  }, [selectedServices, bookingDayYmd]);

  /**
   * Staff member must offer every selected service.
   * The public business payload returns `member.services` as either populated
   * objects (`{ id, name, ... }`) or raw ObjectId strings depending on caller —
   * handle both shapes.
   */
  const staffOffersAllSelected = (member) => {
    if (!member || !Array.isArray(member.services)) return false;
    if (selectedServices.length === 0) return true;
    const offered = new Set(
      member.services
        .map((x) => {
          if (x == null) return "";
          if (typeof x === "string") return x;
          return String(x.id ?? x._id ?? "");
        })
        .filter(Boolean),
    );
    return selectedServices.every((svc) => offered.has(String(svc.id)));
  };

  const eligibleStaff = useMemo(
    () => staff.filter(staffOffersAllSelected),
    // Re-compute when selection or staff list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff, selectedServices],
  );

  /** Reset selected staff if they no longer offer the full set. */
  useEffect(() => {
    if (!selectedStaff) return;
    if (selectedStaff.id === "any") return;
    const stillValid = eligibleStaff.some(
      (m) => String(m.id) === String(selectedStaff.id),
    );
    if (!stillValid) setSelectedStaff(null);
  }, [eligibleStaff, selectedStaff]);

  useEffect(() => {
    if (
      !isOpen ||
      step !== dateStep ||
      !businessId ||
      selectedServices.length === 0 ||
      !selectedStaff ||
      !selectedDate
    ) {
      return;
    }

    let cancelled = false;
    const loadSlots = async (withSpinner) => {
      if (withSpinner) {
        setSlotsLoading(true);
        setSlotsError(null);
      }
      try {
        const dateStr = formatYmd(selectedDate);
        const staffParam =
          selectedStaff.id === "any" ? "any" : String(selectedStaff.id);
        const serviceIds = selectedServices.map((s) => String(s.id)).join(",");
        const holdId = activeSlotHoldIdRef.current;
        const hk = holderSessionKeyRef.current;
        const { data } = await getAvailability({
          businessId,
          serviceIds,
          staffId: staffParam,
          date: dateStr,
          ...(holdId && hk ? { excludeSlotHoldId: holdId, holderKey: hk } : {}),
        });
        if (cancelled) return;
        const step = Number(data.slotStepMinutes);
        if (Number.isFinite(step) && step > 0) {
          setAvailabilityOfferStep(step);
        }
        const raw = Array.isArray(data.slots) ? data.slots : [];
        setSlots(applyPastTimeFilter(raw, selectedDate));
        if (!withSpinner) setSlotsError(null);
      } catch (err) {
        if (!cancelled) {
          if (withSpinner) {
            setSlotsError(getApiErrorMessage(err));
            setSlots([]);
          }
        }
      } finally {
        if (!cancelled && withSpinner) setSlotsLoading(false);
      }
    };

    void loadSlots(true);
    const poll = window.setInterval(() => {
      void loadSlots(false);
    }, AVAILABILITY_POLL_MS);

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadSlots(false);
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [
    isOpen,
    step,
    dateStep,
    businessId,
    selectedServices,
    selectedStaff,
    selectedDate,
  ]);

  useEffect(() => {
    if (!selectedTime || !slots.length) return;
    const slot = slots.find((s) => s.time === selectedTime);
    if (!slot || !slot.available) {
      void releaseActiveSlotHold();
      setSelectedTime(null);
      setResolvedHoldStaff(null);
    }
  }, [slots, selectedTime, releaseActiveSlotHold]);

  const handlePickTime = async (slot) => {
    if (!slot.available || slotHoldBusy) return;
    if (
      !businessId ||
      !selectedStaff ||
      !bookingDayYmd ||
      selectedServices.length === 0
    ) {
      return;
    }
    setSlotHoldError(null);
    setSlotHoldBusy(true);
    try {
      await releaseActiveSlotHold();
      const staffParam =
        selectedStaff.id === "any" ? "any" : String(selectedStaff.id);
      const serviceIds = selectedServices.map((s) => String(s.id)).join(",");
      const { data } = await createSlotHold({
        businessId,
        serviceIds,
        staffId: staffParam,
        date: bookingDayYmd,
        startTime: slot.time,
        holderKey: holderSessionKeyRef.current,
      });
      activeSlotHoldIdRef.current = data.holdId;
      persistActiveSlotHold(data.holdId, holderSessionKeyRef.current);
      if (selectedStaff.id === "any") {
        setResolvedHoldStaff({
          id: data.staffId,
          name: data.staffName || "Staff",
        });
      } else {
        setResolvedHoldStaff(null);
      }
      setSelectedTime(slot.time);
    } catch (err) {
      setSelectedTime(null);
      setResolvedHoldStaff(null);
      activeSlotHoldIdRef.current = null;
      clearActiveSlotHoldStorage();
      setSlotHoldError(getApiErrorMessage(err));
    } finally {
      setSlotHoldBusy(false);
    }
  };

  const formatFull = (d) =>
    d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const safeAdvance = Math.max(
    1,
    Math.min(MAX_BOOKING_ADVANCE_DAYS, Math.floor(maxAdvanceDays)),
  );

  const { bookingToday, bookingLastDay } = useMemo(() => {
    const t = startOfDay(new Date());
    return {
      bookingToday: t,
      bookingLastDay: addDays(t, safeAdvance - 1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAdvance, isOpen]);

  const applyResumeDraft = useCallback(
    (draft) => {
      const list = servicesRef.current;
      const orderedServices = [];
      for (const id of draft.serviceIds || []) {
        const s = list.find((x) => String(x.id) === String(id));
        if (s) orderedServices.push(s);
      }
      if (orderedServices.length === 0) {
        clearBookingDraft(businessId);
        setShowResumePrompt(false);
        resumeDraftRef.current = null;
        applyDefaultOpenFormState();
        return;
      }

      let staffMember = null;
      if (draft.staffId === "any") {
        staffMember = { id: "any", name: "Anyone Available" };
      } else if (draft.staffId != null && String(draft.staffId).length > 0) {
        const m = staff.find((x) => String(x.id) === String(draft.staffId));
        if (m) staffMember = { id: m.id, name: m.name };
      }

      let dateObj = null;
      if (draft.dateYmd && ISO_YMD.test(String(draft.dateYmd))) {
        const ymd = String(draft.dateYmd);
        const d = new Date(`${ymd}T12:00:00`);
        const day = startOfDay(d);
        if (day >= bookingToday && day <= bookingLastDay) {
          dateObj = d;
        }
      }

      let timeVal =
        draft.time && typeof draft.time === "string" ? draft.time : null;
      if (!dateObj) timeVal = null;

      setGuestName(String(draft.guestName ?? ""));
      setGuestEmail(String(draft.guestEmail ?? ""));

      setSelectedServices(orderedServices);
      setSelectedStaff(staffMember);
      setSelectedDate(dateObj);
      setSelectedTime(timeVal);

      let nextStep;
      if (isGuest) {
        const gn = String(draft.guestName ?? "").trim();
        const ge = String(draft.guestEmail ?? "").trim();
        if (gn.length < 2 || !isValidEmail(ge)) {
          nextStep = 1;
        } else if (!staffMember) {
          nextStep = staffStep;
        } else if (!dateObj) {
          nextStep = dateStep;
        } else {
          nextStep = dateStep;
        }
      } else if (!staffMember) {
        nextStep = staffStep;
      } else if (!dateObj) {
        nextStep = dateStep;
      } else {
        nextStep = dateStep;
      }
      setStep(nextStep);
      setShowResumePrompt(false);
      resumeDraftRef.current = null;
    },
    [
      applyDefaultOpenFormState,
      businessId,
      bookingLastDay,
      bookingToday,
      dateStep,
      isGuest,
      staff,
      staffStep,
    ],
  );

  const handleResumeContinue = useCallback(() => {
    const d = resumeDraftRef.current;
    if (!d) {
      setShowResumePrompt(false);
      return;
    }
    applyResumeDraft(d);
  }, [applyResumeDraft]);

  const handleResumeStartFresh = useCallback(() => {
    clearBookingDraft(businessId);
    resumeDraftRef.current = null;
    setShowResumePrompt(false);
    applyDefaultOpenFormState();
  }, [applyDefaultOpenFormState, businessId]);

  /** Keep month/year dropdowns inside the bookable window so users don’t land on all-disabled months (e.g. June when only 30 days ahead). */
  const calendarStartMonth = useMemo(
    () => startOfMonth(bookingToday),
    [bookingToday],
  );
  const calendarEndMonth = useMemo(
    () => startOfMonth(bookingLastDay),
    [bookingLastDay],
  );
  const calendarFromYear = bookingToday.getFullYear();
  const calendarToYear = bookingLastDay.getFullYear();

  const closingModifiers = useMemo(
    () => ({
      hasClosing: (date) => calendarDayOverlapsClosing(date, closingPeriods),
    }),
    [closingPeriods],
  );

  /** Invalidate coupon preview whenever the selection or day changes. */
  const selectionSignature = useMemo(
    () => selectedServices.map((s) => String(s.id)).join(","),
    [selectedServices],
  );

  const selectedStaffKey = selectedStaff ? String(selectedStaff.id) : "";

  const getHeatLevelForDate = useCallback(
    (date) => {
      const d0 = startOfDay(date);
      if (d0 < bookingToday || d0 > bookingLastDay) return null;
      const key = formatYmd(date);
      if (!Object.prototype.hasOwnProperty.call(availabilityHeat, key)) {
        return null;
      }
      return availabilityHeat[key];
    },
    [availabilityHeat, bookingToday, bookingLastDay],
  );

  const calendarModifiers = useMemo(
    () => ({
      ...closingModifiers,
      bmHeat0: (date) => getHeatLevelForDate(date) === 0,
      bmHeat1: (date) => getHeatLevelForDate(date) === 1,
      bmHeat2: (date) => getHeatLevelForDate(date) === 2,
      bmHeat3: (date) => getHeatLevelForDate(date) === 3,
      bmHeat4: (date) => getHeatLevelForDate(date) === 4,
    }),
    [closingModifiers, getHeatLevelForDate],
  );

  const calendarModifiersClassNames = useMemo(
    () => ({
      hasClosing: "bm-day-has-closing",
      bmHeat0: "bm-heat-0",
      bmHeat1: "bm-heat-1",
      bmHeat2: "bm-heat-2",
      bmHeat3: "bm-heat-3",
      bmHeat4: "bm-heat-4",
    }),
    [],
  );

  const isBookingDayDisabled = useCallback(
    (date) => {
      const day = startOfDay(date);
      if (day < bookingToday || day > bookingLastDay) return true;
      const ymd = formatYmd(day);
      if (
        selectedStaff &&
        selectedStaff.id !== "any" &&
        ymdInStaffTimeOff(ymd, selectedStaff.timeOff)
      ) {
        return true;
      }
      if (availabilityHeatLoading) return true;
      /** Summary failed or not loaded — do not treat every day as bookable. */
      if (Object.keys(availabilityHeat).length === 0) return true;
      const level = availabilityHeat[ymd];
      if (level === undefined) return true;
      return level < MIN_SELECTABLE_HEAT_LEVEL;
    },
    [
      bookingToday,
      bookingLastDay,
      availabilityHeat,
      availabilityHeatLoading,
      selectedStaff,
    ],
  );

  const staffTimeOffBanner = useMemo(() => {
    if (!selectedStaff || selectedStaff.id === "any") return null;
    const ranges = selectedStaff.timeOff;
    if (!Array.isArray(ranges) || ranges.length === 0) return null;
    const winStart = formatYmd(bookingToday);
    const winEnd = formatYmd(bookingLastDay);
    const overlaps = ranges.filter((r) => {
      const a = String(r.startsOn || "").trim();
      const b = String(r.endsOn || "").trim();
      if (!ISO_YMD.test(a) || !ISO_YMD.test(b) || a > b) return false;
      return b >= winStart && a <= winEnd;
    });
    if (!overlaps.length) return null;
    const fmt = (iso) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const parts = overlaps.map((r) => {
      const label = `${fmt(r.startsOn)} – ${fmt(r.endsOn)}`;
      const note = String(r.note || "").trim();
      return note ? `${label} (${note})` : label;
    });
    return { name: selectedStaff.name, parts };
  }, [selectedStaff, bookingToday, bookingLastDay]);

  useEffect(() => {
    if (
      !isOpen ||
      step !== dateStep ||
      !businessId ||
      selectedServices.length === 0 ||
      !selectedStaff
    ) {
      setAvailabilityHeatLoading(false);
      return;
    }
    let cancelled = false;
    setAvailabilityHeatLoading(true);
    (async () => {
      const now = new Date();
      try {
        const { data } = await getAvailabilitySummary({
          businessId,
          serviceIds: selectedServices.map((s) => String(s.id)).join(","),
          staffId:
            selectedStaff.id === "any" ? "any" : String(selectedStaff.id),
          from: formatYmd(bookingToday),
          to: formatYmd(bookingLastDay),
          clientTodayYmd: formatYmd(now),
          clientNowMinutes: now.getHours() * 60 + now.getMinutes(),
        });
        if (cancelled) return;
        const next = {};
        for (const row of data.days || []) {
          if (row.date != null) next[row.date] = row.level;
        }
        setAvailabilityHeat(next);
      } catch {
        if (!cancelled) setAvailabilityHeat({});
      } finally {
        if (!cancelled) setAvailabilityHeatLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setAvailabilityHeatLoading(false);
    };
  }, [
    isOpen,
    step,
    dateStep,
    businessId,
    selectionSignature,
    selectedStaffKey,
    bookingToday.getTime(),
    bookingLastDay.getTime(),
  ]);

  useEffect(() => {
    if (!selectedDate) return;
    const key = formatYmd(selectedDate);
    if (
      selectedStaff &&
      selectedStaff.id !== "any" &&
      ymdInStaffTimeOff(key, selectedStaff.timeOff)
    ) {
      void releaseActiveSlotHold();
      setSelectedDate(null);
      setSelectedTime(null);
      return;
    }
    if (availabilityHeatLoading) return;
    if (Object.keys(availabilityHeat).length === 0) return;
    const level = availabilityHeat[key];
    if (level === undefined || level < MIN_SELECTABLE_HEAT_LEVEL) {
      void releaseActiveSlotHold();
      setSelectedDate(null);
      setSelectedTime(null);
    }
  }, [
    availabilityHeat,
    availabilityHeatLoading,
    selectedDate,
    selectedStaff,
    releaseActiveSlotHold,
  ]);

  useEffect(() => {
    setCouponPreview(null);
    setCouponMsg(null);
  }, [selectionSignature, bookingDayYmd]);

  const toggleService = (svc) => {
    setSelectedServices((prev) => {
      const exists = prev.some((s) => String(s.id) === String(svc.id));
      if (exists) {
        return prev.filter((s) => String(s.id) !== String(svc.id));
      }
      if (prev.length >= MAX_SERVICES_PER_BOOKING) return prev;
      return [...prev, svc];
    });
  };

  const handleApplyCoupon = async () => {
    if (!businessId || selectedServices.length === 0 || !bookingDayYmd) return;
    const raw = couponCodeInput.trim();
    if (!raw) {
      setCouponMsg({ type: "err", text: "Enter a coupon code." });
      return;
    }
    setCouponApplyLoading(true);
    setCouponMsg(null);
    try {
      const { data } = await validateBusinessCoupon(businessId, {
        code: raw,
        serviceIds: selectedServices.map((s) => String(s.id)),
        date: bookingDayYmd,
      });
      if (data.valid) {
        setCouponPreview({
          discountPercent: data.discountPercent,
          basePrice: data.basePrice,
          finalPrice: data.finalPrice,
          codeNorm: normalizeCouponCodeInput(raw),
        });
        setCouponMsg({
          type: "ok",
          text: `${data.discountPercent}% off applied to this appointment.`,
        });
      }
    } catch (err) {
      setCouponPreview(null);
      setCouponMsg({
        type: "err",
        text: getApiErrorMessage(err),
      });
    } finally {
      setCouponApplyLoading(false);
    }
  };

  const staffIdParamForWaitlist = useMemo(() => {
    if (!selectedStaff) return null;
    return selectedStaff.id === "any" ? "any" : String(selectedStaff.id);
  }, [selectedStaff]);

  const submitWaitlist = async (slotTime, guestNm, guestEm) => {
    if (
      !businessId ||
      selectedServices.length === 0 ||
      !selectedStaff ||
      !selectedDate ||
      !slotTime ||
      !staffIdParamForWaitlist
    ) {
      return;
    }
    setWaitlistBusyTime(slotTime);
    setWaitlistMessage(null);
    try {
      const body = {
        businessId,
        serviceIds: selectedServices.map((s) => String(s.id)),
        staffId: staffIdParamForWaitlist,
        date: formatYmd(selectedDate),
        startTime: slotTime,
      };
      if (isGuest) {
        body.guestName = guestNm.trim();
        body.guestEmail = guestEm.trim().toLowerCase();
      }
      const { data } = await joinWaitlist(body);
      setWaitlistMessage({
        type: "ok",
        text:
          data?.message ||
          "You’re on the waitlist. We’ll email you if this time opens up.",
      });
      setGuestWaitlistSlot(null);
    } catch (err) {
      setWaitlistMessage({
        type: "err",
        text: getApiErrorMessage(err),
      });
    } finally {
      setWaitlistBusyTime(null);
    }
  };

  const onJoinWaitlistClick = (slot) => {
    if (!slot?.time || slot.unavailableReason !== "full") return;
    setWaitlistMessage(null);
    if (!isGuest) {
      void submitWaitlist(slot.time, "", "");
      return;
    }
    setGuestWaitlistSlot(slot.time);
    setGuestWaitlistName("");
    setGuestWaitlistEmail("");
  };

  const handleConfirm = async () => {
    if (
      !businessId ||
      selectedServices.length === 0 ||
      !selectedStaff ||
      !selectedDate ||
      !selectedTime
    ) {
      return;
    }
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const trimmedCoupon = couponCodeInput.trim();
      if (trimmedCoupon) {
        const norm = normalizeCouponCodeInput(trimmedCoupon);
        if (!couponPreview || couponPreview.codeNorm !== norm) {
          setBookingError(
            "Apply your coupon before confirming, or clear the code.",
          );
          setBookingSubmitting(false);
          return;
        }
      }

      let staffParam;
      if (selectedStaff.id === "any") {
        if (!resolvedHoldStaff?.id) {
          setBookingError(
            "Could not reserve this time. Please go back and pick a time again.",
          );
          setBookingSubmitting(false);
          return;
        }
        staffParam = String(resolvedHoldStaff.id);
      } else {
        staffParam = String(selectedStaff.id);
      }
      const payload = {
        businessId,
        serviceIds: selectedServices.map((s) => String(s.id)),
        staffId: staffParam,
        date: formatYmd(selectedDate),
        startTime: selectedTime,
        notes: "",
      };
      const hid = activeSlotHoldIdRef.current;
      if (hid && holderSessionKeyRef.current) {
        payload.slotHoldId = hid;
        payload.holderKey = holderSessionKeyRef.current;
      }
      if (isGuest) {
        payload.guestName = guestName.trim();
        payload.guestEmail = guestEmail.trim();
      }
      if (trimmedCoupon && couponPreview) {
        payload.couponCode = trimmedCoupon;
      }
      if (pendingWaitlistToken) {
        payload.waitlistOfferToken = pendingWaitlistToken;
      }

      const { data } = await createBooking(payload);

      if (data.token && data.user) {
        login(data.token, data.user);
      }
      if (data.guestAccountCreated) {
        setGuestCredentialsEmailed(true);
      }

      if (data.outcome === "confirmed" && data.booking) {
        if (data.booking.startTime) {
          setSelectedTime(data.booking.startTime);
        }
        clearBookingDraft(businessId);
        setPendingWaitlistToken(null);
        setConfirmed(true);
        return;
      }

      if (data.outcome === "alternative_suggested" && data.booking) {
        const bid = data.booking.id || data.booking._id;
        setConflictHold({
          bookingId: String(bid),
          requestedSlot: data.requestedSlot,
          suggestedSlot: data.suggestedSlot,
          expiresAt: data.expiresAt,
          message: data.message,
          holdMinutes: data.holdMinutes ?? 5,
        });
        return;
      }

      if (data.outcome === "no_alternative") {
        setBookingError(
          data.message ||
            "No nearby slot is available. Please go back and pick another time.",
        );
        return;
      }

      clearBookingDraft(businessId);
      setPendingWaitlistToken(null);
      setConfirmed(true);
    } catch (err) {
      setBookingError(getApiErrorMessage(err));
    } finally {
      activeSlotHoldIdRef.current = null;
      clearActiveSlotHoldStorage();
      setResolvedHoldStaff(null);
      setBookingSubmitting(false);
    }
  };

  const handleConfirmAlternativeSlot = async () => {
    if (!conflictHold?.bookingId) return;
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const { data } = await confirmPendingBooking(conflictHold.bookingId);
      if (data.booking?.startTime) {
        setSelectedTime(data.booking.startTime);
      }
      if (data.booking?.staffName) {
        setSelectedStaff({
          id: data.booking.staffId || conflictHold.suggestedSlot?.staffId,
          name: data.booking.staffName,
        });
      }
      setConflictHold(null);
      clearBookingDraft(businessId);
      setConfirmed(true);
    } catch (err) {
      setBookingError(getApiErrorMessage(err));
      setConflictHold(null);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleDeclineAlternativeSlot = async () => {
    if (!conflictHold?.bookingId) return;
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      await declinePendingBooking(conflictHold.bookingId);
      setConflictHold(null);
      setStep(dateStep);
      setSelectedTime(null);
    } catch (err) {
      setBookingError(getApiErrorMessage(err));
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleModalClose = async () => {
    await releaseActiveSlotHold();
    if (conflictHold?.bookingId) {
      try {
        await declinePendingBooking(conflictHold.bookingId);
      } catch {
        /* hold may have expired */
      }
      setConflictHold(null);
    }
    if (
      !showResumePrompt &&
      !confirmed &&
      businessId &&
      selectedServices.length > 0
    ) {
      saveBookingDraft(businessId, {
        wasGuest: isGuest,
        guestName,
        guestEmail,
        serviceIds: selectedServices.map((s) => String(s.id)),
        staffId: selectedStaff
          ? selectedStaff.id === "any"
            ? "any"
            : String(selectedStaff.id)
          : null,
        dateYmd: selectedDate ? formatYmd(selectedDate) : null,
        time: selectedTime || null,
      });
    }
    onClose();
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") handleModalClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conflictHold]);

  const goBack = () => {
    setBookingError(null);
    if (conflictHold?.bookingId) {
      void declinePendingBooking(conflictHold.bookingId).catch(() => {});
      setConflictHold(null);
    }
    if (isGuest) {
      if (step === 2) {
        setStep(1);
        setSelectedServices([]);
      } else if (step === 3) {
        void releaseActiveSlotHold();
        setSelectedTime(null);
        setSlotHoldError(null);
        setResolvedHoldStaff(null);
        setStep(2);
        setSelectedStaff(null);
      } else if (step === 4) {
        void releaseActiveSlotHold();
        setSelectedTime(null);
        setSlotHoldError(null);
        setResolvedHoldStaff(null);
        setStep(3);
        setSelectedDate(null);
        setSlots([]);
        setSlotsError(null);
      } else if (step === 5) {
        setStep(4);
      }
    } else if (step === 2) {
      void releaseActiveSlotHold();
      setSelectedTime(null);
      setSlotHoldError(null);
      setResolvedHoldStaff(null);
      setStep(1);
      setSelectedStaff(null);
    } else if (step === 3) {
      void releaseActiveSlotHold();
      setSelectedTime(null);
      setSlotHoldError(null);
      setResolvedHoldStaff(null);
      setStep(2);
      setSelectedDate(null);
      setSlots([]);
      setSlotsError(null);
    } else if (step === 4) {
      setStep(3);
    }
  };

  const stepLabels = isGuest
    ? ["Your details", "Services", "Staff", "Date & Time", "Confirm"]
    : ["Services", "Staff", "Date & Time", "Confirm"];

  const dateContinueDisabled =
    !selectedDate ||
    !selectedTime ||
    slotHoldBusy ||
    slotsLoading ||
    Boolean(slotsError) ||
    (slots.length > 0 && !slots.some((s) => s.available));

  const guestStep1Invalid =
    isGuest &&
    (!guestName.trim() ||
      guestName.trim().length < 2 ||
      !isValidEmail(guestEmail));

  const totalsSummaryText =
    selectedServices.length > 0
      ? `${selectedServices.length} service${selectedServices.length === 1 ? "" : "s"} · ${formatMinutesLabel(totalDurationMinutes)} · ${formatPrice(totalEffectivePrice)}`
      : "";

  const finalPriceDisplay =
    couponPreview != null
      ? Number(couponPreview.finalPrice)
      : totalEffectivePrice;

  if (!isOpen) return null;

  return (
    <div className="bm-overlay" onClick={handleModalClose}>
      <div className="bm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button className="bm-close" onClick={handleModalClose}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 15L15 5M5 5L15 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {conflictHold ? (
          <div
            className="bm-conflict-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bm-conflict-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bm-conflict-card">
              <h3 id="bm-conflict-title">That time was just taken</h3>
              <p className="bm-conflict-lead">
                Someone else booked your chosen slot first. Here is the next
                available option — your reservation is{" "}
                <strong>not final yet</strong>.
              </p>
              <div className="bm-conflict-booking-box" role="status">
                <span className="bm-conflict-booking-label">
                  If you confirm, your booking will be:
                </span>
                <p className="bm-conflict-booking-main">
                  <strong>{conflictHold.suggestedSlot?.startTime}</strong>
                  {selectedDate ? (
                    <>
                      {" "}
                      on <strong>{formatFull(selectedDate)}</strong>
                    </>
                  ) : null}
                  {conflictHold.suggestedSlot?.staffName ? (
                    <>
                      {" "}
                      with{" "}
                      <strong>{conflictHold.suggestedSlot.staffName}</strong>
                    </>
                  ) : null}
                </p>
              </div>
              <p className="bm-conflict-deadline">
                Tap <strong>Confirm this time</strong> below to complete your
                booking. If you don&apos;t confirm
                {conflictHold.expiresAt ? (
                  <>
                    {" "}
                    before{" "}
                    <strong>
                      {new Date(conflictHold.expiresAt).toLocaleTimeString(
                        undefined,
                        { hour: "numeric", minute: "2-digit" },
                      )}
                    </strong>
                  </>
                ) : null}{" "}
                (about {conflictHold.holdMinutes} minutes), this slot will be
                released — that deadline is <em>not</em> your appointment time;
                your visit time is{" "}
                <strong>{conflictHold.suggestedSlot?.startTime}</strong>.
              </p>
              <div className="bm-conflict-actions">
                <button
                  type="button"
                  className="bm-next-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={handleConfirmAlternativeSlot}
                  disabled={bookingSubmitting}
                >
                  {bookingSubmitting ? "Confirming…" : "Confirm this time"}
                </button>
                <button
                  type="button"
                  className="bm-back-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={handleDeclineAlternativeSlot}
                  disabled={bookingSubmitting}
                >
                  Choose another time
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {confirmed ? (
          <div className="bm-success">
            <div className="bm-success-icon">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="28" fill="#ECFDF5" />
                <path
                  d="M18 28.5L24 34.5L38 20.5"
                  stroke="#10B981"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2>Booking Confirmed!</h2>
            <p>Your appointment has been booked successfully</p>
            <div className="bm-confirm-summary">
              <div className="bm-confirm-row">
                <span>
                  {selectedServices.length > 1 ? "Services" : "Service"}
                </span>
                <strong>
                  {selectedServices.length > 1 ? (
                    <span className="bm-confirm-services-list">
                      {selectedServices.map((s, i) => (
                        <span key={s.id} className="bm-confirm-service-chip">
                          {s.name}
                          {i < selectedServices.length - 1 ? " +" : ""}
                        </span>
                      ))}
                    </span>
                  ) : (
                    selectedServices[0]?.name
                  )}
                </strong>
              </div>
              <div className="bm-confirm-row">
                <span>Staff</span>
                <strong>{selectedStaff?.name}</strong>
              </div>
              <div className="bm-confirm-row">
                <span>Date</span>
                <strong>{selectedDate && formatFull(selectedDate)}</strong>
              </div>
              <div className="bm-confirm-row">
                <span>Time</span>
                <strong>{selectedTime}</strong>
              </div>
              <div className="bm-confirm-row">
                <span>Total</span>
                <strong>
                  {hasAnyActivePromo && totalListPrice > totalEffectivePrice ? (
                    <>
                      <span
                        style={{
                          textDecoration: "line-through",
                          color: "#94a3b8",
                          marginRight: 8,
                          fontWeight: 600,
                        }}
                      >
                        {formatPrice(totalListPrice)}
                      </span>
                      {formatPrice(finalPriceDisplay)}
                    </>
                  ) : (
                    formatPrice(finalPriceDisplay)
                  )}
                </strong>
              </div>
            </div>
            <p className="bm-confirm-note">
              {guestCredentialsEmailed
                ? "We emailed your booking confirmation and your new account details (including a temporary password — you can change it anytime in your profile)."
                : "A confirmation email has been sent to your inbox."}
            </p>
            <button className="bm-done-btn" onClick={onClose}>
              Done
            </button>
          </div>
        ) : showResumePrompt ? (
          <div className="bm-resume-prompt">
            <h2 className="bm-resume-title">Continue your booking?</h2>
            <p className="bm-resume-lead">
              Pick up where you left off —{" "}
              <strong>
                {formatResumeDraftSummary(resumeDraftRef.current || {})}
              </strong>
              . Your time slot isn&apos;t held until you choose it again.
            </p>
            <div className="bm-resume-actions">
              <button
                type="button"
                className="bm-next-btn bm-resume-primary"
                onClick={handleResumeContinue}
              >
                Continue
              </button>
              <button
                type="button"
                className="bm-back-btn bm-resume-secondary"
                onClick={handleResumeStartFresh}
              >
                Start fresh
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bm-header">
              <h2>Book at {businessName}</h2>
              {/* Progress */}
              <div className="bm-progress">
                {stepLabels.map((label, i) => (
                  <div
                    key={i}
                    className={`bm-progress-step ${i + 1 <= step ? "active" : ""} ${i + 1 < step ? "done" : ""}`}
                  >
                    <div className="bm-progress-dot">
                      {i + 1 < step ? (
                        <HiCheck size={20} strokeWidth={2.5} />
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    <span className="bm-progress-label">{label}</span>
                    {i < stepLabels.length - 1 && (
                      <div className="bm-progress-line" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bm-body">
              {closingPeriods.length > 0 ? (
                <div className="bm-closing-banner" role="status">
                  <div className="bm-closing-banner-title">
                    Closed to new bookings:
                  </div>
                  <ul className="bm-closing-banner-list">
                    {closingPeriods.map((p) => (
                      <li key={p.id}>
                        <span className="bm-closing-banner-range">
                          {formatClosingPeriodRange(p)}
                        </span>
                        {p.reason ? (
                          <span className="bm-closing-banner-reason">
                            {" "}
                            ({p.reason})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {step === 1 && isGuest && (
                <div className="bm-step">
                  <h3>Your details</h3>
                  <p className="bm-slots-msg" style={{ marginBottom: 16 }}>
                    Book without a full account. We&apos;ll create one for you
                    and email a temporary password so you can sign in and manage
                    this booking.
                  </p>
                  <div className="bm-guest-fields">
                    <label className="bm-guest-label" htmlFor="bm-guest-name">
                      Full name
                    </label>
                    <input
                      id="bm-guest-name"
                      type="text"
                      className="bm-guest-input form-control"
                      autoComplete="name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Jane Doe"
                    />
                    <label className="bm-guest-label" htmlFor="bm-guest-email">
                      Email
                    </label>
                    <input
                      id="bm-guest-email"
                      type="email"
                      className="bm-guest-input form-control"
                      autoComplete="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              )}

              {/* Service (multi-select) */}
              {step === serviceStep && (
                <div className="bm-step">
                  <div className="bm-step-head">
                    <h3>Choose one or more services</h3>
                    <p className="bm-step-hint">
                      Combine services into a single appointment — we&apos;ll
                      reserve enough time for all of them.
                    </p>
                  </div>
                  <div className="bm-service-list">
                    {services.map((s) => {
                      const pv = getPromotionView(s, todayIsoDate());
                      const isSelected = selectedServices.some(
                        (x) => String(x.id) === String(s.id),
                      );
                      const orderIndex = selectedServices.findIndex(
                        (x) => String(x.id) === String(s.id),
                      );
                      const reachedMax =
                        !isSelected &&
                        selectedServices.length >= MAX_SERVICES_PER_BOOKING;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={isSelected}
                          aria-disabled={reachedMax}
                          className={`bm-service-item bm-service-item--multi ${isSelected ? "selected" : ""} ${pv ? "bm-service-item--promo" : ""} ${reachedMax ? "bm-service-item--disabled" : ""}`}
                          onClick={() => {
                            if (reachedMax) return;
                            toggleService(s);
                          }}
                        >
                          <div className="bm-service-info">
                            <span className="bm-service-name">
                              {isSelected ? (
                                <span
                                  className="bm-service-order-badge"
                                  aria-label={`Selected #${orderIndex + 1}`}
                                >
                                  {orderIndex + 1}
                                </span>
                              ) : null}
                              {s.name}
                            </span>
                            <span className="bm-service-meta">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                              >
                                <circle
                                  cx="6"
                                  cy="6"
                                  r="4.5"
                                  stroke="currentColor"
                                  strokeWidth="1"
                                />
                                <path
                                  d="M6 3.5V6L7.5 7"
                                  stroke="currentColor"
                                  strokeWidth="1"
                                  strokeLinecap="round"
                                />
                              </svg>
                              {s.duration} min
                            </span>
                          </div>
                          <span className="bm-service-price">
                            {pv ? (
                              <>
                                <span className="bm-price-old">
                                  {formatPrice(pv.basePrice)}
                                </span>
                                <span className="bm-price-sale">
                                  {formatPrice(pv.salePrice)}
                                </span>
                                <span className="bm-pct-badge">
                                  −{pv.percentOff}%
                                </span>
                              </>
                            ) : (
                              formatPrice(s.price)
                            )}
                          </span>
                          <div
                            className={`bm-checkbox ${isSelected ? "checked" : ""}`}
                            aria-hidden
                          >
                            {isSelected ? (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                              >
                                <path
                                  d="M2 6.5L4.5 9L10 3"
                                  stroke="#fff"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedServices.length > 0 ? (
                    <div className="bm-multi-summary" role="status">
                      <div className="bm-multi-summary-left">
                        <span className="bm-multi-summary-count">
                          {selectedServices.length} selected
                        </span>
                        <span className="bm-multi-summary-dot">·</span>
                        <span className="bm-multi-summary-metric">
                          {formatMinutesLabel(totalDurationMinutes)}
                        </span>
                      </div>
                      <span className="bm-multi-summary-total">
                        {hasAnyActivePromo &&
                        totalListPrice > totalEffectivePrice ? (
                          <>
                            <span className="bm-price-old">
                              {formatPrice(totalListPrice)}
                            </span>
                            <span className="bm-multi-summary-total-num">
                              {formatPrice(totalEffectivePrice)}
                            </span>
                          </>
                        ) : (
                          <span className="bm-multi-summary-total-num">
                            {formatPrice(totalEffectivePrice)}
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    <p className="bm-slots-msg" style={{ marginTop: 12 }}>
                      Pick at least one service to continue.
                    </p>
                  )}
                </div>
              )}

              {/* Staff (filtered to those who offer every selected service) */}
              {step === staffStep && (
                <div className="bm-step">
                  <h3>Choose a Staff Member</h3>
                  {selectedServices.length > 1 ? (
                    <p
                      className="bm-slots-msg"
                      style={{ margin: "0 0 12px", fontSize: 13 }}
                    >
                      Only showing staff who can perform all{" "}
                      {selectedServices.length} selected services.
                    </p>
                  ) : null}
                  <div className="bm-staff-list">
                    {eligibleStaff.length === 0 ? (
                      <div className="bm-staff-empty" role="status">
                        <div className="bm-staff-empty-icon" aria-hidden>
                          <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              cx="12"
                              cy="8"
                              r="4"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                            <path
                              d="M4 20c1.5-3.5 5-5 8-5s6.5 1.5 8 5"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                            <path
                              d="M4 4l16 16"
                              stroke="#ef4444"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <h4 className="bm-staff-empty-title">
                          No one can do all of these together
                        </h4>
                        <p className="bm-staff-empty-text">
                          None of the staff are trained in every service you
                          picked. Remove a service to expand your options.
                        </p>
                        <button
                          type="button"
                          className="bm-staff-empty-action"
                          onClick={() => setStep(serviceStep)}
                        >
                          ← Back to services
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`bm-staff-item ${selectedStaff?.id === "any" ? "selected" : ""}`}
                          onClick={async () => {
                            await releaseActiveSlotHold();
                            setSelectedTime(null);
                            setSlotHoldError(null);
                            setResolvedHoldStaff(null);
                            setSelectedStaff({
                              id: "any",
                              name: "Anyone Available",
                            });
                          }}
                        >
                          <div className="bm-staff-avatar any">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 20 20"
                              fill="none"
                            >
                              <circle
                                cx="10"
                                cy="10"
                                r="8"
                                stroke="currentColor"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M7 10H13M10 7V13"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                          <div className="bm-staff-info">
                            <span className="bm-staff-name">
                              Anyone Available
                            </span>
                            <span className="bm-staff-role">
                              Picks an available team member using this
                              business’s smart ranking (reviews, reliability, and
                              schedule availability).
                            </span>
                          </div>
                          <div className="bm-radio">
                            <div className="bm-radio-inner" />
                          </div>
                        </button>
                        {eligibleStaff.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`bm-staff-item ${String(selectedStaff?.id) === String(s.id) ? "selected" : ""}`}
                            onClick={async () => {
                              await releaseActiveSlotHold();
                              setSelectedTime(null);
                              setSlotHoldError(null);
                              setResolvedHoldStaff(null);
                              setSelectedStaff(s);
                            }}
                          >
                            <div
                              className="bm-staff-avatar bm-staff-avatar--letter"
                              aria-hidden
                            >
                              {staffNameInitial(s.name)}
                            </div>
                            <div className="bm-staff-info">
                              <span className="bm-staff-name">{s.name}</span>
                              <span className="bm-staff-role">{s.role}</span>
                            </div>
                            <div className="bm-radio">
                              <div className="bm-radio-inner" />
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Date & Time */}
              {step === dateStep && (
                <div className="bm-step">
                  <h3>Pick a Date & Time</h3>
                  {!businessId ? (
                    <p className="bm-slots-msg" style={{ color: "#b91c1c" }}>
                      Missing business id — cannot load availability.
                    </p>
                  ) : null}
                  <p className="bm-date-step-hint">
                    Tap a date, then choose a time. You can jump months from the
                    dropdowns.
                    {totalDurationMinutes > 0 ? (
                      <>
                        {" "}
                        We&apos;ll reserve{" "}
                        <strong>
                          {formatMinutesLabel(totalDurationMinutes)}
                        </strong>{" "}
                        starting at your chosen time.
                      </>
                    ) : null}
                  </p>
                  {staffTimeOffBanner ? (
                    <p className="bm-staff-timeoff-notice" role="note">
                      <strong>{staffTimeOffBanner.name}</strong> is unavailable
                      on the marked calendar days during:{" "}
                      {staffTimeOffBanner.parts.join("; ")}. Those dates cannot
                      be booked for this team member.
                    </p>
                  ) : null}
                  <div className="bm-booking-calendar-wrap">
                    <DayPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={async (d) => {
                        if (!d) return;
                        await releaseActiveSlotHold();
                        setSlotHoldError(null);
                        setResolvedHoldStaff(null);
                        setSelectedDate(d);
                        setSelectedTime(null);
                      }}
                      locale={enUS}
                      disabled={(date) => isBookingDayDisabled(date)}
                      startMonth={calendarStartMonth}
                      endMonth={calendarEndMonth}
                      defaultMonth={
                        selectedDate &&
                        startOfDay(selectedDate) >= bookingToday &&
                        startOfDay(selectedDate) <= bookingLastDay
                          ? selectedDate
                          : bookingToday
                      }
                      captionLayout="dropdown"
                      fromYear={calendarFromYear}
                      toYear={calendarToYear}
                      modifiers={calendarModifiers}
                      modifiersClassNames={calendarModifiersClassNames}
                      className="dp-booking-day-picker bm-booking-day-picker"
                    />
                  </div>
                  {closingPeriods.length > 0 ? (
                    <p className="bm-calendar-legend" role="note">
                      <span className="bm-calendar-legend-swatch" aria-hidden />
                      Days with a warm highlight overlap a scheduled closure —
                      some hours may still be bookable.
                    </p>
                  ) : null}
                  <p className="bm-calendar-heat-legend" role="note">
                    <span className="bm-calendar-heat-legend__label">
                      Greener days have more open times (only those can be
                      selected). Grey is closed; red tones are too full to book.
                    </span>
                    <span
                      className="bm-calendar-heat-legend__swatches"
                      aria-hidden="true"
                    >
                      <span className="bm-heat-leg bm-heat-leg--0" />
                      <span className="bm-heat-leg bm-heat-leg--2" />
                      <span className="bm-heat-leg bm-heat-leg--4" />
                    </span>
                  </p>
                  <p className="bm-calendar-range-hint">
                    You can book from{" "}
                    <strong>
                      {bookingToday.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </strong>{" "}
                    through{" "}
                    <strong>
                      {bookingLastDay.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </strong>{" "}
                    (<strong>{safeAdvance}</strong> days). Months outside this
                    range are hidden — the business sets how far ahead bookings
                    open.
                  </p>

                  {selectedDate && businessId ? (
                    <div className="bm-times-section">
                      <h4>Available Times</h4>
                      <p className="bm-slot-step-caption">
                        Openings are based on free time left in the schedule for
                        this day. Times that are fully booked may have a
                        waitlist — if someone cancels, we email the next person a
                        link to claim the slot.
                      </p>
                      {slotsLoading ? (
                        <p className="bm-slots-msg">Loading times…</p>
                      ) : null}
                      {slotsError ? (
                        <p
                          className="bm-slots-msg"
                          style={{ color: "#b91c1c" }}
                          role="alert"
                        >
                          {slotsError}
                        </p>
                      ) : null}
                      {slotHoldError ? (
                        <p
                          className="bm-slots-msg"
                          style={{ color: "#b91c1c" }}
                          role="alert"
                        >
                          {slotHoldError}
                        </p>
                      ) : null}
                      {slotHoldBusy ? (
                        <p className="bm-slots-msg" aria-live="polite">
                          Reserving this time…
                        </p>
                      ) : null}
                      {!slotsLoading && !slotsError && slots.length === 0 ? (
                        <p className="bm-slots-msg bm-slots-msg--empty">
                          No openings on this day. The business may be closed,
                          or this appointment doesn&apos;t fit in the schedule.
                          Try another date.
                        </p>
                      ) : null}
                      {!slotsLoading &&
                      !slotsError &&
                      slots.length > 0 &&
                      !slots.some((s) => s.available) &&
                      !slots.some((s) => s.unavailableReason === "full") ? (
                        <p className="bm-slots-msg bm-slots-msg--empty">
                          No times available — the business may be closed for
                          this period (including scheduled closures) or
                          everything is booked. Try another date.
                        </p>
                      ) : null}
                      {!slotsLoading &&
                      !slotsError &&
                      slots.length > 0 &&
                      (slots.some((s) => s.available) ||
                        slots.some(
                          (s) => s.unavailableReason === "full",
                        )) ? (
                        <>
                          <div
                            className={`bm-times-grid${availabilityOfferStep <= 10 ? " bm-times-dense" : ""}`}
                          >
                            {slots.map((slot, i) => {
                              const held =
                                !slot.available &&
                                slot.unavailableReason === "held";
                              const fullForWaitlist =
                                !slot.available &&
                                slot.unavailableReason === "full";
                              const canWaitlistHere =
                                fullForWaitlist &&
                                selectedServices.length > 0 &&
                                selectedStaff &&
                                staffIdParamForWaitlist;
                              const slotBtn = (
                                <button
                                  type="button"
                                  className={`bm-time-slot ${selectedTime === slot.time ? "selected" : ""} ${!slot.available ? "unavailable" : ""} ${held ? "held" : ""}`}
                                  onClick={() => void handlePickTime(slot)}
                                  disabled={!slot.available || slotHoldBusy}
                                >
                                  {slot.time}
                                </button>
                              );
                              if (held) {
                                return (
                                  <AppTooltip
                                    key={`${slot.time}-${i}`}
                                    disabled
                                    placement="top-start"
                                    content={HELD_SLOT_TOOLTIP}
                                  >
                                    {slotBtn}
                                  </AppTooltip>
                                );
                              }
                              if (fullForWaitlist && canWaitlistHere) {
                                return (
                                  <div
                                    key={`${slot.time}-${i}`}
                                    className="bm-slot-cell bm-slot-cell--full"
                                  >
                                    {slotBtn}
                                    <button
                                      type="button"
                                      className="bm-waitlist-cta"
                                      disabled={
                                        slotHoldBusy ||
                                        waitlistBusyTime === slot.time
                                      }
                                      onClick={() =>
                                        onJoinWaitlistClick(slot)
                                      }
                                    >
                                      {waitlistBusyTime === slot.time
                                        ? "…"
                                        : "Waitlist"}
                                    </button>
                                  </div>
                                );
                              }
                              return cloneElement(slotBtn, {
                                key: `${slot.time}-${i}`,
                              });
                            })}
                          </div>
                          {waitlistMessage ? (
                            <p
                              className={`bm-slots-msg ${waitlistMessage.type === "err" ? "bm-waitlist-msg--err" : ""}`}
                              style={
                                waitlistMessage.type === "err"
                                  ? { color: "#b91c1c" }
                                  : { color: "#15803d" }
                              }
                              role="status"
                            >
                              {waitlistMessage.text}
                            </p>
                          ) : null}
                          {isGuest && guestWaitlistSlot ? (
                            <div className="bm-waitlist-guest-form">
                              <p className="bm-waitlist-guest-title">
                                Waitlist for {guestWaitlistSlot}
                              </p>
                              <div className="bm-waitlist-guest-fields">
                                <label className="bm-wl-field">
                                  <span>Name</span>
                                  <input
                                    type="text"
                                    autoComplete="name"
                                    value={guestWaitlistName}
                                    onChange={(e) =>
                                      setGuestWaitlistName(e.target.value)
                                    }
                                  />
                                </label>
                                <label className="bm-wl-field">
                                  <span>Email</span>
                                  <input
                                    type="email"
                                    autoComplete="email"
                                    value={guestWaitlistEmail}
                                    onChange={(e) =>
                                      setGuestWaitlistEmail(e.target.value)
                                    }
                                  />
                                </label>
                              </div>
                              <div className="bm-waitlist-guest-actions">
                                <button
                                  type="button"
                                  className="bm-waitlist-submit"
                                  disabled={
                                    !!waitlistBusyTime ||
                                    !guestWaitlistName.trim() ||
                                    !isValidEmail(guestWaitlistEmail)
                                  }
                                  onClick={() =>
                                    void submitWaitlist(
                                      guestWaitlistSlot,
                                      guestWaitlistName,
                                      guestWaitlistEmail,
                                    )
                                  }
                                >
                                  {waitlistBusyTime
                                    ? "Submitting…"
                                    : "Notify me if it opens"}
                                </button>
                                <button
                                  type="button"
                                  className="bm-waitlist-cancel"
                                  onClick={() => setGuestWaitlistSlot(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Confirm */}
              {step === confirmStep && (
                <div className="bm-step">
                  <h3>Review Your Booking</h3>
                  {bookingError ? (
                    <p
                      className="bm-slots-msg"
                      style={{ color: "#b91c1c", marginBottom: 12 }}
                      role="alert"
                    >
                      {bookingError}
                    </p>
                  ) : null}
                  <div className="bm-review-card">
                    <div className="bm-review-row">
                      <div className="bm-review-icon">📋</div>
                      <div style={{ flex: 1 }}>
                        <span className="bm-review-label">
                          {selectedServices.length > 1
                            ? `Services (${selectedServices.length})`
                            : "Service"}
                        </span>
                        {selectedServices.length === 1 ? (
                          <span className="bm-review-value">
                            {selectedServices[0]?.name}
                          </span>
                        ) : (
                          <ul className="bm-review-services">
                            {selectedServices.map((svc) => {
                              const priceForDay = bookingDayYmd
                                ? getEffectivePriceForUi(svc, bookingDayYmd)
                                : svc.price;
                              return (
                                <li
                                  key={svc.id}
                                  className="bm-review-services-item"
                                >
                                  <span className="bm-review-services-name">
                                    {svc.name}
                                  </span>
                                  <span className="bm-review-services-meta">
                                    {svc.duration} min ·{" "}
                                    {formatPrice(priceForDay)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="bm-review-row">
                      <div className="bm-review-icon">
                        <HiOutlineUser size={18} aria-hidden />
                      </div>
                      <div>
                        <span className="bm-review-label">Staff</span>
                        <span className="bm-review-value">
                          {selectedStaff?.id === "any" && resolvedHoldStaff
                            ? resolvedHoldStaff.name
                            : selectedStaff?.name}
                        </span>
                      </div>
                    </div>
                    <div className="bm-review-row">
                      <div className="bm-review-icon">
                        <HiOutlineCalendar size={18} aria-hidden />
                      </div>
                      <div>
                        <span className="bm-review-label">Date</span>
                        <span className="bm-review-value">
                          {selectedDate && formatFull(selectedDate)}
                        </span>
                      </div>
                    </div>
                    <div className="bm-review-row">
                      <div className="bm-review-icon">
                        <HiOutlineClock size={18} aria-hidden />
                      </div>
                      <div>
                        <span className="bm-review-label">Time</span>
                        <span className="bm-review-value">{selectedTime}</span>
                      </div>
                    </div>
                    <div className="bm-review-row">
                      <div className="bm-review-icon">
                        <HiOutlineClipboardList size={18} aria-hidden />
                      </div>
                      <div>
                        <span className="bm-review-label">Total duration</span>
                        <span className="bm-review-value">
                          {formatMinutesLabel(totalDurationMinutes)}
                        </span>
                      </div>
                    </div>
                    <div className="bm-coupon-block">
                      <span
                        className="bm-review-label"
                        style={{ marginBottom: 8 }}
                      >
                        Coupon code (optional)
                      </span>
                      <div className="bm-coupon-row">
                        <input
                          type="text"
                          className="bm-coupon-input form-control"
                          placeholder="e.g. SPRING20"
                          value={couponCodeInput}
                          onChange={(e) => {
                            setCouponCodeInput(e.target.value);
                            setCouponPreview(null);
                            setCouponMsg(null);
                          }}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className="bm-coupon-apply"
                          onClick={handleApplyCoupon}
                          disabled={
                            couponApplyLoading ||
                            selectedServices.length === 0 ||
                            !bookingDayYmd
                          }
                        >
                          {couponApplyLoading ? "…" : "Apply"}
                        </button>
                      </div>
                      {couponMsg ? (
                        <p
                          className={`bm-coupon-msg ${couponMsg.type === "ok" ? "bm-coupon-msg--ok" : "bm-coupon-msg--err"}`}
                          role={couponMsg.type === "err" ? "alert" : undefined}
                        >
                          {couponMsg.text}
                        </p>
                      ) : null}
                    </div>
                    <div className="bm-review-total">
                      <span>Total</span>
                      <span className="bm-total-price-wrap">
                        {couponPreview ? (
                          <>
                            <span className="bm-price-old">
                              {formatPrice(couponPreview.basePrice)}
                            </span>
                            <span className="bm-total-price">
                              {formatPrice(couponPreview.finalPrice)}
                            </span>
                            <span className="bm-pct-badge">
                              Coupon −{couponPreview.discountPercent}%
                            </span>
                          </>
                        ) : hasAnyActivePromo &&
                          totalListPrice > totalEffectivePrice ? (
                          <>
                            <span className="bm-price-old">
                              {formatPrice(totalListPrice)}
                            </span>
                            <span className="bm-total-price">
                              {formatPrice(totalEffectivePrice)}
                            </span>
                            <span className="bm-pct-badge">Promo applied</span>
                          </>
                        ) : (
                          <span className="bm-total-price">
                            {formatPrice(totalEffectivePrice)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bm-footer">
              {step > 1 && (
                <button
                  type="button"
                  className="bm-back-btn"
                  onClick={goBack}
                  disabled={bookingSubmitting}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M13 8H3M3 8L7 4M3 8L7 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Back
                </button>
              )}
              {step === serviceStep && totalsSummaryText ? (
                <span className="bm-footer-summary" aria-live="polite">
                  {totalsSummaryText}
                </span>
              ) : null}
              <button
                type="button"
                className="bm-next-btn"
                onClick={() =>
                  step === confirmStep ? handleConfirm() : setStep(step + 1)
                }
                disabled={
                  (step === 1 && isGuest && guestStep1Invalid) ||
                  (step === serviceStep && selectedServices.length === 0) ||
                  (step === staffStep && !selectedStaff) ||
                  (step === dateStep && dateContinueDisabled) ||
                  (step === confirmStep && bookingSubmitting) ||
                  (step === confirmStep &&
                    Boolean(couponCodeInput.trim()) &&
                    !couponPreview)
                }
              >
                {step === confirmStep
                  ? bookingSubmitting
                    ? "Booking…"
                    : "Confirm Booking"
                  : "Continue"}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8H13M13 8L9 4M13 8L9 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BookingModal;
