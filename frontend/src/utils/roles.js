/** Normalize role from API / storage (case-insensitive). */
export function normalizeRole(role) {
  if (role == null || role === "") return "";
  return String(role).toLowerCase();
}

/**
 * Legacy: `tenant` or `admin` (both used the same dashboard shell).
 * Prefer `isTenantAccount` or `canAccessMyBusinessesNav` for feature gates.
 */
export function isTenantRole(role) {
  const r = normalizeRole(role);
  return r === "tenant" || r === "admin";
}

/** Business owner account — not staff, customer, or platform admin. */
export function isTenantAccount(role) {
  return normalizeRole(role) === "tenant";
}

export function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}

/** Booking-only users — no business-owner sidebar items (e.g. My Businesses). */
export function isCustomerRole(role) {
  return normalizeRole(role) === "customer";
}

/** Staff — linked to a Staff profile; limited dashboard (own schedule). */
export function isStaffRole(role) {
  return normalizeRole(role) === "staff";
}

/**
 * Hub routes (services, staff, coupons, etc.) for business operators only —
 * tenant owners and linked staff. Platform admins must use a tenant account.
 */
export function canAccessMyBusinessesNav(role) {
  const r = normalizeRole(role);
  return r === "tenant" || r === "staff";
}

export function dashboardRoleLabel(user) {
  if (!user) return "";
  const r = normalizeRole(user.role);
  if (r === "tenant") {
    const b = user.businessName?.trim();
    return b || "Business";
  }
  if (r === "admin") return "Admin";
  if (r === "staff") return "Staff";
  return "Customer";
}
