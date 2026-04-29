const mongoose = require("mongoose");
const { isAdminRole, normalizeRole, isStaffRole } = require("./roleChecks");
const Staff = require("../models/Staff");

function canManageBusiness(user, business) {
  if (!user || !business) return false;
  if (isStaffRole(user.role)) return false;
  if (isAdminRole(user.role)) return true;
  const ownerId = business.owner?.toString?.() ?? String(business.owner);
  return ownerId === user._id.toString();
}

/**
 * Staff may read a single business dashboard when it matches their assignment.
 */
async function staffCanViewBusiness(user, businessId) {
  if (!user || !businessId || !isStaffRole(user.role)) return false;
  if (!user.staffProfile) return false;
  const bid = mongoose.isValidObjectId(businessId)
    ? new mongoose.Types.ObjectId(businessId)
    : null;
  if (!bid) return false;
  const st = await Staff.findById(user.staffProfile)
    .select("business linkedUser")
    .lean();
  if (!st || !st.linkedUser || String(st.linkedUser) !== String(user._id)) {
    return false;
  }
  return String(st.business) === String(bid);
}

/**
 * Tenant/admin ownership OR staff assigned to this business.
 */
async function canAccessBusinessRead(user, business) {
  if (!user || !business) return false;
  if (canManageBusiness(user, business)) return true;
  return staffCanViewBusiness(user, business._id);
}

module.exports = {
  canManageBusiness,
  staffCanViewBusiness,
  canAccessBusinessRead,
};
