const { normalizeRole } = require("../utils/roleChecks");

/** Tenant or linked staff — managed bookings (not platform admin). */
function requireTenantAdminOrStaff(req, res, next) {
  const r = normalizeRole(req.user?.role);
  if (r !== "tenant" && r !== "staff") {
    return res.status(403).json({
      message:
        "Managed bookings require a business owner or staff account.",
    });
  }
  next();
}

module.exports = requireTenantAdminOrStaff;
