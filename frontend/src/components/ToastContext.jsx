import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import "./toast.css";

const ToastContext = createContext(null);

const DURATION_MS = 4200;

function ToastSurface({ toast, onDismiss }) {
  if (!toast) return null;

  const isSuccess = toast.variant === "success";

  return (
    <div
      className={`app-toast app-toast--${toast.variant}`}
      role={isSuccess ? "status" : "alert"}
      aria-live={isSuccess ? "polite" : "assertive"}
    >
      <div className="app-toast__icon" aria-hidden>
        {isSuccess ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M16.25 5.625L8.125 13.75L3.75 9.375"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 5L15 15M15 5L5 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div className="app-toast__body">
        <div className="app-toast__title">
          {isSuccess ? "All set" : "Something went wrong"}
        </div>
        <div className="app-toast__msg">{toast.message}</div>
      </div>
      <button
        type="button"
        className="app-toast__close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message, variant = "success") => {
      if (!message) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ id: Date.now(), message, variant });
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, DURATION_MS);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const portal =
    toast && typeof document !== "undefined"
      ? createPortal(
          <div className="app-toast-root">
            <ToastSurface toast={toast} onDismiss={dismiss} />
          </div>,
          document.body,
        )
      : null;

  return (
    <ToastContext.Provider value={{ showToast, dismissToast: dismiss }}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
