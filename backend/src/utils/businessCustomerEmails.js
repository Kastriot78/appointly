const mongoose = require("mongoose");
const Booking = require("../models/Booking");

/**
 * Distinct customers who have booked this business (any non-expired booking),
 * with email for notifications. De-duplicated by email.
 *
 * @param {string} businessId
 * @returns {Promise<Array<{ email: string; name: string }>>}
 */
async function getDistinctCustomerRecipientsForBusiness(businessId) {
  if (!mongoose.isValidObjectId(businessId)) return [];
  const businessOid = new mongoose.Types.ObjectId(businessId);

  const rows = await Booking.aggregate([
    {
      $match: {
        business: businessOid,
        status: { $ne: "expired" },
      },
    },
    { $group: { _id: "$customer" } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDoc",
      },
    },
    { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        email: { $ifNull: ["$userDoc.email", ""] },
        name: { $ifNull: ["$userDoc.name", ""] },
      },
    },
  ]);

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const em = String(r.email || "")
      .trim()
      .toLowerCase();
    if (!em || seen.has(em)) continue;
    seen.add(em);
    out.push({
      email: em,
      name: String(r.name || "").trim() || "there",
    });
  }
  return out;
}

module.exports = { getDistinctCustomerRecipientsForBusiness };
