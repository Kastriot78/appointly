import { useRef, useEffect, useMemo, useState } from "react";
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

export default function BookingsCalendarButton({
  pickDate,
  datePreset,
  onPickYmd,
  active,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = useMemo(
    () => (datePreset === "pick" && pickDate ? parseYmdToDate(pickDate) : undefined),
    [datePreset, pickDate],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleSelect = (d) => {
    if (!d) return;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    onPickYmd(`${y}-${mo}-${da}`);
    setOpen(false);
  };

  const label =
    datePreset === "pick" && pickDate
      ? format(parseYmdToDate(pickDate), "EEEE, MMM d, yyyy", { locale: enUS })
      : "Pick a date";

  return (
    <div className="dp-date-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`dp-date-picker-trigger ${active ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HiOutlineCalendar size={18} aria-hidden />
        <span>{label}</span>
      </button>
      {open ? (
        <div className="dp-day-picker-popover" role="dialog" aria-label="Choose date">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected ?? new Date()}
            locale={enUS}
            className="dp-booking-day-picker"
          />
        </div>
      ) : null}
    </div>
  );
}
