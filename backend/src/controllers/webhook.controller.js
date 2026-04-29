const mongoose = require("mongoose");
const Business = require("../models/Business");
const WebhookEndpoint = require("../models/WebhookEndpoint");
const { canManageBusiness } = require("../utils/businessAccess");
const { WEBHOOK_EVENTS } = require("../models/WebhookEndpoint");
const {
  randomSecret,
  sendTestWebhookToEndpoint,
} = require("../services/webhook.service");
const { assertBusinessFeature } = require("../utils/subscriptionEnforcement");

function normalizeEvents(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const ev = String(raw || "").trim();
    if (!WEBHOOK_EVENTS.includes(ev)) return null;
    if (seen.has(ev)) continue;
    seen.add(ev);
    out.push(ev);
  }
  return out.length ? out : null;
}

function isValidWebhookUrl(urlRaw) {
  try {
    const u = new URL(String(urlRaw || "").trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

async function createWebhook(req, res) {
  const { businessId, url, description, events } = req.body || {};
  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  if (!isValidWebhookUrl(url)) {
    return res
      .status(400)
      .json({ message: "Webhook URL must be a valid HTTPS URL." });
  }

  const business = await Business.findById(businessId);
  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to manage this business" });
  }
  await assertBusinessFeature(req, businessId, "webhooks");

  const eventList =
    events == null ? [...WEBHOOK_EVENTS] : normalizeEvents(events);
  if (!eventList) {
    return res.status(400).json({
      message: `Invalid events. Allowed: ${WEBHOOK_EVENTS.join(", ")}`,
    });
  }

  const secret = randomSecret();
  const endpoint = await WebhookEndpoint.create({
    business: business._id,
    url: String(url).trim(),
    description: String(description || "")
      .trim()
      .slice(0, 300),
    events: eventList,
    secret,
    isActive: true,
  });

  return res.status(201).json({
    endpoint: endpoint.toJSON(),
    signingSecret: secret,
    note: "Store this secret now. It is shown only once.",
  });
}

async function listWebhooks(req, res) {
  const { businessId } = req.query;
  if (!mongoose.isValidObjectId(businessId)) {
    return res.status(400).json({ message: "businessId is required" });
  }
  const business = await Business.findById(businessId);
  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to manage this business" });
  }
  await assertBusinessFeature(req, businessId, "webhooks");
  const endpoints = await WebhookEndpoint.find({ business: business._id })
    .sort({ createdAt: -1 })
    .lean();
  return res.json({
    endpoints: endpoints.map((x) => {
      const out = { ...x, id: String(x._id) };
      delete out._id;
      delete out.__v;
      delete out.secret;
      return out;
    }),
    availableEvents: WEBHOOK_EVENTS,
  });
}

async function updateWebhook(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid webhook id" });
  }
  const endpoint = await WebhookEndpoint.findById(id);
  if (!endpoint) return res.status(404).json({ message: "Webhook not found" });

  const business = await Business.findById(endpoint.business);
  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to manage this business" });
  }
  await assertBusinessFeature(req, String(endpoint.business), "webhooks");

  const { url, description, events, isActive } = req.body || {};
  if (url != null) {
    if (!isValidWebhookUrl(url)) {
      return res
        .status(400)
        .json({ message: "Webhook URL must be a valid HTTPS URL." });
    }
    endpoint.url = String(url).trim();
  }
  if (description != null) {
    endpoint.description = String(description).trim().slice(0, 300);
  }
  if (events != null) {
    const eventList = normalizeEvents(events);
    if (!eventList) {
      return res.status(400).json({
        message: `Invalid events. Allowed: ${WEBHOOK_EVENTS.join(", ")}`,
      });
    }
    endpoint.events = eventList;
  }
  if (isActive != null) {
    endpoint.isActive = Boolean(isActive);
  }

  await endpoint.save();
  return res.json({ endpoint: endpoint.toJSON() });
}

async function rotateWebhookSecret(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid webhook id" });
  }
  const endpoint = await WebhookEndpoint.findById(id);
  if (!endpoint) return res.status(404).json({ message: "Webhook not found" });

  const business = await Business.findById(endpoint.business);
  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to manage this business" });
  }
  await assertBusinessFeature(req, String(endpoint.business), "webhooks");

  const secret = randomSecret();
  endpoint.secret = secret;
  await endpoint.save();
  return res.json({
    endpoint: endpoint.toJSON(),
    signingSecret: secret,
    note: "Store this secret now. It is shown only once.",
  });
}

async function deleteWebhook(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid webhook id" });
  }
  const endpoint = await WebhookEndpoint.findById(id);
  if (!endpoint) return res.status(404).json({ message: "Webhook not found" });

  const business = await Business.findById(endpoint.business);
  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to manage this business" });
  }
  await assertBusinessFeature(req, String(endpoint.business), "webhooks");

  await WebhookEndpoint.deleteOne({ _id: endpoint._id });
  return res.json({ ok: true });
}

async function testWebhook(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid webhook id" });
  }
  const endpoint = await WebhookEndpoint.findById(id);
  if (!endpoint) return res.status(404).json({ message: "Webhook not found" });

  const business = await Business.findById(endpoint.business);
  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed to manage this business" });
  }
  await assertBusinessFeature(req, String(endpoint.business), "webhooks");
  if (!endpoint.isActive) {
    return res.status(400).json({ message: "Webhook is inactive. Enable it first." });
  }

  await sendTestWebhookToEndpoint(endpoint, {
    endpointId: String(endpoint._id),
    businessId: String(endpoint.business),
  });
  const updated = await WebhookEndpoint.findById(endpoint._id);
  return res.json({
    ok: true,
    endpoint: updated ? updated.toJSON() : endpoint.toJSON(),
  });
}

module.exports = {
  createWebhook,
  listWebhooks,
  updateWebhook,
  rotateWebhookSecret,
  deleteWebhook,
  testWebhook,
};
