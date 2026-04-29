import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastContext";
import {
  login as loginRequest,
  verifyEmail as verifyEmailRequest,
  resendVerification as resendVerificationRequest,
  verifyTwoFactor as verifyTwoFactorRequest,
  resendTwoFactor as resendTwoFactorRequest,
  getApiErrorMessage,
} from "../../api/auth";
import { demoCheckout } from "../../api/subscription";
import {
  getPlanById,
  normalizePlanId,
} from "../../data/subscriptionPlans";
import { isCustomerRole, isTenantAccount } from "../../utils/roles";
import VerifyEmailModal from "./VerifyEmailModal";
import "./auth.css";

function postLoginPath(role) {
  return isCustomerRole(role) ? "/book" : "/dashboard";
}

function safeReturnPath(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.includes("://")) return null;
  return s;
}

const PENDING_PLAN_KEY = "appointly_pending_demo_plan";

/**
 * After a demo pricing checkout → sign-up, apply the paid tier once the tenant signs in.
 */
async function applyPendingDemoPlan(currentUser) {
  const raw = sessionStorage.getItem(PENDING_PLAN_KEY);
  if (!raw) return currentUser;
  if (!isTenantAccount(currentUser?.role)) {
    sessionStorage.removeItem(PENDING_PLAN_KEY);
    return currentUser;
  }
  try {
    const parsed = JSON.parse(raw);
    const planId = normalizePlanId(parsed.planId);
    if (!getPlanById(planId)?.checkout) {
      sessionStorage.removeItem(PENDING_PLAN_KEY);
      return currentUser;
    }
    const { data } = await demoCheckout({
      planId,
      billing: parsed.billing === "yearly" ? "yearly" : "monthly",
    });
    sessionStorage.removeItem(PENDING_PLAN_KEY);
    return data.user;
  } catch {
    sessionStorage.removeItem(PENDING_PLAN_KEY);
    return currentUser;
  }
}

const SignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const { showToast } = useToast();
  const resetToastShown = useRef(false);
  const [visible, setVisible] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [twoFactor, setTwoFactor] = useState(null);
  const [verifyEmailFlow, setVerifyEmailFlow] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!location.state?.passwordResetOk || resetToastShown.current) return;
    resetToastShown.current = true;
    showToast("Password updated. Sign in with your new password.", "success");
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: {} },
    );
  }, [location.state, location.pathname, location.search, navigate, showToast]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        formData.email.trim() && formData.password.length > 0 && !loading,
      ),
    [formData.email, formData.password, loading],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    const v = name === "email" ? value.toLowerCase() : value;
    setFormData((prev) => ({ ...prev, [name]: v }));
    if (error) setError(null);
  };

  const completeLogin = useCallback(
    (user) => {
      const fallback = postLoginPath(user.role);
      const returnTo = safeReturnPath(searchParams.get("returnTo"));
      const from = location.state?.from?.pathname;
      const target =
        returnTo && returnTo !== "/sign-in"
          ? returnTo
          : from && from !== "/sign-in" && from.startsWith("/")
            ? from
            : fallback;
      navigate(target, { replace: true });
    },
    [navigate, location.state, searchParams],
  );

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSubmit) return;
      setError(null);
      setLoading(true);
      try {
        const { data } = await loginRequest({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
        });
        if (data?.requiresTwoFactor && data?.challengeToken) {
          setTwoFactor({
            challengeToken: data.challengeToken,
            email: formData.email.trim().toLowerCase(),
          });
          return;
        }
        login(data.token, data.user);
        const finalUser = await applyPendingDemoPlan(data.user);
        login(data.token, finalUser);
        completeLogin(finalUser);
      } catch (err) {
        const msg = getApiErrorMessage(err);
        const needsVerify =
          err?.response?.status === 403 &&
          /verify your email/i.test(String(msg || ""));
        if (needsVerify) {
          setVerifyEmailFlow({
            email: formData.email.trim().toLowerCase(),
          });
          setError(null);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [canSubmit, formData.email, formData.password, login, completeLogin],
  );

  const handleVerifyTwoFactor = useCallback(
    async (code) => {
      if (!twoFactor?.challengeToken) return;
      const { data } = await verifyTwoFactorRequest({
        challengeToken: twoFactor.challengeToken,
        code,
      });
      login(data.token, data.user);
      const finalUser = await applyPendingDemoPlan(data.user);
      login(data.token, finalUser);
      setTwoFactor(null);
      completeLogin(finalUser);
    },
    [twoFactor, login, completeLogin],
  );

  const handleResendTwoFactor = useCallback(async () => {
    if (!twoFactor?.challengeToken) return;
    await resendTwoFactorRequest({
      challengeToken: twoFactor.challengeToken,
    });
  }, [twoFactor]);

  const handleCloseTwoFactor = useCallback(() => {
    setTwoFactor(null);
    setLoading(false);
  }, []);

  const handleVerifyEmail = useCallback(
    async (code) => {
      if (!verifyEmailFlow?.email) return;
      await verifyEmailRequest({
        email: verifyEmailFlow.email,
        code,
      });
    },
    [verifyEmailFlow],
  );

  const handleResendVerification = useCallback(async () => {
    if (!verifyEmailFlow?.email) return;
    await resendVerificationRequest({ email: verifyEmailFlow.email });
  }, [verifyEmailFlow]);

  return (
    <main className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb auth-orb--1" />
        <div className="auth-orb auth-orb--2" />
      </div>

      <div className={`auth-container ${visible ? "visible" : ""}`}>
        <div className="auth-card">
          <div className="auth-header">
            <h1>Welcome Back</h1>
            <p>Sign in to manage your appointments</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <div className="auth-form-error" role="alert">
                {error}
              </div>
            ) : null}

            <div
              className={`auth-field ${focusedField === "email" ? "focused" : ""} ${formData.email ? "filled" : ""}`}
            >
              <label htmlFor="si-email">Email Address</label>
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
                  id="si-email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div
              className={`auth-field ${focusedField === "password" ? "focused" : ""} ${formData.password ? "filled" : ""}`}
            >
              <div className="auth-label-row">
                <label htmlFor="si-password">Password</label>
                <Link to="/forgot-password" className="auth-forgot">
                  Forgot password?
                </Link>
              </div>
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
                  id="si-password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((s) => !s)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
            </div>

            <button
              type="submit"
              className={`auth-submit ${loading ? "auth-submit--loading" : ""}`}
              disabled={!canSubmit}
            >
              {loading ? (
                <span className="auth-spinner" aria-hidden />
              ) : (
                <>
                  Sign In
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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

            {/* <div className="auth-divider">
              <span>or</span>
            </div>

            <button className="auth-google" type="button" disabled={loading}>
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
          </form>

          <div className="auth-footer">
            <p>
              Don&apos;t have an account? <Link to="/sign-up">Sign Up</Link>
            </p>
          </div>
        </div>
      </div>

      <VerifyEmailModal
        isOpen={Boolean(twoFactor)}
        onClose={handleCloseTwoFactor}
        email={twoFactor?.email || ""}
        variant="two-factor"
        onVerify={handleVerifyTwoFactor}
        onResend={handleResendTwoFactor}
      />
      <VerifyEmailModal
        isOpen={Boolean(verifyEmailFlow)}
        onClose={() => setVerifyEmailFlow(null)}
        email={verifyEmailFlow?.email || ""}
        onVerify={handleVerifyEmail}
        onResend={handleResendVerification}
        onSuccess={() => {
          setVerifyEmailFlow(null);
          showToast("Email verified. You can sign in now.", "success");
        }}
      />
    </main>
  );
};

export default SignIn;
