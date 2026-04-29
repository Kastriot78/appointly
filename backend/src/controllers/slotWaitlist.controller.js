const mongoose = require("mongoose");
const {
  createWaitlistEntry,
  getWaitlistOfferForToken,
} = require("../services/slotWaitlist.service");

const GUEST_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SERVICES_PER_BOOKING = 8;

function parseServiceIdsInput({ serviceIds, serviceId }) {
  let list = [];
  if (Array.isArray(serviceIds)) {
    list = serviceIds;
  } else if (typeof serviceIds === "string" && serviceIds.trim()) {
    list = serviceIds.split(",");
  } else if (serviceId) {
    list = [serviceId];
  }
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (!mongoose.isValidObjectId(s)) return null;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * POST /api/bookings/waitlist — join queue for a fully booked dynamic slot.
 * Body: businessId, serviceId | serviceIds, staffId | any, date, startTime,
 * optional guestName + guestEmail when not signed in.
 */
async function joinSlotWaitlist(req, res) {
  const {
    businessId,
    serviceId,
    serviceIds,
    staffId: staffIdIn,
    date: dateStr,
    startTime,
    guestName,
    guestEmail,
  } = req.body || {};

  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const idList = parseServiceIdsInput({ serviceIds, serviceId });
  if (!idList || idList.length === 0) {
    return res.status(400).json({ message: "Invalid service id" });
  }
  if (idList.length > MAX_SERVICES_PER_BOOKING) {
    return res.status(400).json({
      message: `Too many services selected (max ${MAX_SERVICES_PER_BOOKING}).`,
    });
  }
  const rawStaff =
    staffIdIn == null ? "" : String(staffIdIn).trim().toLowerCase();
  if (!rawStaff || rawStaff === "null" || rawStaff === "undefined") {
    return res.status(400).json({ message: 'staffId is required (or "any")' });
  }

  let email;
  let name;
  let customerId = null;
  if (req.userId && req.user) {
    email = String(req.user.email || "").trim().toLowerCase();
    name = String(req.user.name || "").trim();
    customerId = req.userId;
    if (!email || !GUEST_EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        message: "Your account needs a valid email to join the waitlist.",
      });
    }
    if (!name || name.length < 2) {
      return res.status(400).json({
        message: "Please set your name on your profile before joining the waitlist.",
      });
    }
  } else {
    name = String(guestName || "").trim();
    email = String(guestEmail || "").trim().toLowerCase();
    if (!name || name.length < 2) {
      return res.status(400).json({ message: "Please enter your full name." });
    }
    if (!GUEST_EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email." });
    }
  }

  const result = await createWaitlistEntry({
    businessId,
    idList,
    dateStr: String(dateStr || "").trim(),
    rawStaff: String(staffIdIn || "").trim(),
    startTime: String(startTime || "").trim(),
    email,
    name,
    customerId,
  });

  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }

  return res.status(201).json({
    ok: true,
    alreadyQueued: !!result.alreadyQueued,
    message: result.alreadyQueued
      ? "You’re already on the waitlist for this time."
      : "You’re on the waitlist. If this slot opens up, we’ll email you a link to book it.",
  });
}

/**
 * GET /api/bookings/waitlist-offer/:token — resolve email offer (public).
 */
async function getWaitlistOffer(req, res) {
  const token = String(req.params.token || "").trim();
  if (token.length < 24) {
    return res.status(400).json({ message: "Invalid link." });
  }
  const r = await getWaitlistOfferForToken(token);
  if (!r.ok) {
    return res.status(404).json({
      message: "This link is invalid or has expired. Try booking from the business page.",
    });
  }
  return res.json({ offer: r.offer });
}

module.exports = {
  joinSlotWaitlist,
  getWaitlistOffer,
};
