import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineSearch,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineBell,
  HiOutlineChartBar,
} from "react-icons/hi";
import "./how-it-works.css";

const customerFlow = [
  {
    title: "Discover the right business",
    desc: "Search by category, rating, location, and availability to find the best fit in seconds.",
    Icon: HiOutlineSearch,
  },
  {
    title: "Choose service and time",
    desc: "Pick your service, preferred staff, and live time slot with no back-and-forth calls.",
    Icon: HiOutlineCalendar,
  },
  {
    title: "Confirm instantly",
    desc: "Book in one flow, with optional holds and waitlist fallback when demand is high.",
    Icon: HiOutlineCheckCircle,
  },
];

const businessFlow = [
  {
    title: "Set services and staff rules",
    desc: "Define duration, prices, staff assignment, and business hours once.",
    Icon: HiOutlineClock,
  },
  {
    title: "Automate reminders and updates",
    desc: "Clients get confirmations, reminders, and follow-ups automatically.",
    Icon: HiOutlineBell,
  },
  {
    title: "Optimize with analytics",
    desc: "Track booking trends, no-show risk, and team performance from one dashboard.",
    Icon: HiOutlineChartBar,
  },
];

const HERO_ROTATING_LINES = [
  "powerful for businesses.",
  "fast for teams.",
  "trusted by customers.",
  "built to scale.",
];

function FlowCard({ item, index }) {
  const Icon = item.Icon;
  return (
    <article className="hiw-card" style={{ animationDelay: `${index * 90}ms` }}>
      <span className="hiw-card-icon">
        <Icon size={20} />
      </span>
      <h3>{item.title}</h3>
      <p>{item.desc}</p>
    </article>
  );
}

export default function HowItWorks() {
  const [lineIndex, setLineIndex] = useState(0);
  const [lineVisible, setLineVisible] = useState(true);

  useEffect(() => {
    const loop = window.setInterval(() => {
      setLineVisible(false);
      window.setTimeout(() => {
        setLineIndex((prev) => (prev + 1) % HERO_ROTATING_LINES.length);
        setLineVisible(true);
      }, 260);
    }, 2400);
    return () => window.clearInterval(loop);
  }, []);

  return (
    <main className="hiw-page">
      <section className="hiw-hero">
        <div className="container hiw-hero-inner">
          <p className="hiw-eyebrow">How It Works</p>
          <h1>
            Booking made simple for clients,
            <span
              key={lineIndex}
              className={`hiw-hero-rotating ${lineVisible ? "is-visible" : "is-hidden"}`}
            >
              {HERO_ROTATING_LINES[lineIndex]}
            </span>
          </h1>
          <p className="hiw-sub">
            Appointly connects discovery, scheduling, reminders, and performance
            insights into one seamless journey from first click to repeat visit.
          </p>
        </div>
      </section>

      <section className="hiw-section">
        <div className="container">
          <header className="hiw-head">
            <h2>Client Journey</h2>
            <p>From finding a business to getting appointment-ready.</p>
          </header>
          <div className="hiw-grid">
            {customerFlow.map((item, i) => (
              <FlowCard key={item.title} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="hiw-section hiw-section-alt">
        <div className="container">
          <header className="hiw-head">
            <h2>Business Journey</h2>
            <p>Run operations faster while improving customer experience.</p>
          </header>
          <div className="hiw-grid">
            {businessFlow.map((item, i) => (
              <FlowCard key={item.title} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="hiw-cta">
        <div className="container">
          <div className="hiw-cta-inner">
            <h3>Ready to experience the full booking flow?</h3>
            <div className="hiw-cta-actions">
              <Link to="/book" className="hiw-btn hiw-btn-primary">
                Start Booking
              </Link>
              <Link to="/sign-up" className="hiw-btn hiw-btn-secondary">
                Create Business Account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
