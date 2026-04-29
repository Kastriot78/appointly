import {
  HiOutlineRefresh,
  HiOutlineExclamationCircle,
} from "react-icons/hi";

function looksLikeNetworkFailure(message) {
  if (message == null || typeof message !== "string") return false;
  const m = message.toLowerCase();
  return (
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("connection") ||
    m.includes("timeout") ||
    m.includes("econnrefused") ||
    m.includes("err_network")
  );
}

export default function DashboardErrorPanel({
  message,
  title,
  onRetry,
  retryLabel = "Try again",
  className = "",
}) {
  const network = looksLikeNetworkFailure(message);
  const heading =
    title ||
    (network ? "Can’t reach the server" : "Something went wrong");
  const hint = network
    ? "Check your connection and that the app server is running, then try again."
    : null;

  return (
    <div
      className={`dp-error-panel ${className}`.trim()}
      role="alert"
      aria-live="polite"
    >
      <div className="dp-error-panel__icon-wrap" aria-hidden>
        <HiOutlineExclamationCircle className="dp-error-panel__icon" />
      </div>
      <div className="dp-error-panel__content">
        <h2 className="dp-error-panel__title">{heading}</h2>
        {message ? (
          <p className="dp-error-panel__detail">{message}</p>
        ) : null}
        {hint ? <p className="dp-error-panel__hint">{hint}</p> : null}
        {typeof onRetry === "function" ? (
          <button
            type="button"
            className="dp-error-panel__retry"
            onClick={onRetry}
          >
            <HiOutlineRefresh size={18} aria-hidden />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
