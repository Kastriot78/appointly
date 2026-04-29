import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getApiErrorMessage } from "../../api/auth";
import { deleteAccount } from "../../api/users";
import "../Auth/auth.css";

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

const DeleteAccountModal = ({
  isOpen,
  onClose,
  signInEmail,
  isTenant,
  onDeleted,
  showToast,
}) => {
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const expected = normalizeEmail(signInEmail);
  const matches = normalizeEmail(confirmValue) === expected && expected.length > 0;

  useEffect(() => {
    if (!isOpen) {
      setConfirmValue("");
      setError("");
      setLoading(false);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!matches || loading) return;
    setError("");
    setLoading(true);
    try {
      await deleteAccount(confirmValue.trim());
      showToast("Your account has been deleted.", "success");
      onDeleted();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const node = (
    <div
      className="auth-verify-overlay"
      role="presentation"
      onClick={() => !loading && onClose()}
    >
      <div
        className="auth-verify-modal dp-delete-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dp-delete-account-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <button
          type="button"
          className="auth-verify-close"
          onClick={() => !loading && onClose()}
          disabled={loading}
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

        <h2 id="dp-delete-account-title" className="auth-verify-title">
          Delete your account?
        </h2>
        <div className="dp-delete-account-body">
          <p className="dp-delete-account-lead">
            This will permanently delete your account and cannot be undone.
          </p>
          <ul className="dp-delete-account-list">
            <li>Your profile and sign-in access will be removed.</li>
            {isTenant ? (
              <li>
                Businesses you own, their services, staff, and related bookings
                will be deleted.
              </li>
            ) : null}
            <li>Your bookings and reviews will be removed.</li>
          </ul>
          <p className="dp-delete-account-confirm-hint">
            Type{" "}
            <strong className="dp-delete-account-email">{signInEmail}</strong> to
            confirm:
          </p>
          <form onSubmit={handleSubmit} className="dp-delete-account-form">
            <label className="dp-delete-account-label" htmlFor="dp-delete-email-input">
              Your email
            </label>
            <input
              ref={inputRef}
              id="dp-delete-email-input"
              type="email"
              className="dp-delete-account-input form-control"
              name="confirmEmail"
              autoComplete="off"
              value={confirmValue}
              onChange={(ev) => {
                setConfirmValue(ev.target.value);
                if (error) setError("");
              }}
              placeholder={signInEmail}
              disabled={loading}
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <p className="dp-delete-account-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="dp-delete-account-actions">
              <button
                type="button"
                className="dp-delete-account-cancel"
                onClick={() => !loading && onClose()}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dp-delete-account-submit"
                disabled={!matches || loading}
              >
                {loading ? "Deleting…" : "I understand, delete my account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default DeleteAccountModal;
