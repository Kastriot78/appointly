import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineCalendar,
  HiOutlineViewBoards,
  HiOutlineBell,
  HiOutlineCreditCard,
  HiOutlineUserGroup,
  HiOutlineStar,
  HiOutlineChartBar,
} from "react-icons/hi";

const offerings = [
  {
    id: "booking",
    Icon: HiOutlineCalendar,
    title: "Online Booking System",
    subtitle: "Let clients book you 24/7",
    description:
      "Your clients pick a service, choose a staff member, select a time slot, and book — all in under 30 seconds. No phone calls, no back-and-forth. Your booking page works on any device, anytime.",
    highlights: [
      "Public booking page with your brand",
      "Real-time availability — no double bookings",
      "Guest booking — no account required",
      "Automatic time zone detection",
      "Buffer time between appointments",
    ],
    stat: "40%",
    statText: "of bookings happen outside business hours",
  },
  {
    id: "calendar",
    Icon: HiOutlineViewBoards,
    title: "Smart Calendar & Scheduling",
    subtitle: "One view for your entire team",
    description:
      "See your entire team's schedule at a glance. Drag and drop to reschedule, block time off for breaks or holidays, and manage walk-ins alongside online bookings — all from one calendar.",
    highlights: [
      "Daily, weekly, and monthly views",
      "Drag & drop rescheduling",
      "Staff-specific schedules and working hours",
      "Block time off for holidays and breaks",
      "Google Calendar sync",
    ],
    stat: "100%",
    statText: "schedule visibility for your team",
  },
  {
    id: "reminders",
    Icon: HiOutlineBell,
    title: "Automated Reminders",
    subtitle: "Reduce no-shows by up to 70%",
    description:
      "Clients automatically receive confirmation emails, plus SMS and email reminders 24 hours and 1 hour before their appointment. You never have to manually remind anyone again.",
    highlights: [
      "Email confirmation on booking",
      "SMS reminders (24h and 1h before)",
      "Customizable reminder templates",
      "Cancellation and reschedule notifications",
      "Follow-up review requests after visits",
    ],
    stat: "70%",
    statText: "reduction in no-shows",
  },
  {
    id: "payments",
    Icon: HiOutlineCreditCard,
    title: "Payments & Invoicing",
    subtitle: "Get paid faster, reduce cancellations",
    description:
      "Accept payments or deposits at the time of booking through Stripe. Automatically generate invoices, track revenue, and reduce last-minute cancellations with prepayment requirements.",
    highlights: [
      "Online payment via Stripe",
      "Full payment or deposit options",
      "Automatic invoice generation",
      "Refund management",
      "Revenue tracking and reports",
    ],
    stat: "50%",
    statText: "fewer cancellations with prepayment",
  },
  {
    id: "staff",
    Icon: HiOutlineUserGroup,
    title: "Staff Management",
    subtitle: "Organize your team effortlessly",
    description:
      "Add team members, assign them specific services, set individual working hours, and track their performance. Each staff member gets their own schedule while you keep full oversight.",
    highlights: [
      "Individual staff profiles and schedules",
      "Service-to-staff assignment",
      "Performance tracking per staff member",
      "Break and time-off management",
      "Role-based access control",
    ],
    stat: "∞",
    statText: "staff members on Enterprise",
  },
  {
    id: "reviews",
    Icon: HiOutlineStar,
    title: "Reviews & Reputation",
    subtitle: "Build trust automatically",
    description:
      "After every completed appointment, clients receive an automatic review request. Manage and respond to reviews from your dashboard. Businesses with active review management grow 35% faster.",
    highlights: [
      "Automatic review requests after visits",
      "Public reviews on your booking page",
      "Reply to reviews from dashboard",
      "Rating analytics and trends",
      "Showcase top reviews",
    ],
    stat: "35%",
    statText: "faster growth with active reviews",
  },
  {
    id: "analytics",
    Icon: HiOutlineChartBar,
    title: "Analytics & Insights",
    subtitle: "Data-driven decisions",
    description:
      "Track bookings, revenue, peak hours, popular services, staff performance, and client retention — all in real-time. Stop guessing what works and start knowing.",
    highlights: [
      "Revenue and booking trends",
      "Peak hours and popular services",
      "Staff performance comparisons",
      "Client retention and repeat rates",
      "Exportable reports (CSV, PDF)",
    ],
    stat: "Real-Time",
    statText: "business intelligence",
  },
];

const processSteps = [
  {
    number: "01",
    title: "Create Your Account",
    description: "Sign up in 2 minutes. Add your business name, category, and logo.",
  },
  {
    number: "02",
    title: "Set Up Services & Staff",
    description: "Add your services with prices and duration. Assign them to staff members.",
  },
  {
    number: "03",
    title: "Share Your Booking Page",
    description: "Get a custom URL. Share it on social media, your website, or Google.",
  },
  {
    number: "04",
    title: "Start Receiving Bookings",
    description: "Clients book online, you get notified, reminders go out automatically.",
  },
];

