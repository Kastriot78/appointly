/** List businesses: owners, staff, or platform admin (approvals / full list). */
function requireTenantStaffOrAdmin(req, res, next) {
  const r = req.user?.role;
  if (r !== "tenant" && r !== "staff" && r !== "admin") {
    return res.status(403).json({ message: "Not allowed." });
  }
  next();
}

module.exports = requireTenantStaffOrAdmin;
