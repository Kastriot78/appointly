import { useState, useMemo } from "react";
import { HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi";
import "./dashboard-pages.css";

const mockEvents = [
  {
    id: 1,
    service: "Prerje + mjekër",
    client: "Arlind K.",
    staff: "Fisi",
    time: "09:00",
    duration: 45,
    color: "#4f46e5",
    day: 1,
  },
  {
    id: 2,
    service: "Ngjyrosje",
    client: "Leutrim M.",
    staff: "Fisi",
    time: "10:30",
    duration: 60,
    color: "#10b981",
    day: 1,
  },
  {
    id: 3,
    service: "Prerje flokësh",
    client: "Blend S.",
    staff: "Drini",
    time: "09:30",
    duration: 30,
    color: "#f59e0b",
    day: 2,
  },
  {
    id: 4,
    service: "Hot Towel Shave",
    client: "Artan D.",
    staff: "Drini",
    time: "14:00",
    duration: 25,
    color: "#ef4444",
    day: 2,
  },
  {
    id: 5,
    service: "Facial Treatment",
    client: "Valon H.",
    staff: "Arton",
    time: "11:00",
    duration: 30,
    color: "#8b5cf6",
    day: 3,
  },
  {
    id: 6,
    service: "Prerje + mjekër",
    client: "Driton B.",
    staff: "Fisi",
    time: "15:00",
    duration: 45,
    color: "#4f46e5",
    day: 4,
  },
  {
    id: 7,
    service: "Kids Haircut",
    client: "Albion M.",
    staff: "Arton",
    time: "10:00",
    duration: 20,
    color: "#06b6d4",
    day: 5,
  },
  {
    id: 8,
    service: "Prerje flokësh",
    client: "Rinor S.",
    staff: "Drini",
    time: "16:00",
    duration: 30,
    color: "#f59e0b",
    day: 5,
  },
];

const CalendarPage = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const hours = Array.from(
    { length: 10 },
    (_, i) => `${String(i + 8).padStart(2, "0")}:00`,
  );

  const isToday = (d) => {
    const t = new Date();
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  };

  const formatDay = (d) => d.toLocaleDateString("en-US", { weekday: "short" });
  const formatNum = (d) => d.getDate();
  const formatWeekRange = () => {
    const first = weekDays[0];
    const last = weekDays[6];
    const opts = { month: "short", day: "numeric" };
    return `${first.toLocaleDateString("en-US", opts)} – ${last.toLocaleDateString("en-US", opts)}, ${last.getFullYear()}`;
  };

  const prevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const nextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const getEventsForDay = (dayIndex) =>
    mockEvents.filter((e) => e.day === dayIndex + 1);

  const timeToTop = (time) => {
    const [h, m] = time.split(":").map(Number);
    return ((h - 8) * 60 + m) * (60 / 60);
  };

  return (
    <div className="dp-page dt-calendar-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Calendar</h1>
          <p className="dp-subtitle">{formatWeekRange()}</p>
        </div>
        <div className="dt-cal-controls">
          <button className="dt-cal-today" onClick={goToday}>
            Today
          </button>
          <div className="dt-cal-nav">
            <button onClick={prevWeek}>
              <HiOutlineChevronLeft size={18} />
            </button>
            <button onClick={nextWeek}>
              <HiOutlineChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="dt-calendar-wrapper">
        <div className="dt-cal-grid">
          {/* Time column */}
          <div className="dt-cal-times">
            <div className="dt-cal-header-cell" />
            {hours.map((h) => (
              <div key={h} className="dt-cal-time">
                {h}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => (
            <div
              key={dayIdx}
              className={`dt-cal-day-col ${isToday(day) ? "today" : ""}`}
            >
              <div
                className={`dt-cal-header-cell ${isToday(day) ? "today" : ""}`}
              >
                <span className="dt-cal-day-name">{formatDay(day)}</span>
                <span className="dt-cal-day-num">{formatNum(day)}</span>
              </div>
              <div className="dt-cal-day-body">
                {hours.map((_, i) => (
                  <div key={i} className="dt-cal-hour-cell" />
                ))}
                {/* Events */}
                {getEventsForDay(dayIdx).map((event) => (
                  <div
                    key={event.id}
                    className="dt-cal-event"
                    style={{
                      top: `${timeToTop(event.time)}px`,
                      borderLeftColor: event.color,
                      background: `${event.color}10`,
                    }}
                  >
                    <span className="dt-event-time">{event.time}</span>
                    <span className="dt-event-service">{event.service}</span>
                    <span className="dt-event-client">
                      {event.client} · {event.staff}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
