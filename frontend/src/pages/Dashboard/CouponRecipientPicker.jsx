import { useMemo } from "react";
import {
  HiOutlineSearch,
  HiOutlineUsers,
  HiOutlineX,
  HiCheck,
} from "react-icons/hi";

/**
 * Searchable multi-select of business customers + "email everyone" option.
 * Uses the same card + circular check pattern as Staff Management service picker.
 */
export default function CouponRecipientPicker({
  customers,
  sendAll,
  onSendAllChange,
  selectedEmails,
  onToggleEmail,
  onRemoveEmail,
  search,
  onSearchChange,
  disabled,
}) {
  const withEmail = useMemo(
    () =>
      (Array.isArray(customers) ? customers : []).filter((c) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email || "").trim()),
      ),
    [customers],
  );

  const q = String(search || "").trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return withEmail;
    return withEmail.filter((c) => {
      const name = String(c.name || "").toLowerCase();
      const email = String(c.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [withEmail, q]);

  const total = withEmail.length;

  return (
    <div className="dp-coupon-send">
      <div className="dp-coupon-send-title">Share by email</div>

      <button
        type="button"
        className={`staff-svc-option dp-coupon-all-option ${sendAll ? "selected" : ""}`}
        onClick={() => onSendAllChange(!sendAll)}
        disabled={disabled || total === 0}
        aria-pressed={sendAll}
      >
        <span className="staff-svc-option-check" aria-hidden>
          {sendAll ? <HiCheck className="staff-svc-check-icon" /> : null}
        </span>
        <span className="staff-svc-option-body">
          <span className="staff-svc-option-name dp-coupon-all-title">
            <HiOutlineUsers size={18} aria-hidden />
            Send to all customers who booked
          </span>
          <span className="staff-svc-option-meta">
            {total > 0
              ? `${total} recipient${total === 1 ? "" : "s"} with email`
              : "No customers yet — bookings create this list"}
          </span>
        </span>
      </button>

      {!sendAll && total > 0 ? (
        <>
          <div className="dp-coupon-ms-search">
            <HiOutlineSearch size={18} aria-hidden />
            <input
              type="search"
              className="dp-coupon-ms-input form-control"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          </div>

          <div
            className="staff-svc-picker dp-coupon-ms-picker"
            role="group"
            aria-label="Select customers to email"
          >
            {filtered.length === 0 ? (
              <p className="dp-coupon-ms-empty">No matches.</p>
            ) : (
              filtered.map((c) => {
                const email = String(c.email || "").trim().toLowerCase();
                const checked = selectedEmails.includes(email);
                const displayName = c.name?.trim() || "Customer";
                return (
                  <button
                    key={email}
                    type="button"
                    className={`staff-svc-option ${checked ? "selected" : ""}`}
                    onClick={() => onToggleEmail(email)}
                    disabled={disabled}
                    aria-pressed={checked}
                  >
                    <span className="staff-svc-option-check" aria-hidden>
                      {checked ? (
                        <HiCheck className="staff-svc-check-icon" />
                      ) : null}
                    </span>
                    <span className="staff-svc-option-body">
                      <span className="staff-svc-option-name">{displayName}</span>
                      <span className="staff-svc-option-meta">{email}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selectedEmails.length > 0 ? (
            <div className="dp-coupon-chips">
              {selectedEmails.map((em) => (
                <span key={em} className="dp-coupon-chip">
                  {em}
                  <button
                    type="button"
                    className="dp-coupon-chip-x"
                    onClick={() => onRemoveEmail(em)}
                    disabled={disabled}
                    aria-label={`Remove ${em}`}
                  >
                    <HiOutlineX size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="dp-coupon-ms-hint">
              Tap rows to select, or choose “all customers” above.
            </p>
          )}
        </>
      ) : null}

      {sendAll && total > 0 ? (
        <p className="dp-coupon-send-summary">
          Will email <strong>{total}</strong> address{total === 1 ? "" : "es"}.
        </p>
      ) : null}
    </div>
  );
}
