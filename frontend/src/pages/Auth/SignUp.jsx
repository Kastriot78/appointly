import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  HiOutlineCalendar,
  HiOutlineOfficeBuilding,
} from "react-icons/hi";
import VerifyEmailModal from "./VerifyEmailModal";
import {
  register as registerRequest,
  verifyEmail as verifyEmailRequest,
  resendVerification as resendVerificationRequest,
  getApiErrorMessage,
} from "../../api/auth";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastContext";
import { normalizePersonName } from "../../utils/normalizePersonName";
import { getPlanById } from "../../data/subscriptionPlans";
import "./auth.css";

const SIGNUP_BUSINESS_DRAFT_KEY = "appointly:signupBusinessDraft";

const SignUp = () => {
  const navigate = useNavigate();
  const { isAuthenticated, ready } = useAuth();
  const { showToast } = useToast();
  const hasRedirectedLoggedInRef = useRef(false);
  const [searchParams] = useSearchParams();
  const planIdRaw = searchParams.get("plan");
  const billingRaw = searchParams.get("billing");
  const fromDemoCheckout = searchParams.get("checkout") === "demo";
  const selectedPlan = useMemo(() => getPlanById(planIdRaw), [planIdRaw]);
  const [visible, setVisible] = useState(false);
  const [role, setRole] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    businessName: "",
  });
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fromDemoCheckout && selectedPlan?.checkout) {
      setRole("business");
    }
  }, [fromDemoCheckout, selectedPlan]);

  useEffect(() => {
    if (!ready || !isAuthenticated || hasRedirectedLoggedInRef.current) return;
    hasRedirectedLoggedInRef.current = true;
    showToast("You're already signed in.", "info");
    navigate("/dashboard", { replace: true });
  }, [ready, isAuthenticated, showToast, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (name === "name" || name === "email") {
      v = value.toLowerCase();
    }
    setFormData((prev) => ({ ...prev, [name]: v }));
    if (registerError) setRegisterError(null);
  };

  const isValid = useMemo(
    () =>
      Boolean(
        formData.name &&
        formData.email &&
        formData.password.length >= 6 &&
        (role === "customer" || formData.businessName),
      ),
    [formData, role],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || registerLoading) return;
    setRegisterError(null);
    setRegisterLoading(true);
    try {
      const { data } = await registerRequest({
        name: normalizePersonName(formData.name),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        /* Backend stores business signups as role "tenant" (not "business"). */
        role: role === "business" ? "tenant" : "customer",
      });
      if (role === "business" && formData.businessName.trim()) {
        try {
          localStorage.setItem(
            SIGNUP_BUSINESS_DRAFT_KEY,
            JSON.stringify({
              name: formData.businessName.trim(),
              savedAt: Date.now(),
            }),
          );
        } catch {
          // non-fatal (private mode / storage limits)
        }
      }
      setPendingEmail((data.email || formData.email).trim().toLowerCase());
      setVerifyModalOpen(true);
    } catch (err) {
      setRegisterError(getApiErrorMessage(err));
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleVerify = useCallback(
    async (code) => {
      await verifyEmailRequest({
        email: pendingEmail,
        code,
      });
    },
    [pendingEmail],
  );

  const handleResend = useCallback(async () => {
    await resendVerificationRequest({ email: pendingEmail });
  }, [pendingEmail]);

  const handleVerifiedSuccess = useCallback(() => {
    setVerifyModalOpen(false);
    navigate("/sign-in", { replace: true });
  }, [navigate]);

  if (ready && isAuthenticated) {
    return null;
  }

  return (
    <main className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb auth-orb--1" />
        <div className="auth-orb auth-orb--2" />
      </div>

      <div className={`auth-container ${visible ? "visible" : ""}`}>
        <div className="auth-card signup-card">
          <div className="auth-header">
            <h1>Create Your Account</h1>
            <p>
              {fromDemoCheckout && selectedPlan ? (
                <>
                  Demo checkout completed for{" "}
                  <strong>{selectedPlan.name}</strong>
                  {billingRaw === "yearly"
                    ? " (billed yearly)"
                    : billingRaw === "monthly"
                      ? " (monthly)"
                      : ""}
                  . Create your business account below — nothing is charged in
                  this demo.
                </>
              ) : (
                <>Get started for free — no credit card required</>
              )}
            </p>
          </div>

          {!role ? (
            <div className="role-selection">
              <p className="role-label">I want to...</p>
              <div className="role-cards">
                <button
                  className="role-card"
                  type="button"
                  onClick={() => setRole("customer")}
                >
                  <div className="role-icon" aria-hidden>
                    <HiOutlineCalendar size={36} strokeWidth={1.35} />
                  </div>
                  <h3>Book Appointments</h3>
                  <p>Find businesses and book services online</p>
                </button>
                <button
                  className="role-card"
                  type="button"
                  onClick={() => setRole("business")}
                >
                  <div className="role-icon" aria-hidden>
                    <HiOutlineOfficeBuilding size={36} strokeWidth={1.35} />
                  </div>
                  <h3>Manage My Business</h3>
                  <p>Accept bookings and manage my schedule</p>
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="role-back"
                type="button"
                disabled={registerLoading}
                onClick={() => {
                  setRole(null);
                  setRegisterError(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M13 8H3M3 8L7 4M3 8L7 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {role === "customer"
                  ? "Booking as a Customer"
                  : "Registering a Business"}
              </button>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                {registerError ? (
                  <div className="auth-form-error" role="alert">
                    {registerError}
                  </div>
                ) : null}

                <div
                  className={`auth-field ${focusedField === "name" ? "focused" : ""} ${formData.name ? "filled" : ""}`}
                >
                  <label htmlFor="su-name">Full Name</label>
                  <div className="auth-input-wrapper">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle
                        cx="9"
                        cy="5.5"
                        r="3"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <path
                        d="M2.5 15.5C2.5 12.46 5.46 10 9 10C12.54 10 15.5 12.46 15.5 15.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                    <input
                      type="text"
                      id="su-name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("name")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="john doe"
                      required
                      disabled={registerLoading}
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div
                  className={`auth-field ${focusedField === "email" ? "focused" : ""} ${formData.email ? "filled" : ""}`}
                >
                  <label htmlFor="su-email">Email Address</label>
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
                      id="su-email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="you@example.com"
                      required
                      disabled={registerLoading}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div
                  className={`auth-field ${focusedField === "password" ? "focused" : ""} ${formData.password ? "filled" : ""}`}
                >
                  <label htmlFor="su-password">Password</label>
                  <div className="auth-input-wrapper">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect
                        x="3"
                        y="8"
                        width="12"
                        height="8"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <path
                        d="M6 8V5.5C6 3.84 7.34 2.5 9 2.5C10.66 2.5 12 3.84 12 5.5V8"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="su-password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Min. 6 characters"
                      required
                      disabled={registerLoading}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="auth-eye"
                      onClick={() => setShowPassword((s) => !s)}
                      tabIndex={-1}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                        >
                          <path
                            d="M2 2L16 16"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                          <path
                            d="M7.05 7.05C6.4 7.7 6 8.6 6 9.5C6 11.16 7.34 12.5 9 12.5C9.9 12.5 10.7 12.1 11.3 11.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                          <path
                            d="M3 5.5C1.8 7 1 8.5 1 9C1 9.5 4.58 15 9 15C10.4 15 11.7 14.5 12.8 13.8"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                          <path
                            d="M15 12.5C16.2 11 17 9.5 17 9C17 8.5 13.42 3 9 3C7.8 3 6.7 3.4 5.7 4"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                        >
                          <path
                            d="M1 9C1 9 4.58 3 9 3C13.42 3 17 9 17 9C17 9 13.42 15 9 15C4.58 15 1 9 1 9Z"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                          <circle
                            cx="9"
                            cy="9"
                            r="2.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  {formData.password && formData.password.length < 6 && (
                    <span className="auth-hint warn">
                      Password must be at least 6 characters
                    </span>
                  )}
                  {formData.password && formData.password.length >= 6 && (
                    <span className="auth-hint success">
                      Password looks good
                    </span>
                  )}
                </div>

                {role === "business" && (
                  <>
                    <div
                      className={`auth-field ${focusedField === "businessName" ? "focused" : ""} ${formData.businessName ? "filled" : ""}`}
                    >
                      <label htmlFor="su-bname">Business Name</label>
                      <div className="auth-input-wrapper">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                        >
                          <rect
                            x="2"
                            y="6"
                            width="14"
                            height="10"
                            rx="1.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                          <path
                            d="M6 6V4C6 2.9 6.9 2 8 2H10C11.1 2 12 2.9 12 4V6"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                        </svg>
                        <input
                          type="text"
                          id="su-bname"
                          name="businessName"
                          value={formData.businessName}
                          onChange={handleChange}
                          onFocus={() => setFocusedField("businessName")}
                          onBlur={() => setFocusedField(null)}
                          placeholder="Your Business Name"
                          required
                          disabled={registerLoading}
                          autoComplete="organization"
                        />
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className={`auth-submit ${registerLoading ? "auth-submit--loading" : ""}`}
                  disabled={!isValid || registerLoading}
                >
                  {registerLoading ? (
                    <span className="auth-spinner" aria-hidden />
                  ) : (
                    <>
                      {role === "customer"
                        ? "Create Account"
                        : "Register Business"}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M3 8H13M13 8L9 4M13 8L9 12"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </>
                  )}
                </button>
{/* 
                <div className="auth-divider">
                  <span>or</span>
                </div>

                <button
                  className="auth-google"
                  type="button"
                  disabled={registerLoading}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                      fill="#4285F4"
                    />
                    <path
                      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                      fill="#34A853"
                    />
                    <path
                      d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </button> */}

                <p className="auth-terms">
                  By creating an account, you agree to our{" "}
                  <Link to="/terms">Terms of Service</Link> and{" "}
                  <Link to="/privacy">Privacy Policy</Link>
                </p>
              </form>
            </>
          )}

          <div className="auth-footer">
            <p>
              Already have an account? <Link to="/sign-in">Sign In</Link>
            </p>
          </div>
        </div>
      </div>

      <VerifyEmailModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        email={pendingEmail}
        onVerify={handleVerify}
        onResend={handleResend}
        onSuccess={handleVerifiedSuccess}
      />
    </main>
  );
};

export default SignUp;
