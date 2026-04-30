import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, Link } from "react-router-dom";
import {
  isTenantAccount,
  isStaffRole,
  isAdminRole,
  isCustomerRole,
} from "../../utils/roles";
import { getDashboardOverview } from "../../api/dashboard";
import { getApiErrorMessage } from "../../api/auth";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import AdminDashboardOverview from "./AdminDashboardOverview";
import {
  HiOutlineCalendar,
  HiOutlineCheckCircle,
  HiOutlineStar,
  HiOutlineHeart,
  HiOutlineCurrencyEuro,
  HiOutlineUsers,
  HiOutlineSearch,
  HiOutlineClipboardList,
  HiOutlineUser,
  HiHand,
  HiOutlineViewGrid,
  HiOutlineChartPie,
} from "react-icons/hi";
import { formatMoneyAmount, normalizeCurrency } from "../../utils/currency";
import CustomerNextBookingCountdown from "./CustomerNextBookingCountdown";
import CustomerServiceSuggestions from "./CustomerServiceSuggestions";
import YmdDatePickerField from "../../components/YmdDatePickerField";
import "./dashboard-pages.css";
import "./dashboard-overview.css";

function utcYmdToday() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

function utcYmdPlusDays(deltaDays) {
  const n = new Date();
  n.setUTCDate(n.getUTCDate() + deltaDays);
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

/** Labels/icons for customer overview — values come from `GET /api/dashboard/overview` (`scope: customer`). */
const customerStatTemplate = [
  {
    label: "Upcoming Bookings",
    metric: "upcomingBookingsCount",
    icon: <HiOutlineCalendar size={22} />,
    color: "#4f46e5",
    bg: "#eef2ff",
  },
  {
    label: "Completed Visits",
    metric: "completedVisitsCount",
    icon: <HiOutlineCheckCircle size={22} />,
    color: "#10b981",
    bg: "#ecfdf5",
  },
  {
    label: "Reviews Written",
    metric: "reviewsWrittenCount",
    icon: <HiOutlineStar size={22} />,
    color: "#f59e0b",
    bg: "#fffbeb",
  },
  {
    label: "Favorite Businesses",
    metric: "favoriteBusinessesCount",
    icon: <HiOutlineHeart size={22} />,
    color: "#ef4444",
    bg: "#fef2f2",
  },
];

const tenantStatTemplate = [
  {
    label: "Today's Bookings",
    icon: <HiOutlineCalendar size={22} />,
    color: "#4f46e5",
    bg: "#eef2ff",
  },
  {
    label: "This Week Revenue",
    icon: <HiOutlineCurrencyEuro size={22} />,
    color: "#10b981",
    bg: "#ecfdf5",
  },
  {
    label: "Total Clients",
    icon: <HiOutlineUsers size={22} />,
    color: "#f59e0b",
    bg: "#fffbeb",
  },
  {
    label: "Average Rating",
    icon: <HiOutlineStar size={22} />,
    color: "#ef4444",
    bg: "#fef2f2",
  },
];

function formatRating(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "0.0";
  return (Math.round(n * 10) / 10).toFixed(1);
}

function formatBookedMinutes(total) {
  const m = Math.max(0, Math.round(Number(total) || 0));
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function formatScheduleHeaderDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return iso;
  const [y, mo, d] = parts;
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function StaffUtilCell({ day }) {
  if (!day) return <span className="dp-staff-util-muted">—</span>;
  if (!day.isWorkingDay) {
    return <span className="dp-staff-util-off">Day off</span>;
  }
  const pct =
    typeof day.utilizationPercent === "number" ? day.utilizationPercent : 0;
  return (
    <div className="dp-staff-util-cell">
      <div className="dp-staff-util-meta">
        <strong>{day.appointmentsCount}</strong>{" "}
        {day.appointmentsCount === 1 ? "appt" : "appts"} ·{" "}
        {formatBookedMinutes(day.bookedMinutes)} booked
      </div>
      <div className="dp-staff-util-bar-wrap" aria-hidden>
        <div
          className="dp-staff-util-bar"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="dp-staff-util-pct">{pct}% of shift</div>
    </div>
  );
}

/** Matches MyBookings status styling so e.g. expired is not shown as confirmed. */
const scheduleStatus = {
  confirmed: { label: "Confirmed", color: "#10b981", bg: "#ecfdf5" },
  pending: { label: "Pending", color: "#f59e0b", bg: "#fffbeb" },
  pending_confirmation: {
    label: "Confirm time",
    color: "#d97706",
    bg: "#fffbeb",
  },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "#fef2f2" },
  completed: { label: "Completed", color: "#4f46e5", bg: "#eef2ff" },
  no_show: { label: "No-show", color: "#64748b", bg: "#f1f5f9" },
  expired: { label: "Expired", color: "#94a3b8", bg: "#f1f5f9" },
};

function DashboardOverviewContent() {
  const { user, activeWorkspaceId } = useOutletContext();
  const isTenant = isTenantAccount(user.role);
  const isStaff = isStaffRole(user?.role);
  const showWorkspaceKpis = isTenant || isStaff;
  const [kpi, setKpi] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState(null);
  const [staffUtilYmd, setStaffUtilYmd] = useState(utcYmdToday);

  useEffect(() => {
    setStaffUtilYmd(utcYmdToday());
  }, [activeWorkspaceId]);

  const loadDashboardKpi = useCallback(async () => {
    setKpiLoading(true);
    setKpiError(null);
    try {
      const { data } = await getDashboardOverview({
        staffUtilDate: staffUtilYmd,
      });
      setKpi(data);
    } catch (err) {
      setKpiError(getApiErrorMessage(err));
      setKpi(null);
    } finally {
      setKpiLoading(false);
    }
  }, [staffUtilYmd]);

  useEffect(() => {
    loadDashboardKpi();
  }, [loadDashboardKpi]);

  const tenantStats = useMemo(() => {
    if (kpiLoading) {
      return tenantStatTemplate.map((t) => ({
        ...t,
        value: "",
      }));
    }
    const wc = normalizeCurrency(kpi?.workspaceCurrency);
    const values = kpi
      ? [
          String(kpi.todayBookingsCount ?? 0),
          formatMoneyAmount(kpi.weekRevenue ?? 0, wc),
          String(kpi.totalClients ?? 0),
          formatRating(kpi.averageRating),
        ]
      : ["—", "—", "—", "—"];
    return tenantStatTemplate.map((t, i) => ({
      ...t,
      value: values[i],
    }));
  }, [kpi, kpiLoading]);

  const customerStats = useMemo(() => {
    if (kpiLoading) {
      return customerStatTemplate.map((t) => ({
        ...t,
        value: "",
      }));
    }
    if (!kpi || kpi.scope !== "customer") {
      return customerStatTemplate.map((t) => ({
        ...t,
        value: "—",
      }));
    }
    return customerStatTemplate.map((t) => ({
      ...t,
      value: String(kpi[t.metric] ?? 0),
    }));
  }, [kpi, kpiLoading]);

  const todaySchedule = useMemo(() => {
    if (!kpi?.todaySchedule || !Array.isArray(kpi.todaySchedule)) return [];
    return kpi.todaySchedule;
  }, [kpi]);

  const topCustomers = useMemo(() => {
    if (!kpi?.topCustomers || !Array.isArray(kpi.topCustomers)) return [];
    return kpi.topCustomers;
  }, [kpi]);

  const workspaceCurrency = normalizeCurrency(kpi?.workspaceCurrency);

  const staffScheduleLoad = useMemo(() => {
    if (!kpi?.staffScheduleLoad || !Array.isArray(kpi.staffScheduleLoad)) {
      return [];
    }
    return kpi.staffScheduleLoad;
  }, [kpi]);

  const staffScheduleHeaderDate = formatScheduleHeaderDate(
    kpi?.staffScheduleDate || staffUtilYmd,
  );

  const staffPickerMaxYmd = useMemo(() => utcYmdPlusDays(730), []);

  const stats = showWorkspaceKpis ? tenantStats : customerStats;
  const firstName = (user.name || "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="dp-page dp-overview">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">
            Welcome back, {firstName}{" "}
            <HiHand
              size={28}
              style={{
                display: "inline",
                verticalAlign: "middle",
                color: "#f59e0b",
              }}
            />
          </h1>
          <p className="dp-subtitle">
            {isTenant
              ? "Here's what's happening with your business today"
              : isStaff
                ? "Your schedule and numbers for this workplace"
                : "Here's a summary of your appointments"}
          </p>
        </div>
      </div>

      {kpiError && !kpiLoading ? (
        <DashboardErrorPanel message={kpiError} onRetry={loadDashboardKpi} />
      ) : (
        <>
          {/* Stats Grid */}
          <div className="dp-stats-grid">
            {stats.map((stat, i) => (
              <div key={i} className="dp-overview-stat">
                <div
                  className="dp-overview-icon"
                  style={{ background: stat.bg, color: stat.color }}
                >
                  {stat.icon}
                </div>
                <div className="dp-overview-info">
                  {kpiLoading ? (
                    <span
                      className="dp-overview-value dp-skeleton-value"
                      aria-hidden
                    />
                  ) : (
                    <span
                      className="dp-overview-value"
                      style={{ color: stat.color }}
                    >
                      {stat.value}
                    </span>
                  )}
                  <span className="dp-overview-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>

          {(isTenant || isStaff) && (
            <div className="dp-staff-util-section">
              <div className="dp-staff-util-head">
                <div className="dp-staff-util-title-row">
                  <div className="dp-staff-util-icon" aria-hidden>
                    <HiOutlineChartPie size={22} />
                  </div>
                  <div>
                    <h3 className="dp-section-heading dp-staff-util-heading">
                      Staff utilization
                    </h3>
                    <p className="dp-staff-util-hint">
                      Pick a day to see each team member&apos;s bookings and how
                      much of their shift is filled (visit length only;
                      cancelled excluded). Staff are ordered by most
                      appointments that day.
                    </p>
                  </div>
                </div>
                <div className="dp-staff-util-date">
                  <YmdDatePickerField
                    label="Day"
                    value={staffUtilYmd}
                    onChange={setStaffUtilYmd}
                    minYmd="2020-01-01"
                    maxYmd={staffPickerMaxYmd}
                    embedded
                    className="dp-staff-util-date-field"
                    popoverAlign="end"
                  />
                </div>
              </div>
              {kpiLoading ? (
                <div
                  className="dp-top-customers-skeleton"
                  role="status"
                  aria-label="Loading staff utilization"
                >
                  <div className="dp-top-customers-table-wrap">
                    <table className="dp-top-customers-table dp-staff-util-table">
                      <thead>
                        <tr>
                          <th scope="col">Staff</th>
                          <th scope="col">That day</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0, 1, 2].map((i) => (
                          <tr
                            key={i}
                            className="dp-top-customers-row--skeleton"
                          >
                            <td>
                              <span className="dp-skeleton dp-skel-cell" />
                            </td>
                            <td>
                              <span className="dp-skeleton dp-skel-cell dp-skel-cell--wide" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : staffScheduleLoad.length === 0 ? (
                <p className="dp-subtitle dp-staff-util-empty">
                  No active staff in this workspace yet. Add team members under{" "}
                  <Link to="/dashboard/manage/staff">Team &amp; staff</Link> to
                  see utilization here.
                </p>
              ) : (
                <div className="dp-top-customers-table-wrap">
                  <table className="dp-top-customers-table dp-staff-util-table">
                    <thead>
                      <tr>
                        <th scope="col">Staff</th>
                        <th scope="col">
                          Bookings
                          <span className="dp-staff-util-th-sub">
                            {staffScheduleHeaderDate}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffScheduleLoad.map((row) => (
                        <tr key={row.staffId}>
                          <td className="dp-top-customers-name">{row.name}</td>
                          <td>
                            <StaffUtilCell day={row.day} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {isCustomerRole(user?.role) && !isTenant ? (
            <CustomerServiceSuggestions />
          ) : null}

          {isCustomerRole(user?.role) ? (
            <CustomerNextBookingCountdown
              booking={
                kpi?.scope === "customer" ? kpi.nearestUpcomingBooking : null
              }
              loading={kpiLoading}
            />
          ) : null}

          {/* Quick Actions */}
          <div className="dp-quick-actions">
            <h3 className="dp-section-heading">Quick Actions</h3>
            <div className="dp-actions-grid">
              {isTenant ? (
                <>
                  <Link to="/dashboard/bookings" className="dp-quick-card">
                    <HiOutlineClipboardList size={28} />
                    <span>View Bookings</span>
                  </Link>
                  <Link
                    to="/dashboard/manage/services"
                    className="dp-quick-card"
                  >
                    <HiOutlineViewGrid size={28} />
                    <span>Services &amp; pricing</span>
                  </Link>
                  <Link to="/dashboard/manage/staff" className="dp-quick-card">
                    <HiOutlineUsers size={28} />
                    <span>Team &amp; staff</span>
                  </Link>
                  <Link to="/dashboard/reviews" className="dp-quick-card">
                    <HiOutlineStar size={28} />
                    <span>View Reviews</span>
                  </Link>
                </>
              ) : isStaff ? (
                <>
                  <Link to="/dashboard/bookings" className="dp-quick-card">
                    <HiOutlineClipboardList size={28} />
                    <span>View Bookings</span>
                  </Link>
                  <Link to="/dashboard/profile" className="dp-quick-card">
                    <HiOutlineUser size={28} />
                    <span>Edit Profile</span>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/book" className="dp-quick-card">
                    <HiOutlineSearch size={28} />
                    <span>Find & Book</span>
                  </Link>
                  <Link to="/dashboard/bookings" className="dp-quick-card">
                    <HiOutlineCalendar size={28} />
                    <span>My Bookings</span>
                  </Link>
                  {isCustomerRole(user?.role) ? (
                    <Link to="/dashboard/spending" className="dp-quick-card">
                      <HiOutlineCurrencyEuro size={28} />
                      <span>Spending by business</span>
                    </Link>
                  ) : null}
                  <Link to="/dashboard/reviews" className="dp-quick-card">
                    <HiOutlineStar size={28} />
                    <span>My Reviews</span>
                  </Link>
                  <Link to="/dashboard/profile" className="dp-quick-card">
                    <HiOutlineUser size={28} />
                    <span>Edit Profile</span>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          {(isTenant || isStaff) && (
            <div className="dp-recent-section">
              <div className="dp-recent-header">
                <h3 className="dp-section-heading">Today&apos;s Schedule</h3>
                <Link to="/dashboard/bookings" className="dp-view-all">
                  View All →
                </Link>
              </div>
              <div className="dp-recent-list">
                {kpiLoading ? (
                  <div
                    className="dp-schedule-skeleton"
                    role="status"
                    aria-label="Loading today’s schedule"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="dp-recent-item dp-recent-item--skeleton"
                      >
                        <span className="dp-skeleton dp-skel-time" />
                        <div className="dp-skel-schedule-info">
                          <span className="dp-skeleton dp-skel-line" />
                          <span className="dp-skeleton dp-skel-line dp-skel-line--short" />
                        </div>
                        <span className="dp-skeleton dp-skel-badge" />
                      </div>
                    ))}
                  </div>
                ) : todaySchedule.length === 0 ? (
                  <p className="dp-subtitle" style={{ padding: "12px 0" }}>
                    No bookings scheduled for today.
                  </p>
                ) : (
                  todaySchedule.map((booking) => {
                    const st =
                      scheduleStatus[booking.status] ||
                      scheduleStatus.confirmed;
                    const email = (
                      booking.clientEmail ||
                      booking.client_email ||
                      ""
                    ).trim();
                    const clientLabel = String(booking.client || "").trim();
                    const showEmail = Boolean(email) && clientLabel !== email;
                    const reqT = String(
                      booking.requestedStartTime || "",
                    ).trim();
                    const heldT = String(booking.time || "").trim();
                    const showRequestedVsHeld = Boolean(reqT) && reqT !== heldT;
                    return (
                      <div key={booking.id} className="dp-recent-item">
                        <div className="dp-recent-time">{booking.time}</div>
                        <div className="dp-recent-info">
                          <span className="dp-recent-service">
                            {booking.service}
                          </span>
                          <span className="dp-recent-client">
                            {clientLabel}
                            {showEmail ? (
                              <>
                                {" "}
                                <span className="dp-recent-client-email">
                                  — {email}
                                </span>
                              </>
                            ) : null}
                          </span>
                          {showRequestedVsHeld ? (
                            <span className="dp-recent-slot-diff">
                              Requested {reqT} · Held {heldT}
                            </span>
                          ) : null}
                        </div>
                        <span
                          className="dp-status"
                          style={{ color: st.color, background: st.bg }}
                        >
                          {st.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* {isTenant && (
            <div className="dp-top-customers-section">
              <div className="dp-recent-header">
                <h3 className="dp-section-heading">Top customers</h3>
                <Link to="/dashboard/customers" className="dp-view-all">
                  Customers →
                </Link>
              </div>
              <p className="dp-top-customers-hint">
                Most bookings across your workspace (cancelled/expired
                excluded). Total ({workspaceCurrency}) is the sum of those
                booking prices.
              </p>
              {kpiLoading ? (
                <div
                  className="dp-top-customers-skeleton"
                  role="status"
                  aria-label="Loading top customers"
                >
                  <div className="dp-top-customers-table-wrap">
                    <table className="dp-top-customers-table">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Email</th>
                          <th scope="col" className="dp-top-customers-num">
                            Reservations
                          </th>
                          <th scope="col" className="dp-top-customers-num">
                            Total ({workspaceCurrency})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <tr
                            key={i}
                            className="dp-top-customers-row--skeleton"
                          >
                            <td>
                              <span className="dp-skeleton dp-skel-cell" />
                            </td>
                            <td>
                              <span className="dp-skeleton dp-skel-cell dp-skel-cell--wide" />
                            </td>
                            <td className="dp-top-customers-num">
                              <span className="dp-skeleton dp-skel-cell dp-skel-cell--num" />
                            </td>
                            <td className="dp-top-customers-num">
                              <span className="dp-skeleton dp-skel-cell dp-skel-cell--num" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : topCustomers.length === 0 ? (
                <p className="dp-subtitle" style={{ padding: "12px 0" }}>
                  No customer bookings yet.
                </p>
              ) : (
                <div className="dp-top-customers-table-wrap">
                  <table className="dp-top-customers-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Email</th>
                        <th scope="col" className="dp-top-customers-num">
                          Reservations
                        </th>
                        <th scope="col" className="dp-top-customers-num">
                          Total ({workspaceCurrency})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCustomers.map((row) => (
                        <tr key={row.id}>
                          <td
                            className="dp-top-customers-name"
                            title={row.name}
                          >
                            {row.name}
                          </td>
                          <td
                            className="dp-top-customers-email"
                            title={row.email || undefined}
                          >
                            {row.email}
                          </td>
                          <td className="dp-top-customers-num">
                            {row.reservationCount}
                          </td>
                          <td className="dp-top-customers-num">
                            {formatMoneyAmount(
                              row.totalSpent,
                              workspaceCurrency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )} */}
        </>
      )}
    </div>
  );
}

function DashboardOverview() {
  const { user } = useOutletContext();
  if (isAdminRole(user?.role)) {
    return <AdminDashboardOverview />;
  }
  return <DashboardOverviewContent />;
}

export default DashboardOverview;
