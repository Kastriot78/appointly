import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { forgotPassword as forgotPasswordRequest, getApiErrorMessage } from "../../api/auth";
import "./auth.css";

const ForgotPassword = () => {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [focusedField, setFocusedField] = useState(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (loading) return;
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return;
      setError(null);
      setLoading(true);
      try {
        await forgotPasswordRequest({ email: trimmed });
        setSent(true);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [email, loading],
  );

  return (
    <main className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb auth-orb--1" />
        <div className="auth-orb auth-orb--2" />
      </div>

      <div className={`auth-container ${visible ? "visible" : ""}`}>
        <div className="auth-card">
          <div className="auth-header">
            {sent ? (
              <>
                <div className="auth-success-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="24" fill="#ECFDF5" />
                    <path
                      d="M15 24.5L21 30.5L33 18.5"
                      stroke="#10B981"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1>Check Your Email</h1>
                <p>
                  If an account exists for <strong>{email.trim().toLowerCase()}</strong>,
                  we&apos;ve sent a password reset link. Check your inbox (and spam)
                  and follow the link — it expires in one hour.
                </p>
              </>
            ) : (
              <>
                <div className="auth-icon-badge">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect
                      x="4"
                      y="11"
                      width="20"
                      height="14"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M9 11V8C9 5.24 11.24 3 14 3C16.76 3 19 5.24 19 8V11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <circle cx="14" cy="18.5" r="1.5" fill="currentColor" />
                    <path
                      d="M14 20V22"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h1>Forgot Password?</h1>
                <p>
                  No worries — enter your email and we&apos;ll send you a reset link.
                </p>
              </>
            )}
          </div>

          {sent ? (
            <div className="auth-form">
              <Link
                to="/sign-in"
                className="auth-submit"
                style={{ textDecoration: "none", justifyContent: "center" }}
              >
                Back to Sign In
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8H13M13 8L9 4M13 8L9 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>

              <button
                className="auth-google"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                  setError(null);
                }}
                type="button"
              >
                Didn&apos;t receive the email? Try again
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {error ? (
                <div className="auth-form-error" role="alert">
                  {error}
                </div>
              ) : null}

              <div
                className={`auth-field ${focusedField === "email" ? "focused" : ""} ${email ? "filled" : ""}`}
              >
                <label htmlFor="fp-email">Email Address</label>
                <div className="auth-input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect
                      x="1.5"
                      y="3"
                      width="15"
                      height="12"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M1.5 5L9 10L16.5 5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                  <input
                    type="email"
                    id="fp-email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value.toLowerCase());
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit"
                disabled={loading}
              >
                {loading ? "Sending…" : "Send Reset Link"}
                {!loading ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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
                ) : null}
              </button>
            </form>
          )}

          <div className="auth-footer">
            <p>
              Remember your password? <Link to="/sign-in">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ForgotPassword;
