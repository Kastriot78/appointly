
function Sk({ className = "", ...rest }) {
  return <span className={`dp-skel ${className}`.trim()} {...rest} />;
}

export function DashboardSkeletonStack({ rows = 4 }) {
  return (
    <div
      className="dp-skel-page__stack dp-skel-page__stack--only"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="dp-skel-card">
          <Sk className="dp-skel-line" />
          <Sk className="dp-skel-line dp-skel-line--narrow" />
        </div>
      ))}
    </div>
  );
}

/** Generic: title + subtitle bars + stacked blocks (business load, hub, etc.). */
export function DashboardPageSkeletonDefault({ rows = 4 }) {
  return (
    <div
      className="dp-skel-page"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="dp-skel-page__head">
        <Sk className="dp-skel-line dp-skel-line--h1" />
        <Sk className="dp-skel-line dp-skel-line--sub" />
      </div>
      <div className="dp-skel-page__stack">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="dp-skel-card">
            <Sk className="dp-skel-line" />
            <Sk className="dp-skel-line dp-skel-line--narrow" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Closing periods list — matches dp-closing-card row layout. */
export function DashboardSkeletonClosingList({ rows = 4 }) {
  return (
    <ul
      className="dp-closing-list dp-skel-closing-list"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="dp-closing-card dp-closing-card--skeleton">
          <Sk className="dp-skel-badge" />
          <div className="dp-skel-closing-body">
            <div className="dp-skel-closing-range">
              <Sk className="dp-skel-line dp-skel-line--sm" />
              <Sk className="dp-skel-line dp-skel-line--sm" />
            </div>
            <Sk className="dp-skel-line dp-skel-line--narrow" />
          </div>
          <div className="dp-skel-closing-actions">
            <Sk className="dp-skel-pill" />
            <Sk className="dp-skel-pill" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Customers / top-customers style table body. */
export function DashboardSkeletonTable({ cols = 4, rows = 5 }) {
  return (
    <div
      className="dp-skel-table-wrap"
      aria-busy="true"
      aria-live="polite"
    >
      <table className="dp-skel-table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} scope="col">
                <Sk className="dp-skel-line dp-skel-line--th" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri}>
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci}>
                  <Sk
                    className={`dp-skel-line dp-skel-line--td ${ci >= cols - 2 ? "dp-skel-line--td-num" : ""}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Spending: summary strip + card rows (includes list wrapper). */
export function DashboardSkeletonSpending({ rows = 5 }) {
  return (
    <div className="dp-skel-spending" aria-busy="true" aria-live="polite">
      <div className="dp-skel-spending-total">
        <Sk className="dp-skel-spending-icon" />
        <div className="dp-skel-spending-total-text">
          <Sk className="dp-skel-line dp-skel-line--sub" />
          <Sk className="dp-skel-line dp-skel-line--h1 dp-skel-line--short" />
        </div>
      </div>
      <ul className="dp-customer-spending-list">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="dp-customer-spending-card">
            <div className="dp-customer-spending-card-main">
              <Sk className="dp-skel-logo" />
              <div>
                <Sk className="dp-skel-line" />
                <Sk className="dp-skel-line dp-skel-line--narrow" />
              </div>
            </div>
            <Sk className="dp-skel-line dp-skel-line--amount" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Booking cards — parent should use `.dp-bookings-list`. */
export function DashboardSkeletonBookings({ rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="dp-booking-card dp-booking-card--skeleton"
          aria-busy={i === 0 ? true : undefined}
          aria-live={i === 0 ? "polite" : undefined}
        >
          <Sk className="dp-skel-booking-avatar" />
          <div className="dp-skel-booking-main">
            <Sk className="dp-skel-line" />
            <Sk className="dp-skel-line dp-skel-line--narrow" />
            <Sk className="dp-skel-line dp-skel-line--sub" />
          </div>
          <Sk className="dp-skel-pill dp-skel-pill--wide" />
        </div>
      ))}
    </>
  );
}

/** Email history list — vertical cards. */
export function DashboardSkeletonEmailHistory({ rows = 3 }) {
  return (
    <ul className="dp-email-history-list" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="dp-email-history-card dp-email-history-card--skeleton">
          <Sk className="dp-skel-line" />
          <Sk className="dp-skel-line dp-skel-line--narrow" />
          <Sk className="dp-skel-line dp-skel-line--sub" />
        </li>
      ))}
    </ul>
  );
}

/** Coupon cards grid (simplified). */
export function DashboardSkeletonCouponCards({ rows = 3 }) {
  return (
    <ul className="dp-coupon-list-v2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="dp-coupon-card-v2 dp-coupon-card-v2--skeleton">
          <Sk className="dp-skel-line dp-skel-line--h1" />
          <Sk className="dp-skel-line dp-skel-line--sub" />
          <div className="dp-skel-coupon-row">
            <Sk className="dp-skel-pill" />
            <Sk className="dp-skel-pill" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Service cards — wrap with parent `.dt-services-grid`. */
export function DashboardSkeletonServiceCards({ rows = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="dt-service-card dt-service-card--skeleton"
          aria-busy={i === 0 ? true : undefined}
          aria-live={i === 0 ? "polite" : undefined}
        >
          <Sk className="dp-skel-line" />
          <Sk className="dp-skel-line dp-skel-line--narrow" />
          <Sk className="dp-skel-line dp-skel-line--sub" />
        </div>
      ))}
    </>
  );
}

/** Staff cards — parent should use `.dt-staff-grid`. */
export function DashboardSkeletonStaffCards({ rows = 3 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="dt-staff-card dt-staff-card--skeleton"
          aria-busy={i === 0 ? true : undefined}
          aria-live={i === 0 ? "polite" : undefined}
        >
          <div className="dt-staff-top">
            <Sk className="dp-skel-staff-avatar" />
            <div className="dp-skel-staff-text">
              <Sk className="dp-skel-line" />
              <Sk className="dp-skel-line dp-skel-line--sub" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** My Businesses cards — parent should use `.mb-grid` (do not nest another grid). */
export function DashboardSkeletonBusinessCards({ rows = 2 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="mb-card mb-card--skeleton"
          aria-busy={i === 0 ? true : undefined}
          aria-live={i === 0 ? "polite" : undefined}
        >
          <Sk className="dp-skel-mb-cover" />
          <div className="dp-skel-mb-body">
            <Sk className="dp-skel-line" />
            <Sk className="dp-skel-line dp-skel-line--narrow" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Reviews list + optional stat placeholders. */
export function DashboardSkeletonReviews({ rows = 3 }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="dp-review-stats dp-review-stats--skeleton">
        <div className="dp-stat-card">
          <Sk className="dp-skel-line dp-skel-line--h1" />
          <Sk className="dp-skel-line dp-skel-line--sub" />
        </div>
        <div className="dp-stat-card">
          <Sk className="dp-skel-line dp-skel-line--h1" />
          <Sk className="dp-skel-line dp-skel-line--sub" />
        </div>
      </div>
      <div className="dp-reviews-list">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="dp-review-card dp-review-card--skeleton">
            <div className="dp-skel-review-head">
              <Sk className="dp-skel-review-avatar" />
              <div>
                <Sk className="dp-skel-line" />
                <Sk className="dp-skel-line dp-skel-line--sub" />
              </div>
            </div>
            <Sk className="dp-skel-line" />
            <Sk className="dp-skel-line dp-skel-line--narrow" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Email compose body — use under existing “Compose message” heading. */
export function DashboardSkeletonEmailCompose() {
  return (
    <div
      className="dp-email-compose--skeleton-inner"
      aria-busy="true"
      aria-live="polite"
    >
      <Sk className="dp-skel-line dp-skel-line--sub" />
      <Sk className="dp-skel-field" />
      <Sk className="dp-skel-field dp-skel-field--tall" />
      <Sk className="dp-skel-line dp-skel-line--btn" />
    </div>
  );
}
