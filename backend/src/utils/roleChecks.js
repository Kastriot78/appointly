function normalizeRole(role) {
  if (role == null || role === "") return "";
  return String(role).toLowerCase();
}

function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}

function isStaffRole(role) {
  return normalizeRole(role) === "staff";
}

function isTenantRole(role) {
  return normalizeRole(role) === "tenant";
}

module.exports = { normalizeRole, isAdminRole, isStaffRole, isTenantRole };
