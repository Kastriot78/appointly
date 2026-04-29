/** Business owner only (e.g. create a new business). */
function requireTenant(req, res, next) {
  if (req.user?.role !== "tenant") {
    return res.status(403).json({
      message: "This action requires a business owner (tenant) account.",
    });
  }
  next();
}

module.exports = requireTenant;
