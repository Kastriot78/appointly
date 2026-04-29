import { http } from "./http";

/** Revenue + booking-count time series; `granularity` is `day|week|month`. */
export function getRevenueTrend({ from, to, granularity } = {}) {
  return http.get("/api/analytics/revenue", {
    params: { from, to, granularity },
  });
}

/** 7×24 weekday-by-hour booking heatmap. */
export function getHeatmap({ from, to } = {}) {
  return http.get("/api/analytics/heatmap", { params: { from, to } });
}

/** Ranked services by booking count + revenue. */
export function getServicePopularity({ from, to, limit } = {}) {
  return http.get("/api/analytics/service-popularity", {
    params: { from, to, limit },
  });
}

/** Per-staff utilization %, booked vs available minutes. */
export function getStaffUtilization({ from, to } = {}) {
  return http.get("/api/analytics/staff-utilization", {
    params: { from, to },
  });
}

/** Monthly customer retention cohorts (first booking month × M0..Mn offset %). */
export function getRetentionCohorts({ months } = {}) {
  return http.get("/api/analytics/retention-cohorts", { params: { months } });
}
