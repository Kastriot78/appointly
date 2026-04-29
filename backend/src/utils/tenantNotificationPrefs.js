const User = require("../models/User");

const DEFAULT_TENANT_NOTIFICATION_PREFS = {
  newBooking: true,
  bookingCancelled: true,
  newReview: true,
  dailySummary: false,
  weeklyReport: false,
};

const PREFS_KEYS = Object.keys(DEFAULT_TENANT_NOTIFICATION_PREFS);

/**
 * @param {object} body
 * @returns {Record<string, boolean>}
 */
function normalizeTenantNotificationPrefsPatch(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const k of PREFS_KEYS) {
    if (body[k] !== undefined) out[k] = Boolean(body[k]);
  }
  return out;
}

/**
 * @param {object} business — lean or hydrated doc with optional tenantNotificationPrefs
 * @param {"newBooking"|"bookingCancelled"|"newReview"|"dailySummary"|"weeklyReport"} key
 */
function isTenantNotificationEnabled(business, key) {
  const fallback = DEFAULT_TENANT_NOTIFICATION_PREFS[key];
  const p = business?.tenantNotificationPrefs;
  if (!p || typeof p !== "object") return Boolean(fallback);
  if (p[key] === undefined) return Boolean(fallback);
  return Boolean(p[key]);
}

/**
 * Business profile email, or owner account email.
 * @param {object} business — needs email and/or owner
 */
async function resolveBusinessNotifyEmail(business) {
  const direct = business?.email && String(business.email).trim();
  if (direct) return direct;
  const ownerId = business?.owner;
  if (!ownerId) return null;
  const owner = await User.findById(ownerId).select("email").lean();
  return (owner?.email && String(owner.email).trim()) || null;
}

module.exports = {
  DEFAULT_TENANT_NOTIFICATION_PREFS,
  normalizeTenantNotificationPrefsPatch,
  isTenantNotificationEnabled,
  resolveBusinessNotifyEmail,
};
