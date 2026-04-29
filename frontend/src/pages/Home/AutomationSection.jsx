import { Link } from "react-router-dom";
import {
  HiOutlineArrowRight,
  HiOutlineCalendar,
  HiOutlineMail,
  HiOutlineStar,
  HiOutlineCreditCard,
} from "react-icons/hi";

const FLOW = [
  {
    icon: HiOutlineCalendar,
    label: "Bookings",
    hint: "Live availability",
  },
  {
    icon: HiOutlineMail,
    label: "Reminders",
    hint: "Email & SMS",
  },
  {
    icon: HiOutlineCreditCard,
    label: "Payments",
    hint: "When you want",
  },
  {
    icon: HiOutlineStar,
    label: "Reviews",
    hint: "After the visit",
  },
];

const AutomationSection = () => {
  return (
    <section className="home-unified spacing-section">
      <div className="container">
        <div className="home-unified__shell">
          <div className="home-unified__glow" aria-hidden />
          <div className="home-unified__glow home-unified__glow--2" aria-hidden />

          <div className="home-unified__layout">
            <div className="home-unified__copy">
              <p className="home-unified__eyebrow">One connected system</p>
              <h2 className="home-unified__title">
                <span className="home-unified__title-line">Everything</span>
                <span className="home-unified__title-gradient">connected</span>
              </h2>
              <p className="home-unified__lead">
                Bookings, payments, reminders, and reviews flow through one
                place — no double-booking, no lost messages, full visibility from
                first click to completed visit.
              </p>
              <Link to="/sign-up" className="home-unified__cta">
                Get started
                <HiOutlineArrowRight size={18} strokeWidth={2} />
              </Link>
            </div>

            <div className="home-unified__bento" aria-hidden>
              {FLOW.map((item) => (
                <div key={item.label} className="home-unified__tile">
                  <span className="home-unified__tile-icon">
                    <item.icon size={22} strokeWidth={1.75} />
                  </span>
                  <span className="home-unified__tile-label">{item.label}</span>
                  <span className="home-unified__tile-hint">{item.hint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AutomationSection;