function OfferingSection({ offering, index }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);
  const isReversed = index % 2 !== 0;
  const OfferingIcon = offering.Icon;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`offering-block ${isReversed ? "reversed" : ""} ${isVisible ? "visible" : ""}`}
    >
      <div className="offering-content">
        <div className="offering-icon-badge">
          <span className="offering-icon">
            <OfferingIcon size={24} aria-hidden />
          </span>
        </div>
        <p className="offering-subtitle-text">{offering.subtitle}</p>
        <h3 className="offering-title">{offering.title}</h3>
        <p className="offering-description">{offering.description}</p>
        <ul className="offering-highlights">
          {offering.highlights.map((item, i) => (
            <li key={i} className={isVisible ? "visible" : ""} style={{ animationDelay: `${i * 80 + 200}ms` }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="9" fill="#EEF2FF" />
                <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="offering-visual">
        <div className="visual-card">
          <div className="visual-stat">
            <span className="visual-stat-value">{offering.stat}</span>
            <span className="visual-stat-text">{offering.statText}</span>
          </div>
          <div className="visual-decoration">
            <div className="deco-ring deco-ring--1" />
            <div className="deco-ring deco-ring--2" />
            <div className="deco-ring deco-ring--3" />
            <span className="deco-icon">
              <OfferingIcon size={36} aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessStep({ step, index, isVisible }) {
  return (
    <div
      className={`process-step ${isVisible ? "visible" : ""}`}
      style={{ animationDelay: `${index * 150}ms` }}
    >
      <div className="step-number-wrapper">
        <span className="step-number">{step.number}</span>
        {index < 3 && <div className="step-connector" />}
      </div>
      <h4 className="step-title">{step.title}</h4>
      <p className="step-description">{step.description}</p>
    </div>
  );
}

const About = () => {
  const [heroVisible, setHeroVisible] = useState(false);
  const [processVisible, setProcessVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const processRef = useRef(null);
  const ctaRef = useRef(null);

  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 100);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.dataset.section;
            if (id === "process") setProcessVisible(true);
            if (id === "cta") setCtaVisible(true);
          }
        });
      },
      { threshold: 0.15 }
    );

    if (processRef.current) observer.observe(processRef.current);
    if (ctaRef.current) observer.observe(ctaRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="wwo-page">
      {/* Hero */}
      <section className="wwo-hero">
        <div className="wwo-hero-bg">
          <div className="wwo-orb wwo-orb--1" />
          <div className="wwo-orb wwo-orb--2" />
        </div>
        <div className="container">
          <div className={`wwo-hero-content ${heroVisible ? "visible" : ""}`}>
            <span className="wwo-eyebrow">What We Offer</span>
            <h1 className="wwo-hero-title">
              One Platform.{" "}
              <span className="gradient-text">Every Tool You Need.</span>
            </h1>
            <p className="wwo-hero-subtitle">
              From online booking to payments, reminders to analytics — Appointly
              gives your business everything it needs to manage appointments
              professionally and grow faster.
            </p>

            <div className="wwo-hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">7</span>
                <span className="hero-stat-label">Core Features</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value">30s</span>
                <span className="hero-stat-label">Average Booking Time</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value">24/7</span>
                <span className="hero-stat-label">Online Availability</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Offerings */}
      <section className="wwo-offerings">
        <div className="container">
          {offerings.map((offering, index) => (
            <OfferingSection key={offering.id} offering={offering} index={index} />
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="wwo-process" ref={processRef} data-section="process">
        <div className="container">
          <div className={`wwo-process-header ${processVisible ? "visible" : ""}`}>
            <span className="wwo-eyebrow">How It Works</span>
            <h2 className="wwo-section-title">
              Up And Running In <span className="gradient-text">4 Simple Steps</span>
            </h2>
            <p className="wwo-section-subtitle">
              From sign-up to your first booking — it takes less than 10 minutes.
            </p>
          </div>

          <div className="process-grid">
            {processSteps.map((step, index) => (
              <ProcessStep
                key={step.number}
                step={step}
                index={index}
                isVisible={processVisible}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="wwo-cta" ref={ctaRef} data-section="cta">
        <div className="container">
          <div className={`wwo-cta-card ${ctaVisible ? "visible" : ""}`}>
            <div className="wwo-cta-bg">
              <div className="cta-orb cta-orb--1" />
              <div className="cta-orb cta-orb--2" />
            </div>
            <div className="wwo-cta-content">
              <h2>Ready To Transform Your Business?</h2>
              <p>
                Join hundreds of businesses already using Appointly to manage
                bookings, reduce no-shows, and grow their revenue.
              </p>
              <div className="wwo-cta-buttons">
                <Link to="/sign-up" className="cta-btn-primary">
                  Start Free Trial
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link to="/pricing" className="cta-btn-secondary">
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default About;