import { http } from "./http";

/**
 * Demo checkout: sets subscription plan + billing on the tenant (no real payment).
 * @param {{ planId: string, billing: "monthly" | "yearly" }} body
 */
export function demoCheckout(body) {
  return http.post("/api/subscription/demo-checkout", body);
}
