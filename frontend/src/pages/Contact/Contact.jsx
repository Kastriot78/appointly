import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { submitContactMessage } from "../../api/contact";
import { getApiErrorMessage } from "../../api/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmailField(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "Email is required.";
  if (v.length > 254 || !EMAIL_RE.test(v)) {
    return "Please enter a valid email address.";
  }
  return "";
}

const contactMethods = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22 6L12 13L2 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: "Email Us",
    description: "We typically respond within 24 hours",
    value: "support@appointly.com",
    href: "mailto:support@appointly.com",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 15C21 15.55 20.78 16.05 20.41 16.41L16.41 20.41C16.05 20.78 15.55 21 15 21C7.82 21 2 15.18 2 8C2 7.45 2.22 6.95 2.59 6.59L6.59 2.59C6.95 2.22 7.45 2 8 2C8.55 2 9.05 2.22 9.41 2.59L12.41 5.59C12.78 5.95 13 6.45 13 7C13 7.55 12.78 8.05 12.41 8.41L10.83 10C11.87 11.93 13.07 13.13 15 14.17L16.59 12.59C16.95 12.22 17.45 12 18 12C18.55 12 19.05 12.22 19.41 12.59L22.41 15.59"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: "Call Us",
    description: "Mon–Fri, 9:00 AM – 6:00 PM CET",
    value: "+383 44 000 000",
    href: "tel:+38344000000",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 5.03 7.03 1 12 1C16.97 1 21 5.03 21 10Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: "Visit Us",
    description: "Come say hello at our office",
    value: "Prishtinë, Kosovo",
    href: null,
  },
];

