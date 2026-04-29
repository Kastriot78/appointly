import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, Navigate, useLocation, useOutletContext } from "react-router-dom";
import {
  HiOutlineCalendar,
  HiOutlineCurrencyEuro,
  HiOutlineUsers,
  HiOutlineTrendingUp,
  HiOutlineClock,
  HiOutlineChartBar,
  HiOutlineUserGroup,
  HiOutlineRefresh,
} from "react-icons/hi";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  getRevenueTrend,
  getHeatmap,
  getServicePopularity,
  getStaffUtilization,
  getRetentionCohorts,
} from "../../api/analytics";
import { getApiErrorMessage } from "../../api/auth";
import { formatMoneyCompact, normalizeCurrency } from "../../utils/currency";
import { isAdminRole } from "../../utils/roles";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import "./dashboard-pages.css";
import "./analytics-pro.css";

/** Preset ranges — keep them short so the chart stays readable. */
const RANGES = [
  { id: "7d", label: "7 days", days: 7, granularity: "day" },
  { id: "30d", label: "30 days", days: 30, granularity: "day" },
  { id: "90d", label: "90 days", days: 90, granularity: "week" },
  { id: "12m", label: "12 months", days: 365, granularity: "month" },
];

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function rangeParams(rangeId) {
  const r = RANGES.find((x) => x.id === rangeId) || RANGES[1];
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - r.days);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    granularity: r.granularity,
  };
}

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function formatBucket(iso, granularity) {
  if (!iso) return "";
  const d = new Date(iso);
  if (granularity === "month") {
    return d.toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
  }
  if (granularity === "week") {
    return `Wk ${d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Heatmap cell colour — deeper indigo = busier. Light cells stay readable. */
function heatColor(count, max) {
  if (!max || !count) return "var(--app-surface-3)";
  const ratio = Math.min(1, count / max);
  const alpha = 0.14 + ratio * 0.76;
  return `rgba(99, 102, 241, ${alpha.toFixed(2)})`;
}

function cohortColor(pct) {
  if (pct == null) return "transparent";
  const ratio = Math.min(1, pct / 100);
  const alpha = 0.08 + ratio * 0.82;
  return `rgba(99, 102, 241, ${alpha.toFixed(2)})`;
}

const Analytics = () => {
  const { user } = useOutletContext();
  const location = useLocation();
  const limits = user?.subscription?.limits;
  const subAdmin = Boolean(user?.subscription?.isAdmin);
  const canViewAnalytics =
    subAdmin || isAdminRole(user?.role) || Boolean(limits?.analytics);
  const fetchCohorts =
    subAdmin ||
    isAdminRole(user?.role) ||
    Boolean(limits?.advancedAnalytics);

  const [rangeId, setRangeId] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [services, setServices] = useState(null);
  const [utilization, setUtilization] = useState(null);
  const [cohorts, setCohorts] = useState(null);

  const load = useCallback(async () => {
    if (!canViewAnalytics) return;
    setLoading(true);
    setError(null);
    const params = rangeParams(rangeId);
    try {
      const cohortReq = fetchCohorts
        ? getRetentionCohorts({ months: 6 })
        : Promise.resolve({ data: null });
      const [r, h, s, u, c] = await Promise.all([
        getRevenueTrend(params),
        getHeatmap(params),
        getServicePopularity({ ...params, limit: 10 }),
        getStaffUtilization(params),
        cohortReq,
      ]);
      setRevenue(r.data);
      setHeatmap(h.data);
      setServices(s.data);
      setUtilization(u.data);
      setCohorts(c.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [
    rangeId,
    canViewAnalytics,
    fetchCohorts,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const currency = normalizeCurrency(
    revenue?.currency || services?.currency || "EUR",
  );

  const kpis = useMemo(() => {
    if (!revenue) return [];
    return [
      {
        label: "Revenue",
        value: formatMoneyCompact(revenue.totals.revenue, currency),
        change: formatPct(revenue.changePct.revenue),
        up: (revenue.changePct.revenue ?? 0) >= 0,
        icon: <HiOutlineCurrencyEuro size={20} />,
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.12)",
      },
      {
        label: "Bookings",
        value: String(revenue.totals.bookings),
        change: formatPct(revenue.changePct.bookings),
        up: (revenue.changePct.bookings ?? 0) >= 0,
        icon: <HiOutlineCalendar size={20} />,
        color: "#4f46e5",
        bg: "rgba(79, 70, 229, 0.12)",
      },
      {
        label: "Completed",
        value: String(revenue.totals.completedBookings),
        sub: formatMoneyCompact(revenue.totals.completedRevenue, currency),
        icon: <HiOutlineTrendingUp size={20} />,
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.12)",
      },
      {
        label: "Avg / booking",
        value:
          revenue.totals.bookings > 0
            ? formatMoneyCompact(
                revenue.totals.revenue / revenue.totals.bookings,
                currency,
              )
            : formatMoneyCompact(0, currency),
        icon: <HiOutlineUsers size={20} />,
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.12)",
      },
    ];
  }, [revenue, currency]);

  const revenueChartData = useMemo(() => {
    if (!revenue?.series?.length) return [];
    return revenue.series.map((r) => ({
      ...r,
      label: formatBucket(r.bucket, revenue.granularity),
    }));
  }, [revenue]);

  const serviceBarData = useMemo(() => {
    if (!services?.services?.length) return [];
    return services.services.map((s) => ({
      name: s.name,
      bookings: s.bookings,
      revenue: s.revenue,
    }));
  }, [services]);

  if (!canViewAnalytics) {
    return (
      <Navigate
        to="/pricing"
        replace
        state={{
          upgradeFeature: "analytics",
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  return (
    <div className="dp-page dt-analytics">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Analytics</h1>
          <p className="dp-subtitle">
            Revenue trends, peak hours, service popularity, staff utilization &
            retention.
          </p>
        </div>
        <div className="ana-controls">
          <div className="dt-period-toggle ana-range-toggle">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`dt-period-btn ${
                  rangeId === r.id ? "active" : ""
                }`}
                onClick={() => setRangeId(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ana-refresh-btn"
            onClick={load}
            disabled={loading}
            aria-label="Refresh analytics"
            title="Refresh"
          >
            <HiOutlineRefresh size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {error ? (
        <DashboardErrorPanel message={error} onRetry={load} />
      ) : (
        <>
          {/* KPI header */}
          <div className="dp-stats-grid">
            {(loading && !revenue ? Array.from({ length: 4 }) : kpis).map(
              (stat, i) => (
                <div key={i} className="dp-overview-stat">
                  {stat ? (
                    <>
                      <div
                        className="dp-overview-icon"
                        style={{ background: stat.bg, color: stat.color }}
                      >
                        {stat.icon}
                      </div>
                      <div className="dp-overview-info">
                        <div className="dt-stat-row">
                          <span
                            className="dp-overview-value"
                            style={{ color: stat.color }}
                          >
                            {stat.value}
                          </span>
                          {stat.change ? (
                            <span
                              className={`dt-change ${stat.up ? "up" : ""}`}
                            >
                              <HiOutlineTrendingUp size={12} /> {stat.change}
                            </span>
                          ) : stat.sub ? (
                            <span className="dt-change">{stat.sub}</span>
                          ) : null}
                        </div>
                        <span className="dp-overview-label">{stat.label}</span>
                      </div>
                    </>
                  ) : (
                    <div className="ana-skeleton ana-skeleton--stat" />
                  )}
                </div>
              ),
            )}
          </div>

          {/* Revenue trend */}
          <div className="dt-analytics-card ana-card-full">
            <div className="ana-card-header">
              <h3>
                <HiOutlineChartBar size={18} /> Revenue trend
              </h3>
              <span className="ana-card-sub">
                {revenue?.granularity === "month"
                  ? "Monthly"
                  : revenue?.granularity === "week"
                    ? "Weekly"
                    : "Daily"}{" "}
                · all non-cancelled bookings
              </span>
            </div>
            <div className="ana-chart-wrap">
              {revenueChartData.length === 0 ? (
                <div className="ana-empty">
                  {loading ? "Loading…" : "No bookings in this range yet."}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={revenueChartData}
                    margin={{ top: 10, right: 18, bottom: 0, left: -8 }}
                  >
                    <defs>
                      <linearGradient id="anaRev" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.45}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--app-border)"
                      strokeDasharray="3 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="var(--app-text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--app-border)" }}
                    />
                    <YAxis
                      stroke="var(--app-text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatMoneyCompact(v, currency)}
                      width={72}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--app-surface)",
                        border: "1px solid var(--app-border)",
                        borderRadius: 10,
                        color: "var(--app-text-heading)",
                        boxShadow: "var(--app-shadow-md)",
                      }}
                      labelStyle={{ color: "var(--app-text-heading)" }}
                      formatter={(value, name) => {
                        if (name === "revenue")
                          return [
                            formatMoneyCompact(value, currency),
                            "Revenue",
                          ];
                        return [value, "Bookings"];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#6366f1"
                      fill="url(#anaRev)"
                      strokeWidth={2.2}
                    />
                    <Area
                      type="monotone"
                      dataKey="bookings"
                      stroke="#10b981"
                      fill="transparent"
                      strokeWidth={1.6}
                      strokeDasharray="4 4"
                      hide
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="dt-analytics-grid">
            {/* Service popularity */}
            <div className="dt-analytics-card">
              <div className="ana-card-header">
                <h3>
                  <HiOutlineChartBar size={18} /> Service popularity
                </h3>
                <span className="ana-card-sub">By bookings</span>
              </div>
              <div className="ana-chart-wrap ana-chart-wrap--short">
                {serviceBarData.length === 0 ? (
                  <div className="ana-empty">
                    {loading ? "Loading…" : "No services yet."}
                  </div>
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(240, serviceBarData.length * 36 + 40)}
                  >
                    <BarChart
                      data={serviceBarData}
                      layout="vertical"
                      margin={{ top: 10, right: 28, bottom: 0, left: 10 }}
                    >
                      <CartesianGrid
                        stroke="var(--app-border)"
                        strokeDasharray="3 4"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="var(--app-text-muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: "var(--app-border)" }}
                        allowDecimals={false}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="var(--app-text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        width={130}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--app-surface-2)" }}
                        contentStyle={{
                          background: "var(--app-surface)",
                          border: "1px solid var(--app-border)",
                          borderRadius: 10,
                          color: "var(--app-text-heading)",
                          boxShadow: "var(--app-shadow-md)",
                        }}
                        formatter={(value, _name, ctx) => {
                          const revenueVal = ctx?.payload?.revenue || 0;
                          return [
                            `${value} · ${formatMoneyCompact(
                              revenueVal,
                              currency,
                            )}`,
                            "Bookings",
                          ];
                        }}
                      />
                      <Bar dataKey="bookings" radius={[0, 6, 6, 0]}>
                        {serviceBarData.map((_e, idx) => (
                          <Cell
                            key={idx}
                            fill={idx === 0 ? "#4f46e5" : "#818cf8"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Staff utilization */}
            <div className="dt-analytics-card">
              <div className="ana-card-header">
                <h3>
                  <HiOutlineUserGroup size={18} /> Staff utilization
                </h3>
                <span className="ana-card-sub">Booked / available hours</span>
              </div>
              <div className="ana-util-list">
                {(!utilization?.staff || utilization.staff.length === 0) && (
                  <div className="ana-empty">
                    {loading ? "Loading…" : "No active staff."}
                  </div>
                )}
                {utilization?.staff?.map((s) => {
                  const pct = s.utilization;
                  const pctNum = pct == null ? 0 : Math.min(100, pct);
                  const hoursBooked = Math.round((s.bookedMinutes / 60) * 10) / 10;
                  const hoursAvail =
                    Math.round((s.availableMinutes / 60) * 10) / 10;
                  return (
                    <div key={s.id} className="ana-util-item">
                      <div className="ana-util-head">
                        <div className="ana-util-name-wrap">
                          {s.avatar ? (
                            <img
                              src={s.avatar}
                              alt={s.name}
                              className="ana-util-avatar"
                            />
                          ) : (
                            <div className="ana-util-avatar ana-util-avatar--ph">
                              {s.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div>
                            <div className="ana-util-name">{s.name}</div>
                            <div className="ana-util-meta">
                              {hoursBooked}h / {hoursAvail}h · {s.bookings}{" "}
                              bookings
                            </div>
                          </div>
                        </div>
                        <div className="ana-util-pct">
                          {pct == null ? "—" : `${pct}%`}
                        </div>
                      </div>
                      <div className="ana-util-bar-bg">
                        <div
                          className="ana-util-bar"
                          style={{ width: `${pctNum}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Busiest hours heatmap */}
          <div className="dt-analytics-card ana-card-full">
            <div className="ana-card-header">
              <h3>
                <HiOutlineClock size={18} /> Busiest hours
              </h3>
              <span className="ana-card-sub">
                Bookings by weekday × hour
              </span>
            </div>
            {!heatmap || heatmap.maxCount === 0 ? (
              <div className="ana-empty">
                {loading ? "Loading…" : "No bookings in this range."}
              </div>
            ) : (
              <div className="ana-heatmap-wrap">
                <div className="ana-heatmap-hours" aria-hidden="true">
                  <div className="ana-heatmap-corner" />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="ana-heatmap-hour-label">
                      {h % 3 === 0 ? `${h.toString().padStart(2, "0")}` : ""}
                    </div>
                  ))}
                </div>
                {heatmap.days.map((row, i) => (
                  <div key={row.dow} className="ana-heatmap-row">
                    <div className="ana-heatmap-day">{SHORT_DAYS[i]}</div>
                    {row.hours.map((cell) => (
                      <div
                        key={cell.hour}
                        className="ana-heatmap-cell"
                        style={{
                          background: heatColor(cell.count, heatmap.maxCount),
                        }}
                        title={`${row.day} ${String(cell.hour).padStart(
                          2,
                          "0",
                        )}:00 — ${cell.count} booking${
                          cell.count === 1 ? "" : "s"
                        }`}
                      />
                    ))}
                  </div>
                ))}
                <div className="ana-heatmap-legend">
                  <span>Fewer</span>
                  {[0.15, 0.3, 0.5, 0.7, 0.9].map((a) => (
                    <span
                      key={a}
                      className="ana-heatmap-legend-cell"
                      style={{ background: `rgba(99, 102, 241, ${a})` }}
                    />
                  ))}
                  <span>Busier</span>
                </div>
              </div>
            )}
          </div>

          {/* Retention cohort */}
          <div className="dt-analytics-card ana-card-full">
            <div className="ana-card-header">
              <h3>
                <HiOutlineUsers size={18} /> Customer retention cohorts
              </h3>
              <span className="ana-card-sub">
                % of customers from their first-booking month who returned
              </span>
            </div>
            {!fetchCohorts ? (
              <div className="ana-empty ana-empty--column">
                <p style={{ margin: 0, maxWidth: 420 }}>
                  Retention cohorts are part of{" "}
                  <strong>Enterprise</strong>. Upgrade to see month-over-month
                  return rates.
                </p>
                <Link
                  to="/pricing"
                  className="dp-btn-primary"
                  style={{ marginTop: 14 }}
                >
                  View Enterprise
                </Link>
              </div>
            ) : !cohorts?.cohorts?.length ||
              cohorts.cohorts.every((c) => c.total === 0) ? (
              <div className="ana-empty">
                {loading ? "Loading…" : "Not enough data yet."}
              </div>
            ) : (
              <div className="ana-cohort-wrap">
                <table className="ana-cohort-table">
                  <thead>
                    <tr>
                      <th className="ana-cohort-th-cohort">Cohort</th>
                      <th className="ana-cohort-th-size">New</th>
                      {cohorts.offsetLabels.map((o) => (
                        <th key={o}>{o}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.cohorts.map((c) => (
                      <tr key={c.cohort}>
                        <td className="ana-cohort-label">{c.cohort}</td>
                        <td className="ana-cohort-size">{c.total}</td>
                        {c.cells.map((cell, i) => (
                          <td
                            key={i}
                            className="ana-cohort-cell"
                            style={{
                              background: cohortColor(cell.pct),
                              color:
                                cell.pct != null && cell.pct >= 50
                                  ? "#fff"
                                  : "var(--app-text-heading)",
                            }}
                          >
                            {cell.pct == null ? "—" : `${cell.pct}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
