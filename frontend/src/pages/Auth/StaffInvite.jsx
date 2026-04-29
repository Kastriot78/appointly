import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  getStaffInvitePreview,
  acceptStaffInvite,
  getApiErrorMessage,
} from "../../api/auth";
import "./auth.css";

const StaffInvite = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();
  const { login } = useAuth();

  const [visible, setVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!token) {
      setPreviewLoading(false);
      setPreviewError("This invite link is missing a token.");
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const { data } = await getStaffInvitePreview(token);
        if (cancelled) return;
        setPreview({
          businessName: data.businessName || "Business",
          staffName: data.staffName || "",
          email: data.email || "",
        });
        setName(String(data.staffName || "").trim());
      } catch (err) {
        if (!cancelled) {
          setPreviewError(getApiErrorMessage(err));
          setPreview(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canSubmit = useMemo(() => {
    if (previewError || !preview || submitting) return false;
    if (password.length < 6) return false;
    if (password !== confirm) return false;
    return true;
  }, [previewError, preview, submitting, password, confirm]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSubmit || !token) return;
      setError(null);
      setSubmitting(true);
      try {
        const body = {
          token,
          password,
          name: name.trim() || undefined,
        };
        const { data } = await acceptStaffInvite(body);
        if (data?.token && data?.user) {
          login(data.token, data.user);
          navigate("/dashboard", { replace: true });
          return;
        }
        setError("Something went wrong. Please try again.");
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, token, password, name, login, navigate],
  );

  const showForm = preview && !previewError && !previewLoading;

  return (
    <main className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb auth-orb--1" />
        <div className="auth-orb auth-orb--2" />
      </div>

      <div className={`auth-container ${visible ? "visible" : ""}`}>
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon-badge">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path
                  d="M14 14C16.7614 14 19 11.7614 19 9C19 6.23858 16.7614 4 14 4C11.2386 4 9 6.23858 9 9C9 11.7614 11.2386 14 14 14Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M5 24C5 19.0294 9.02944 15 14 15C18.9706 15 23 19.0294 23 24"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h1>Staff dashboard invite</h1>
            <p>
              {previewLoading
                ? "Checking your invite…"
                : previewError
                  ? "This link can’t be used."
                  : preview
                    ? `Join ${preview.businessName} — you’ll only see appointments assigned to you.`
                    : "Set your password to activate your account."}
            </p>
          </div>

          {previewLoading ? (
            <div className="auth-form">
              <p className="auth-hint">One moment…</p>
            </div>
          ) : previewError ? (
            <div className="auth-form">
              <div className="auth-form-error" role="alert">
                {previewError}
              </div>
              <p className="auth-hint" style={{ marginBottom: 12 }}>
                Ask your manager for a new invite, or sign in if you already
                activated your account.
              </p>
              <Link
                to="/sign-in"
                className="auth-submit"
                style={{ textDecoration: "none", justifyContent: "center" }}
              >
                Sign in
              </Link>
            </div>
          ) : showForm ? (
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {preview.email ? (
                <p className="auth-hint" style={{ marginBottom: 8 }}>
                  Signing in as{" "}
                  <strong>{preview.email.trim().toLowerCase()}</strong>
                </p>
              ) : null}

              <div
                className={`auth-field ${focusedField === "name" ? "focused" : ""} ${name.trim() ? "filled" : ""}`}
              >
                <label htmlFor="staff-invite-name">Display name</label>
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
                    id="staff-invite-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Your name"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div
                className={`auth-field ${focusedField === "password" ? "focused" : ""} ${password ? "filled" : ""}`}
              >
                <label htmlFor="staff-invite-password">Password</label>
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
                    id="staff-invite-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="At least 6 characters"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowPassword((s) => !s)}
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    disabled={submitting}
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

              <div
                className={`auth-field ${focusedField === "confirm" ? "focused" : ""} ${confirm ? "filled" : ""}`}
              >
                <label htmlFor="staff-invite-confirm">Confirm password</label>
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
                    id="staff-invite-confirm"
                    name="confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Repeat password"
                    disabled={submitting}
                  />
                </div>
              </div>

              {error ? (
                <div className="auth-form-error" role="alert">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                className="auth-submit"
                disabled={!canSubmit}
              >
                {submitting ? "Creating account…" : "Activate & go to dashboard"}
              </button>

              <div className="auth-footer" style={{ marginTop: 16 }}>
                <p>
                  Already have access? <Link to="/sign-in">Sign in</Link>
                </p>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default StaffInvite;
