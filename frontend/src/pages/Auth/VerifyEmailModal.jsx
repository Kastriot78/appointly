import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { getApiErrorMessage } from "../../api/auth";
import "./auth.css";

const CODE_LEN = 6;

function maskEmail(email) {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const prefix = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${prefix}•••@${domain}`;
}

const VerifyEmailModal = ({
  isOpen,
  onClose,
  email,
  onVerify,
  onResend,
  onSuccess,
  /** "signup" (default) | "email-change" | "two-factor" | "two-factor-enable" | "two-factor-disable" */
  variant = "signup",
  /** Email-change only: cancel pending address (e.g. clear profile pending email) */
  onCancelChange,
}) => {
  const [digits, setDigits] = useState(() => Array(CODE_LEN).fill(""));
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const inputsRef = useRef([]);

  const isEmailChange = variant === "email-change";
  const isTwoFactor =
    variant === "two-factor" ||
    variant === "two-factor-enable" ||
    variant === "two-factor-disable";

  const titleText = isTwoFactor
    ? variant === "two-factor-enable"
      ? "Turn on two-factor authentication"
      : variant === "two-factor-disable"
        ? "Turn off two-factor authentication"
        : "Verify it's you"
    : isEmailChange
      ? "Confirm your new email"
      : "Check your email";

  const submitLabel = isTwoFactor
    ? variant === "two-factor-disable"
      ? "Turn off 2FA"
      : variant === "two-factor-enable"
        ? "Turn on 2FA"
        : "Verify & continue"
    : isEmailChange
      ? "Confirm email"
      : "Verify & continue";

  const fullCode = digits.join("");
  const isComplete =
    fullCode.length === CODE_LEN && /^\d+$/.test(fullCode);
  const busy = submitLoading || resendLoading || cancelLoading;

  const setDigitAt = useCallback((index, value) => {
    const v = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = v;
      return next;
    });
    setError("");
    return v;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setDigits(Array(CODE_LEN).fill(""));
    setError("");
    setResendCooldown(0);
    setSubmitLoading(false);
    setResendLoading(false);
    setCancelLoading(false);
    const t = window.setTimeout(() => {
      inputsRef.current[0]?.focus();
    }, 120);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isOpen, resendCooldown]);

  useEffect(() => {
    const onKey = (e) => {
      if (!isOpen || busy) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, busy]);

  const handleChange = (index, e) => {
    if (submitLoading) return;
    const raw = e.target.value;
    if (raw.length > 1) {
      const pasted = raw.replace(/\D/g, "").slice(0, CODE_LEN);
      if (pasted.length) {
        const next = Array(CODE_LEN)
          .fill("")
          .map((_, i) => pasted[i] ?? "");
        setDigits(next);
        setError("");
        const last = Math.min(pasted.length, CODE_LEN) - 1;
        inputsRef.current[last]?.focus();
      }
      return;
    }
    const v = setDigitAt(index, raw);
    if (v && index < CODE_LEN - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (digits[index]) return;
      if (index > 0) {
        e.preventDefault();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
        inputsRef.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < CODE_LEN - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    if (submitLoading) return;
    const text = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, CODE_LEN);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LEN)
      .fill("")
      .map((_, i) => text[i] ?? "");
    setDigits(next);
    setError("");
    const focusIdx = Math.min(text.length, CODE_LEN - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!isComplete || submitLoading) return;
    setError("");
    setSubmitLoading(true);
    try {
      await onVerify(fullCode);
      onSuccess?.();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCancelChange = async () => {
    if (!onCancelChange || cancelLoading || submitLoading) return;
    setError("");
    setCancelLoading(true);
    try {
      await onCancelChange();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading || submitLoading) return;
    setError("");
    setResendLoading(true);
    try {
      await onResend();
      setResendCooldown(60);
      setDigits(Array(CODE_LEN).fill(""));
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setResendLoading(false);
    }
  };

  if (!isOpen) return null;

  const node = (
    <div
      className="auth-verify-overlay"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        className="auth-verify-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-verify-title"
        aria-describedby="auth-verify-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="auth-verify-close"
          onClick={() => !busy && onClose()}
          disabled={busy}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M4 4L14 14M14 4L4 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="auth-verify-badge" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7L10.94 11.34C11.59 11.75 12.41 11.75 13.06 11.34L20 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect
              x="3"
              y="5"
              width="18"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <h2 id="auth-verify-title" className="auth-verify-title">
          {titleText}
        </h2>
        <p id="auth-verify-desc" className="auth-verify-desc">
          {isEmailChange ? (
            <>
              We sent a 6-digit code to{" "}
              <strong className="auth-verify-email">{maskEmail(email)}</strong>.
              Your current sign-in email stays active until you confirm.
            </>
          ) : isTwoFactor ? (
            <>
              We sent a 6-digit code to{" "}
              <strong className="auth-verify-email">{maskEmail(email)}</strong>.
              Enter it to{" "}
              {variant === "two-factor-enable"
                ? "turn on two-factor authentication"
                : variant === "two-factor-disable"
                  ? "turn off two-factor authentication"
                  : "finish signing in"}
              .
            </>
          ) : (
            <>
              We sent a 6-digit code to{" "}
              <strong className="auth-verify-email">{maskEmail(email)}</strong>
            </>
          )}
        </p>

        <form className="auth-verify-form" onSubmit={handleVerify} noValidate>
          <fieldset className="auth-verify-fieldset">
            <legend className="auth-verify-legend">Verification code</legend>
            <div className="auth-verify-digits" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  className={`auth-verify-digit ${d ? "filled" : ""}`}
                  value={d}
                  onChange={(e) => handleChange(i, e)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={submitLoading}
                  aria-label={`Digit ${i + 1} of ${CODE_LEN}`}
                />
              ))}
            </div>
          </fieldset>

          {error ? (
            <p className="auth-verify-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className={`auth-verify-submit ${submitLoading ? "auth-verify-submit--busy" : ""}`}
            disabled={!isComplete || submitLoading}
          >
            {submitLoading ? (
              <span className="auth-spinner" aria-hidden />
            ) : isEmailChange || isTwoFactor ? (
              submitLabel
            ) : (
              <>
                {submitLabel}
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
        </form>

        <p className="auth-verify-resend">
          Didn&apos;t get the email?{" "}
          {resendCooldown > 0 ? (
            <span className="auth-verify-cooldown">
              Resend in {resendCooldown}s
            </span>
          ) : (
            <button
              type="button"
              className="auth-verify-resend-btn"
              onClick={handleResend}
              disabled={resendLoading || submitLoading || cancelLoading}
            >
              {resendLoading ? (
                <span
                  className="auth-spinner auth-spinner--muted"
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                  aria-hidden
                />
              ) : (
                "Resend code"
              )}
            </button>
          )}
        </p>

        {isEmailChange && onCancelChange ? (
          <p className="auth-verify-cancel-row">
            <button
              type="button"
              className="auth-verify-cancel-link"
              onClick={handleCancelChange}
              disabled={cancelLoading || submitLoading}
            >
              {cancelLoading ? (
                <span
                  className="auth-spinner auth-spinner--muted"
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                  aria-hidden
                />
              ) : (
                "Cancel email change"
              )}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default VerifyEmailModal;
