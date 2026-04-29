import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword as resetPasswordRequest, getApiErrorMessage } from "../../api/auth";
import "./auth.css";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [focusedField, setFocusedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const linkInvalid = useMemo(
    () =>
      !token ||
      token.length < 16 ||
      !emailParam ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam.trim()),
    [token, emailParam],
  );

  const canSubmit = useMemo(() => {
    if (linkInvalid || loading) return false;
    if (password.length < 6) return false;
    if (password !== confirm) return false;
    return true;
  }, [linkInvalid, loading, password, confirm]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSubmit) return;
      setError(null);
      setLoading(true);
      try {
        await resetPasswordRequest({
          email: emailParam.trim().toLowerCase(),
          token: token.trim(),
          newPassword: password,
        });
        navigate("/sign-in", { replace: true, state: { passwordResetOk: true } });
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [canSubmit, emailParam, token, password, navigate],
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
              </svg>
            </div>
            <h1>Set a new password</h1>
            <p>
              {linkInvalid
                ? "This reset link is missing details or has expired."
                : `For ${emailParam.trim().toLowerCase()}`}
            </p>
          </div>

          {linkInvalid ? (
            <div className="auth-form">
              <Link
                to="/forgot-password"
                className="auth-submit"
                style={{ textDecoration: "none", justifyContent: "center" }}
              >
                Request a new link
              </Link>
              <div className="auth-footer" style={{ marginTop: 16 }}>
                <p>
                  <Link to="/sign-in">Back to Sign In</Link>
                </p>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              {error ? (
                <div className="auth-form-error" role="alert">
                  {error}
                </div>
              ) : null}

              <div
                className={`auth-field ${focusedField === "password" ? "focused" : ""} ${password ? "filled" : ""}`}
              >
                <label htmlFor="rp-pass">New password</label>
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
                    id="rp-pass"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>
              </div>

              <div
                className={`auth-field ${focusedField === "confirm" ? "focused" : ""} ${confirm ? "filled" : ""}`}
              >
                <label htmlFor="rp-confirm">Confirm password</label>
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
                    id="rp-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit"
                disabled={!canSubmit}
              >
                {loading ? "Saving…" : "Update password"}
              </button>
            </form>
          )}

          {!linkInvalid ? (
            <div className="auth-footer">
              <p>
                <Link to="/sign-in">Back to Sign In</Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default ResetPassword;