const Contact = () => {
  const [heroVisible, setHeroVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);

  const formRef = useRef(null);
  const cardsRef = useRef(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [focusedField, setFocusedField] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 100);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.dataset.section;
            if (id === "form") setFormVisible(true);
            if (id === "cards") setCardsVisible(true);
          }
        });
      },
      { threshold: 0.1 },
    );

    if (formRef.current) observer.observe(formRef.current);
    if (cardsRef.current) observer.observe(cardsRef.current);
    return () => observer.disconnect();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "email") setEmailError("");
    if (submitError) setSubmitError(null);
  };

  const handleEmailBlur = useCallback(() => {
    setEmailError(validateEmailField(formData.email));
  }, [formData.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const err = validateEmailField(formData.email);
    setEmailError(err);
    if (err) return;

    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();
    const subject = formData.subject.trim();
    const message = formData.message.trim();
    if (!name || !subject || !message) return;

    setSubmitting(true);
    try {
      await submitContactMessage({ name, email, subject, message });
      setSubmitted(true);
      setFormData({ name: "", email: "", subject: "", message: "" });
      setEmailError("");
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err) {
      setSubmitError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const emailInvalid = Boolean(validateEmailField(formData.email));
  const canSubmit =
    !submitting &&
    formData.name.trim() &&
    formData.email.trim() &&
    !emailInvalid &&
    formData.subject.trim() &&
    formData.message.trim();

  return (
    <main className="contact-page">
      {/* Hero */}
      <section className="contact-hero">
        <div className="contact-hero-bg">
          <div className="contact-orb contact-orb--1" />
          <div className="contact-orb contact-orb--2" />
        </div>
        <div className="container">
          <div
            className={`contact-hero-content ${heroVisible ? "visible" : ""}`}
          >
            <span className="contact-eyebrow">Get In Touch</span>
            <h1 className="contact-hero-title">
              We'd Love To <span className="gradient-text">Hear From You</span>
            </h1>
            <p className="contact-hero-subtitle">
              Have a question, feedback, or need help getting started? Our team
              is here to help. Reach out and we'll respond as soon as we can.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="contact-methods" ref={cardsRef} data-section="cards">
        <div className="container">
          <div className="methods-grid">
            {contactMethods.map((method, index) => (
              <div
                key={method.title}
                className={`method-card ${cardsVisible ? "visible" : ""}`}
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <div className="method-icon">{method.icon}</div>
                <h3 className="method-title">{method.title}</h3>
                <p className="method-description">{method.description}</p>
                {method.href ? (
                  <a href={method.href} className="method-value">
                    {method.value}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2 7H12M12 7L8 3M12 7L8 11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                ) : (
                  <span className="method-value static">{method.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section
        className="contact-form-section"
        ref={formRef}
        data-section="form"
      >
        <div className="container">
          <div className="contact-layout">
            <div
              className={`contact-form-wrapper ${formVisible ? "visible" : ""}`}
            >
              <h2 className="form-title">Send Us A Message</h2>
              <p className="form-subtitle">
                Fill out the form below and we'll get back to you within 24
                hours.
              </p>

              {submitted ? (
                <div className="success-message">
                  <div className="success-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="16" fill="#ECFDF5" />
                      <path
                        d="M10 16.5L14 20.5L22 12.5"
                        stroke="#10B981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3>Message Sent!</h3>
                  <p>
                    Thank you for reaching out. We'll get back to you shortly.
                  </p>
                </div>
              ) : (
                <form className="contact-form" onSubmit={handleSubmit} noValidate>
                  {submitError ? (
                    <p className="contact-form-error" role="alert">
                      {submitError}
                    </p>
                  ) : null}
                  <div className="form-row">
                    <div
                      className={`form-group ${focusedField === "name" ? "focused" : ""} ${formData.name ? "filled" : ""}`}
                    >
                      <label htmlFor="name">Full Name</label>
                      <input
                        className="form-control"
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        onFocus={() => setFocusedField("name")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="John Doe"
                        autoComplete="name"
                        required
                      />
                    </div>
                    <div
                      className={`form-group ${focusedField === "email" ? "focused" : ""} ${formData.email ? "filled" : ""} ${emailError ? "has-error" : ""}`}
                    >
                      <label htmlFor="email">Email Address</label>
                      <input
                        className="form-control"
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() => {
                          setFocusedField(null);
                          handleEmailBlur();
                        }}
                        placeholder="john@example.com"
                        autoComplete="email"
                        required
                        aria-invalid={emailError ? "true" : undefined}
                        aria-describedby={
                          emailError ? "contact-email-error" : undefined
                        }
                      />
                      {emailError ? (
                        <span id="contact-email-error" className="contact-field-error">
                          {emailError}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={`form-group ${focusedField === "subject" ? "focused" : ""} ${formData.subject ? "filled" : ""}`}
                  >
                    <label htmlFor="subject">Subject</label>
                    <input
                      className="form-control"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("subject")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="off"
                      required
                    />
                  </div>

                  <div
                    className={`form-group ${focusedField === "message" ? "focused" : ""} ${formData.message ? "filled" : ""}`}
                  >
                    <label htmlFor="message">Message</label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("message")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Tell us how we can help..."
                      rows="5"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="form-submit-btn"
                    disabled={!canSubmit}
                  >
                    {submitting ? "Sending…" : "Send Message"}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M14.5 1.5L6.5 9.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14.5 1.5L10 14.5L6.5 9.5L1.5 6L14.5 1.5Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </form>
              )}
            </div>

            <div
              className={`contact-info-side ${formVisible ? "visible" : ""}`}
            >
              <div className="info-card">
                <div className="info-card-header">
                  <h3>Quick Answers</h3>
                  <p>Find instant answers to common questions</p>
                </div>
                <div className="info-links">
                  <Link to="/faq" className="info-link">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle
                        cx="9"
                        cy="9"
                        r="8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M6.5 6.5C6.5 5.12 7.62 4 9 4C10.38 4 11.5 5.12 11.5 6.5C11.5 7.88 10.38 9 9 9V10.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="9"
                        cy="13"
                        r="0.5"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="0.5"
                      />
                    </svg>
                    <span>Frequently Asked Questions</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="arrow"
                    >
                      <path
                        d="M2 7H12M12 7L8 3M12 7L8 11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                  <Link to="/pricing" className="info-link">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect
                        x="2"
                        y="3"
                        width="14"
                        height="12"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M2 7H16"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                    <span>Pricing & Plans</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="arrow"
                    >
                      <path
                        d="M2 7H12M12 7L8 3M12 7L8 11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                  <Link to="/what-we-offer" className="info-link">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 1L11.47 6.01L17 6.82L13 10.72L13.94 16.24L9 13.67L4.06 16.24L5 10.72L1 6.82L6.53 6.01L9 1Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Features & Platform</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="arrow"
                    >
                      <path
                        d="M2 7H12M12 7L8 3M12 7L8 11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                </div>
              </div>

              <div className="info-card response-card">
                <div className="response-badge">
                  <div className="pulse-dot" />
                  <span>Typically responds in</span>
                </div>
                <div className="response-time">
                  <span className="response-value">Under 24h</span>
                </div>
                <p className="response-note">
                  For urgent matters, please call us directly during business
                  hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Contact;
