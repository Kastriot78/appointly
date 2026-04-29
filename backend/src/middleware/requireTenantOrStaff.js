/** Tenant or linked staff — not platform admin. */
function requireTenantOrStaff(req, res, next) {
  const r = req.user?.role;
  if (r !== "tenant" && r !== "staff") {
    return res.status(403).json({
      message:
        "This action requires a business owner or staff account. Platform admins cannot modify tenant businesses here.",
    });
  }
  next();
}

module.exports = requireTenantOrStaff;
