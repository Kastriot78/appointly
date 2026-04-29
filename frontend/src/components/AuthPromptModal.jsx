import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function AuthPromptModal({
  isOpen,
  onClose,
  title = "Sign in to continue",
  message = "Create an account or sign in to book and leave reviews.",
  returnTo,
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const signInHref = returnTo
    ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-in";
  const signUpHref = returnTo
    ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-up";

  return (
    <div className="rm-overlay open" onClick={onClose} role="presentation">
      <div
        className="rm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ap-auth-title"
      >
        <button className="rm-close" type="button" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 15L15 5M5 5L15 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="rm-header">
          <h2 id="ap-auth-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="rm-footer" style={{ marginTop: 8 }}>
          <Link
            to={signUpHref}
            className="rm-cancel"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Create account
          </Link>
          <Link to={signInHref} className="rm-submit" style={{ textDecoration: "none" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
