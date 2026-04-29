import { useState, useEffect, useRef } from "react";
import {
  HiOutlineCalendar,
  HiOutlineBell,
  HiOutlineUsers,
  HiOutlineCreditCard,
  HiOutlineStar,
  HiOutlineChartBar,
} from "react-icons/hi";

const features = [
  {
    Icon: HiOutlineCalendar,
    title: "Online Booking",
    description:
      "Clients book 24/7 from any device. Businesses using online booking see up to 40% of appointments made outside working hours — revenue you'd otherwise miss.",
    stat: "40%",
    statLabel: "After-Hours Bookings",
  },
  {
    Icon: HiOutlineBell,
    title: "Smart Reminders",
    description:
      "Automated SMS & email reminders reduce no-shows by up to 70%. Clients get notified 24h and 1h before their appointment — zero manual follow-up needed.",
    stat: "70%",
    statLabel: "Fewer No-Shows",
  },
  {
    Icon: HiOutlineUsers,
    title: "Staff & Schedule Management",
    description:
      "Assign services to specific staff, set individual working hours, and manage availability in real-time. One calendar view for your entire team.",
    stat: "100%",
    statLabel: "Schedule Visibility",
  },
  {
    Icon: HiOutlineCreditCard,
    title: "Payments & Invoicing",
    description:
      "Accept payments online at the time of booking. Businesses collecting prepayments see 50% fewer cancellations and faster cash flow.",
    stat: "50%",
    statLabel: "Fewer Cancellations",
  },
  {
    Icon: HiOutlineStar,
    title: "Reviews & Reputation",
    description:
      "Automated review requests after every visit. Businesses with active review management grow up to 35% faster than those that ignore client feedback.",
    stat: "35%",
    statLabel: "Faster Growth",
  },
  {
    Icon: HiOutlineChartBar,
    title: "Analytics & Insights",
    description:
      "Track bookings, revenue, peak hours, and client retention in real-time. Data-driven decisions replace guesswork — know exactly what's working.",
    stat: "Real-Time",
    statLabel: "Business Intelligence",
  },
];

function FeatureCard({ feature, index, isVisible }) {
  const [isHovered, setIsHovered] = useState(false);
  const FeatureIcon = feature.Icon;

  return (
    <div
      className={`feature-card ${isVisible ? "visible" : ""}`}
      style={{ animationDelay: `${index * 120}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="card-glow" />
      <div className="card-content">
        <div className="card-header">
          <div className={`icon-wrapper ${isHovered ? "icon-active" : ""}`}>
            <span className="icon">
              <FeatureIcon size={26} aria-hidden />
            </span>
            <div className="icon-ring" />
          </div>
          <div className={`stat-badge ${isHovered ? "stat-active" : ""}`}>
            <span className="stat-value">{feature.stat}</span>
            <span className="stat-label">{feature.statLabel}</span>
          </div>
        </div>
        <h3 className="card-title">{feature.title}</h3>
        <p className="card-description">{feature.description}</p>
        <div className={`card-line ${isHovered ? "line-active" : ""}`} />
      </div>
    </div>
  );
}

const FeaturesSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 },
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="platform-features-section"
      className="features-section spacing-section"
      ref={sectionRef}
    >
      <div className="features-bg-grid" />
      <div className="features-bg-orb orb-1" />
      <div className="features-bg-orb orb-2" />

      <div className="features-container">
        <div className="features-header">
          <p className={`features-eyebrow ${isVisible ? "visible" : ""}`}>
            Why Appointly
          </p>
          <h2 className={`features-title ${isVisible ? "visible" : ""}`}>
            Everything You Need To <span>Grow Your Business</span>
          </h2>
          <p className={`features-subtitle ${isVisible ? "visible" : ""}`}>
            One platform to manage bookings, staff, payments, and client
            relationships — so you can focus on delivering great service.
          </p>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              feature={feature}
              index={index}
              isVisible={isVisible}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
