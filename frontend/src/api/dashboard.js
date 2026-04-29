import { http } from "./http";

/**
 * Dashboard overview KPIs — tenant/admin workspace metrics or customer summary (`scope` in JSON).
 * @param {{ staffUtilDate?: string }} [params] — optional `YYYY-MM-DD` for staff utilization (UTC calendar day).
 */
export function getDashboardOverview(params) {
  const p = params && typeof params === "object" ? params : {};
  return http.get("/api/dashboard/overview", { params: p });
}
