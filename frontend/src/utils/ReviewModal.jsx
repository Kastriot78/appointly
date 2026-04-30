import { useState, useEffect } from "react";
import { createReview } from "../api/reviews";
import { getApiErrorMessage } from "../api/auth";

/**
 * @param {object} props
 * @param {{ staffId: string, staffName: string, options: Array<{ bookingId: string, dateLabel: string, serviceLabel: string }> } | null} props.staffReviewContext
 */
const ReviewModal = ({
  isOpen,
  onClose,
  businessName,
  businessId,
  onSuccess,
  staffReviewContext = null,
}) => {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setRating(0);
      setHoveredStar(0);
      setText("");
      setSubmitted(false);
      setLoading(false);
      setError(null);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, staffReviewContext]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose, loading]);

  const handleSubmit = async () => {
    if (rating === 0 || !text.trim() || !businessId || loading) return;
    const staffBookingId = staffReviewContext?.options?.[0]?.bookingId;
    if (staffReviewContext && !staffBookingId) return;
    setError(null);
    setLoading(true);
    try {
      if (staffReviewContext && staffBookingId) {
        await createReview({
          businessId,
          rating,
          text: text.trim(),
          staffId: staffReviewContext.staffId,
          bookingId: String(staffBookingId),
        });
      } else {
        await createReview({
          businessId,
          rating,
          text: text.trim(),
        });
      }
      if (typeof onSuccess === "function") {
        await onSuccess();
      }
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const ratingLabels = ["", "Terrible", "Poor", "Okay", "Great", "Amazing"];
  const activeRating = hoveredStar || rating;
  const isStaffMode = Boolean(
    staffReviewContext && staffReviewContext.options?.length,
  );

  if (!isOpen) return null;

  return (
    <div className={`rm-overlay ${isOpen ? "open" : ""}`} onClick={loading ? undefined : onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rm-close" onClick={onClose} disabled={loading} type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 15L15 5M5 5L15 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {submitted ? (
          <div className="rm-success">
            <div className="rm-success-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="24" fill="#ECFDF5" />
                <path
                  d="M15 24.5L21 30.5L33 18.5"
                  stroke="#10B981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>Thank You!</h3>
            <p>Your review has been submitted successfully.</p>
          </div>
        ) : (
          <>
            <div className="rm-header">
              <h2>{isStaffMode ? "Rate your provider" : "Write a Review"}</h2>
              {isStaffMode ? (
                <>
                  <p>
                    How was your visit with{" "}
                    <strong>{staffReviewContext.staffName}</strong> at{" "}
                    <strong>{businessName}</strong>?
                  </p>
                  <p className="rm-staff-hint">
                    This feedback is <strong>private</strong> — only the business
                    sees it in their dashboard. It is not shown on the public
                    reviews tab.
                  </p>
                </>
              ) : (
                <p>
                  Share your experience at <strong>{businessName}</strong>
                </p>
              )}
            </div>

            {error ? (
              <div
                role="alert"
                style={{
                  marginBottom: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            ) : null}

            <div className="rm-rating-section">
              <div className="rm-stars-interactive">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`rm-star ${star <= activeRating ? "active" : ""}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    type="button"
                    disabled={loading}
                  >
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path
                        d="M16 2L20.1 10.3L29.5 11.7L22.7 18.3L24.3 27.7L16 23.3L7.7 27.7L9.3 18.3L2.5 11.7L11.9 10.3L16 2Z"
                        fill={star <= activeRating ? "#F59E0B" : "transparent"}
                        stroke={star <= activeRating ? "#F59E0B" : "#D1D5DB"}
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
              <span
                className={`rm-rating-label ${activeRating > 0 ? "visible" : ""}`}
              >
                {ratingLabels[activeRating] || "Select a rating"}
              </span>
            </div>

            <div className="rm-text-section">
              <label htmlFor="rm-textarea">Your Review</label>
              <textarea
              className="form-control"
                id="rm-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  isStaffMode
                    ? "What stood out about this team member? (Only the business will read this.)"
                    : "Tell others about your experience — what was great, what could be improved?"
                }
                rows="5"
                maxLength={5000}
                disabled={loading}
              />
              <div className="rm-char-count">
                <span className={text.length >= 4800 ? "warn" : ""}>
                  {text.length}
                </span>
                /5000
              </div>
            </div>

            <div className="rm-footer">
              <button className="rm-cancel" onClick={onClose} type="button" disabled={loading}>
                Cancel
              </button>
              <button
                className="rm-submit"
                onClick={handleSubmit}
                disabled={
                  rating === 0 ||
                  !text.trim() ||
                  loading ||
                  (isStaffMode && !staffReviewContext?.options?.[0]?.bookingId)
                }
                type="button"
              >
                {loading ? "Submitting…" : "Submit Review"}
                {!loading ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M14.5 1.5L6.5 9.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14.5 1.5L10 14.5L6.5 9.5L1.5 6L14.5 1.5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReviewModal;
