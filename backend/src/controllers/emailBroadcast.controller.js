const mongoose = require("mongoose");
const EmailBroadcast = require("../models/EmailBroadcast");
const Business = require("../models/Business");
const { canManageBusiness } = require("../utils/businessAccess");
const { getDistinctCustomerRecipientsForBusiness } = require("../utils/businessCustomerEmails");
const { sendCustomerBroadcastEmails } = require("../services/bookingEmail.service");

async function assertBusinessAccess(req, businessId) {
  if (!mongoose.isValidObjectId(businessId)) {
    const err = new Error("Invalid business id");
    err.statusCode = 400;
    throw err;
  }
  const business = await Business.findById(businessId).lean();
  if (!business) {
    const err = new Error("Business not found");
    err.statusCode = 404;
    throw err;
  }
  if (!canManageBusiness(req.user, business)) {
    const err = new Error("Not allowed");
    err.statusCode = 403;
    throw err;
  }
  return business;
}

function mapBroadcast(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  let sentByName = "";
  if (o.sentBy && typeof o.sentBy === "object" && o.sentBy.name) {
    sentByName = String(o.sentBy.name).trim();
  }
  return {
    id: o._id.toString(),
    businessId: String(o.business),
    subject: o.subject,
    description: o.description,
    sentAt: o.sentAt ? new Date(o.sentAt).toISOString() : null,
    recipientCount: o.recipientCount,
    sentByName,
  };
}

/**
 * GET /api/businesses/:id/customer-email-broadcasts
 */
async function listBroadcasts(req, res) {
  const { id } = req.params;
  await assertBusinessAccess(req, id);
  const rows = await EmailBroadcast.find({ business: id })
    .sort({ sentAt: -1 })
    .limit(100)
    .populate("sentBy", "name")
    .lean();
  const broadcasts = rows.map((r) => mapBroadcast(r));
  return res.json({ broadcasts });
}

/**
 * POST /api/businesses/:id/customer-email-broadcasts
 * Body: { subject: string, description: string }
 */
async function sendBroadcast(req, res) {
  const { id } = req.params;
  await assertBusinessAccess(req, id);
  const biz = await Business.findById(id).select("name").lean();
  const businessName = biz?.name?.trim() || "Your business";

  const subjectIn = String(req.body?.subject ?? "").trim();
  const descriptionIn = String(req.body?.description ?? "").trim();
  if (!subjectIn) {
    return res.status(400).json({ message: "Subject is required" });
  }
  if (!descriptionIn) {
    return res.status(400).json({ message: "Description is required" });
  }
  if (subjectIn.length > 300) {
    return res.status(400).json({ message: "Subject is too long" });
  }
  if (descriptionIn.length > 20000) {
    return res.status(400).json({ message: "Description is too long" });
  }

  const recipients = await getDistinctCustomerRecipientsForBusiness(id);
  if (recipients.length === 0) {
    return res.status(400).json({
      message:
        "No customers to email yet — only customers who have booked with this business receive messages.",
    });
  }

  const result = await sendCustomerBroadcastEmails({
    businessName,
    subject: subjectIn,
    description: descriptionIn,
    recipients,
  });

  if (result.delivered === 0 && result.reason === "smtp_not_configured") {
    return res.status(503).json({
      message:
        "Email is not configured on this server (SMTP). Contact your administrator.",
    });
  }

  if (result.delivered === 0) {
    return res.status(500).json({
      message:
        "No emails were delivered. Check SMTP settings or try again later.",
      failed: result.failed,
    });
  }

  const doc = await EmailBroadcast.create({
    business: id,
    subject: subjectIn,
    description: descriptionIn,
    recipientCount: result.delivered,
    sentBy: req.user._id,
    sentAt: new Date(),
  });

  await doc.populate("sentBy", "name");

  return res.status(201).json({
    broadcast: mapBroadcast(doc),
    delivered: result.delivered,
    failed: result.failed,
  });
}

module.exports = {
  listBroadcasts,
  sendBroadcast,
};
