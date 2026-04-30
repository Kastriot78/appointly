import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { subscribeNewsletter } from "../api/newsletter";
import { getApiErrorMessage } from "../api/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Footer = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return "Please enter your email address.";
    if (!EMAIL_REGEX.test(trimmed)) return "Please enter a valid email address.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    const msg = validate(email);
    setError(msg);
    if (msg) return;

    setLoading(true);
    try {
      const { data } = await subscribeNewsletter({
        email: email.trim(),
        source: "footer",
      });
      setSuccess(data?.message || "Thanks for subscribing.");
      setEmail("");
      setError("");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setEmail(e.target.value);
    if (error) setError("");
    if (success) setSuccess("");
  };

  useEffect(() => {
    if (!success) return undefined;
    const id = window.setTimeout(() => setSuccess(""), 4000);
    return () => window.clearTimeout(id);
  }, [success]);

  return (
    <footer className="footer footer--modern">
      <div className="footer__newsletter">
        <div className="container">
          <div className="footer__newsletter-card">
            <div className="footer__newsletter-copy">
              <p className="footer__eyebrow">Newsletter</p>
              <h2 className="footer__newsletter-title">Stay in the loop</h2>
              <p className="footer__newsletter-desc">
                Product updates, booking tips, and platform news — no spam.
              </p>
            </div>
            <div className="footer__newsletter-field">
              <form
                className="footer__form"
                onSubmit={handleSubmit}
                noValidate
              >
                <input
                  type="email"
                  id="footerNewsletterEmail"
                  name="email"
                  className={`form-control footer__input ${error ? "footer__input--error" : ""}`}
                  value={email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-label="Email for newsletter"
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby={error ? "footerNewsletterError" : undefined}
                />
                <button
                  type="submit"
                  className="footer__submit"
                  disabled={loading}
                  aria-busy={loading ? "true" : "false"}
                >
                  {loading ? (
                    <span className="footer__spinner" aria-hidden="true" />
                  ) : (
                    <span className="footer__submit-label">Subscribe</span>
                  )}
                </button>
              </form>
              {error ? (
                <span
                  id="footerNewsletterError"
                  className="footer__error"
                  role="alert"
                >
                  {error}
                </span>
              ) : null}
              {success && !error ? (
                <span className="footer__success" role="status">
                  {success}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="footer__body">
        <div className="container">
          <div className="footer__grid">
            <div className="footer__brand-col">
              <Link to="/" className="footer__logo-link" aria-label="Appointly home">
                <img
                  src="/appointly-logo.png"
                  alt=""
                  className="footer__logo"
                />
              </Link>
              <p className="footer__tagline">
                All-in-one scheduling for teams that care about the client
                experience.
              </p>
            </div>

            <div className="footer__links-wrap">
              <nav className="footer__col" aria-label="Company">
                <h3 className="footer__heading">Company</h3>
                <ul className="footer__list">
                  <li>
                    <Link to="/">Home</Link>
                  </li>
                  <li>
                    <Link to="/about">About</Link>
                  </li>
                  <li>
                    <Link to="/pricing">Pricing</Link>
                  </li>
                  <li>
                    <Link to="/contact">Contact</Link>
                  </li>
                </ul>
              </nav>
              <nav className="footer__col" aria-label="Product">
                <h3 className="footer__heading">Product</h3>
                <ul className="footer__list">
                  <li>
                    <a href="/#platform-features-section">What we offer</a>
                  </li>
                  <li>
                    <Link to="/book">Find &amp; book</Link>
                  </li>
                  <li>
                    <Link to="/sign-up">List your business</Link>
                  </li>
                  <li>
                    <Link to="/faq">FAQ</Link>
                  </li>
                </ul>
              </nav>
              <nav className="footer__col" aria-label="Account">
                <h3 className="footer__heading">Account</h3>
                <ul className="footer__list">
                  <li>
                    <Link to="/sign-in">Sign in</Link>
                  </li>
                  <li>
                    <Link to="/sign-up">Create account</Link>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>

      <div className="footer__bar">
        <div className="container footer__bar-inner">
          <p className="footer__copyright">
            © {new Date().getFullYear()} Appointly. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
