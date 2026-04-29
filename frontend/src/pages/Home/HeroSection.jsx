import { Link } from "react-router-dom";

function HeroSection() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero__aurora" aria-hidden />
      <div className="home-hero__noise" aria-hidden />
      <div className="home-hero__gridlines" aria-hidden />

      <div className="container home-hero__container">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">
            <span className="home-hero__eyebrow-dot" aria-hidden />
            Multi-tenant booking infrastructure
          </p>
          <h1 id="home-hero-title" className="home-hero__title">
            The platform where
            <span className="home-hero__title-gradient"> appointments convert</span>
          </h1>
          <p className="home-hero__lead">
            One stack for salons, clinics, studios, and shops — online booking,
            staff calendars, reminders, and a storefront customers actually use.
          </p>
          <div className="home-hero__actions">
            <Link
              to="/book"
              className="home-hero__btn home-hero__btn--primary"
            >
              Find &amp; book
            </Link>
            <Link
              to="/sign-up"
              className="home-hero__btn home-hero__btn--secondary"
            >
              List your business
            </Link>
          </div>
          <dl className="home-hero__stats">
            <div className="home-hero__stat">
              <dt className="home-hero__stat-value">24/7</dt>
              <dd className="home-hero__stat-label">Self-serve booking</dd>
            </div>
            <div className="home-hero__stat">
              <dt className="home-hero__stat-value">Multi</dt>
              <dd className="home-hero__stat-label">Service &amp; staff aware</dd>
            </div>
            <div className="home-hero__stat">
              <dt className="home-hero__stat-value">Live</dt>
              <dd className="home-hero__stat-label">Availability you control</dd>
            </div>
          </dl>
        </div>

        <div className="home-hero__visual" aria-hidden>
          <div className="home-hero__card home-hero__card--main">
            <span className="home-hero__card-tag">Today</span>
            <p className="home-hero__card-title">Calendar health</p>
            <div className="home-hero__card-bars">
              <span style={{ height: "72%" }} />
              <span style={{ height: "45%" }} />
              <span style={{ height: "88%" }} />
              <span style={{ height: "60%" }} />
              <span style={{ height: "92%" }} />
            </div>
          </div>
          <div className="home-hero__card home-hero__card--float">
            <p className="home-hero__float-label">Next slot</p>
            <p className="home-hero__float-time">2:30 PM</p>
            <p className="home-hero__float-meta">Auto-confirmed</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
