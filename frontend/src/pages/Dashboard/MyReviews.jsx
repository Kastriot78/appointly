import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { isTenantAccount, isStaffRole } from "../../utils/roles";
import {
  listMyReviews,
  listManagedReviews,
} from "../../api/reviews";
import { getApiErrorMessage } from "../../api/auth";
import { resolveMediaUrl } from "../../utils/assets";
import CustomSelect from "../../utils/CustomSelect";
import { DashboardSkeletonReviews } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import "./dashboard-pages.css";

function formatRelative(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function StarRating({ rating, size = 14 }) {
  return (
    <div className="dp-stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width={size}
          height={size}
          viewBox="0 0 14 14"
          fill="none"
        >
          <path
            d="M7 1L8.85 4.75L13 5.35L10 8.25L10.7 12.35L7 10.4L3.3 12.35L4 8.25L1 5.35L5.15 4.75L7 1Z"
            fill={star <= rating ? "#F59E0B" : "#E2E8F0"}
            stroke={star <= rating ? "#F59E0B" : "#E2E8F0"}
            strokeWidth="0.5"
          />
        </svg>
      ))}
    </div>
  );
}

function avatarFallback(name) {
  const n = encodeURIComponent((name || "B").trim() || "B");
  return `https://ui-avatars.com/api/?name=${n}&size=80&background=e0e7ff&color=4f46e5`;
}

const MyReviews = () => {
  const { user, activeWorkspaceId } = useOutletContext();
  const isTenant = isTenantAccount(user.role) || isStaffRole(user.role);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [ratingFilter, setRatingFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = isTenant
        ? await listManagedReviews()
        : await listMyReviews();
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [isTenant]);

  useEffect(() => {
    load();
  }, [load, activeWorkspaceId]);

  const avgRating = useMemo(() => {
    if (!reviews.length) return "0.0";
    const sum = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const ratingFilterOptions = useMemo(
    () => [
      { value: "all", label: "All ratings" },
      { value: "5", label: "5 stars" },
      { value: "4", label: "4 stars" },
      { value: "3", label: "3 stars" },
      { value: "2", label: "2 stars" },
      { value: "1", label: "1 star" },
    ],
    [],
  );
  const filteredReviews = useMemo(() => {
    if (ratingFilter === "all") return reviews;
    const target = Number(ratingFilter);
    return reviews.filter((r) => Number(r.rating) === target);
  }, [reviews, ratingFilter]);

  return (
    <div className="dp-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">{isTenant ? "Reviews" : "My Reviews"}</h1>
          <p className="dp-subtitle">
            {isTenant
              ? "Public business reviews and private staff feedback from clients"
              : "Reviews you've written for businesses and team members"}
          </p>
        </div>
      </div>

      {loadError && !loading ? (
        <DashboardErrorPanel message={loadError} onRetry={load} />
      ) : loading ? (
        <DashboardSkeletonReviews rows={4} />
      ) : (
        <>
          {/* Stats */}
          <div className="dp-review-stats">
            <div className="dp-stat-card">
              <span className="dp-stat-value">{avgRating}</span>
              {reviews.length > 0 ? (
                <StarRating rating={Math.round(Number(avgRating))} />
              ) : (
                <div style={{ height: 14 }} aria-hidden />
              )}
              <span className="dp-stat-label">Average Rating</span>
            </div>
            <div className="dp-stat-card">
              <span className="dp-stat-value">{reviews.length}</span>
              <span className="dp-stat-label">Total Reviews</span>
            </div>
          </div>

          {reviews.length > 0 ? (
            <div className="dp-reviews-filter-row">
              <span
                className="dp-bookings-sort-label"
                id="dp-reviews-rating-filter-label"
              >
                Filter by stars
              </span>
              <div
                className="dp-bookings-sort-cselect dp-reviews-rating-filter"
                aria-labelledby="dp-reviews-rating-filter-label"
              >
                <CustomSelect
                  options={ratingFilterOptions}
                  value={ratingFilter}
                  onChange={setRatingFilter}
                  placeholder="All ratings"
                />
              </div>
            </div>
          ) : null}

          {/* Reviews */}
          <div className="dp-reviews-list">
        {reviews.length === 0 ? (
          <p className="dp-subtitle" style={{ padding: "24px 0" }}>
            {isTenant
              ? "No reviews yet. When customers leave feedback, it will appear here."
              : "You haven't written any reviews yet. Book a service and share your experience."}
          </p>
        ) : filteredReviews.length === 0 ? (
          <p className="dp-subtitle" style={{ padding: "24px 0" }}>
            No reviews found for this star rating.
          </p>
        ) : (
          filteredReviews.map((review) => {
            const logo = review.business?.logo
              ? resolveMediaUrl(review.business.logo)
              : null;
            const title = isTenant
              ? `${review.customer?.name?.trim() || "Customer"}${
                  review.isStaffReview ? " · Staff review" : ""
                }`
              : review.business?.name?.trim() || "Business";
            const subtitle = isTenant
              ? [
                  review.business?.name?.trim() || "",
                  review.isStaffReview && review.staff?.name
                    ? `Staff: ${review.staff.name}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "";
            const imgSrc =
              logo || avatarFallback(isTenant ? review.customer?.name : review.business?.name);

            return (
              <div key={review.id} className="dp-review-card">
                <div className="dp-review-top">
                  <img
                    src={imgSrc}
                    alt=""
                    className="dp-review-img"
                  />
                  <div className="dp-review-info">
                    <h3>{title}</h3>
                    <span className="dp-review-date">
                      {isTenant && subtitle
                        ? `${subtitle} · ${formatRelative(review.createdAt)}`
                        : formatRelative(review.createdAt)}
                    </span>
                  </div>
                  <StarRating rating={review.rating} />
                </div>
                {!isTenant && review.isStaffReview && review.staff?.name ? (
                  <p className="dp-review-staff-note">
                    Private feedback for {review.staff.name}
                    {review.staff.role ? ` · ${review.staff.role}` : ""}
                  </p>
                ) : null}
                <p className="dp-review-text">{review.text}</p>

                {review.reply && String(review.reply).trim() ? (
                  <div className="dp-review-reply">
                    <span className="dp-reply-label">
                      {isTenant ? "Your reply" : "Business replied"}
                    </span>
                    <p>{review.reply}</p>
                  </div>
                ) : null}

              </div>
            );
          })
        )}
          </div>
        </>
      )}
    </div>
  );
};

export default MyReviews;
