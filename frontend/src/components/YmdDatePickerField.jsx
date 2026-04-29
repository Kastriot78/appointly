import {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { HiOutlineCalendar } from "react-icons/hi";
import "react-day-picker/style.css";

function parseYmdToDate(str) {
  if (!str || typeof str !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(y, mo, d);
}

function dateToYmd(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function placePopoverFixed(btnRect, popW, popH, popoverAlign) {
  const margin = 10;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let top = btnRect.bottom + margin;
  if (top + popH > vh - margin) {
    top = btnRect.top - popH - margin;
  }
  if (top < margin) top = margin;
  const maxTop = Math.max(margin, vh - margin - popH);
  if (top > maxTop) top = maxTop;

  let left =
    popoverAlign === "end" ? btnRect.right - popW : btnRect.left;
  if (left + popW > vw - margin) left = vw - popW - margin;
  if (left < margin) left = margin;
  return { top, left };
}

/**
 * Single date field: value/onChange use "YYYY-MM-DD". Uses react-day-picker in a popover.
 * Optional minYmd / maxYmd (inclusive bounds) as YYYY-MM-DD strings.
 * Calendar is portaled to document.body so it is not clipped by scrollable modals.
 */
export default function YmdDatePickerField({
  label,
  value,
  onChange,
  minYmd,
  maxYmd,
  placeholder = "Choose date",
  popoverAlign = "start",
  /** Omit outer `.dp-field` for compact rows (e.g. staff time-off). */
  embedded = false,
  /** Extra classes on the inner `.dp-date-picker-wrap` (e.g. flex sizing). */
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const [fixedPos, setFixedPos] = useState(null);

  const selected = useMemo(() => parseYmdToDate(value), [value]);

  const disabled = useMemo(() => {
    return (d) => {
      const y = dateToYmd(d);
      if (minYmd && y < minYmd) return true;
      if (maxYmd && y > maxYmd) return true;
      return false;
    };
  }, [minYmd, maxYmd]);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const pop = popRef.current;
    const btn = wrap?.querySelector("button");
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const ph = Math.max(pop.offsetHeight, 320);
    const pw = Math.max(pop.offsetWidth, 280);
    setFixedPos(placePopoverFixed(rect, pw, ph, popoverAlign));
  }, [popoverAlign]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    reposition();
    const raf = requestAnimationFrame(reposition);
    const ro =
      typeof ResizeObserver !== "undefined" && popRef.current
        ? new ResizeObserver(() => reposition())
        : null;
    if (popRef.current && ro) ro.observe(popRef.current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition, selected]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleSelect = (d) => {
    if (!d) return;
    onChange(dateToYmd(d));
    setOpen(false);
  };

  const labelText =
    selected != null && !Number.isNaN(selected.getTime())
      ? format(selected, "EEE, MMM d, yyyy", { locale: enUS })
      : placeholder;

  const popoverEl =
    open &&
    createPortal(
      <div
        ref={popRef}
        className="dp-day-picker-popover dp-day-picker-popover--portal"
        style={{
          position: "fixed",
          top: fixedPos?.top ?? -9999,
          left: fixedPos?.left ?? 0,
          visibility: fixedPos ? "visible" : "hidden",
          zIndex: 1100,
        }}
        role="dialog"
        aria-label={label || "Choose date"}
      >
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected ?? new Date()}
          disabled={disabled}
          locale={enUS}
          className="dp-booking-day-picker"
        />
      </div>,
      document.body,
    );

  const wrapClass = [
    "dp-date-picker-wrap",
    "dp-date-picker-wrap--full",
    className.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <div className={wrapClass} ref={wrapRef}>
      <button
        type="button"
        className={`dp-date-picker-trigger dp-date-picker-trigger--field ${open ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HiOutlineCalendar size={18} aria-hidden />
        <span>{labelText}</span>
      </button>
      {popoverEl}
    </div>
  );

  if (embedded) {
    return (
      <>
        {label ? <label>{label}</label> : null}
        {inner}
      </>
    );
  }

  return (
    <div className="dp-field">
      {label ? <label>{label}</label> : null}
      {inner}
    </div>
  );
}
