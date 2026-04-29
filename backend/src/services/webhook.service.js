const crypto = require("crypto");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const WebhookEndpoint = require("../models/WebhookEndpoint");

function randomSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function signPayload(secret, timestamp, payloadText) {
  const signed = `${timestamp}.${payloadText}`;
  const digest = crypto
    .createHmac("sha256", String(secret || ""))
    .update(signed)
    .digest("hex");
  return `v1=${digest}`;
}

function sanitizeTextError(raw, fallback) {
  const txt = String(raw || fallback || "").trim();
  if (!txt) return "";
  return txt.length > 1900 ? `${txt.slice(0, 1900)}...` : txt;
}

async function loadBookingWebhookPayload(bookingId) {
  if (!mongoose.isValidObjectId(bookingId)) return null;
  const row = await Booking.findById(bookingId)
    .populate("business", "name")
    .populate("service", "name")
    .populate("staff", "name")
    .populate("customer", "name email phone")
    .lean();
  if (!row) return null;
  return {
    bookingId: String(row._id),
    status: row.status,
    business: {
      id: row.business?._id ? String(row.business._id) : String(row.business),
      name: row.business?.name || "",
    },
    service: {
      id: row.service?._id ? String(row.service._id) : String(row.service),
      name: row.service?.name || "",
    },
    staff: {
      id: row.staff?._id ? String(row.staff._id) : String(row.staff),
      name: row.staff?.name || "",
    },
    customer: {
      id: row.customer?._id ? String(row.customer._id) : String(row.customer),
      name: row.customer?.name || "",
      email: row.customer?.email || "",
      phone: row.customer?.phone || "",
    },
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration,
    price: row.price,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function deliverToEndpoint({ endpoint, event, payload }) {
  const deliveryId = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyText = JSON.stringify({
    id: deliveryId,
    type: event,
    created: new Date().toISOString(),
    data: payload,
  });
  const signature = signPayload(endpoint.secret, timestamp, bodyText);
  const now = new Date();
  let ok = false;
  let statusCode = null;
  let errText = "";

  try {
    if (typeof fetch !== "function") {
      throw new Error("Global fetch is unavailable in this Node runtime.");
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const resp = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "appointly-webhooks/1.0",
          "X-Appointly-Event": event,
          "X-Appointly-Delivery": deliveryId,
          "X-Appointly-Timestamp": String(timestamp),
          "X-Appointly-Signature": signature,
        },
        body: bodyText,
        signal: ac.signal,
      });
      statusCode = resp.status;
      ok = resp.ok;
      if (!ok) {
        errText = sanitizeTextError(
          await resp.text(),
          `HTTP ${resp.status} ${resp.statusText || ""}`.trim(),
        );
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    errText = sanitizeTextError(err?.message, "Webhook delivery failed");
  }

  const update = {
    lastAttemptAt: now,
    lastStatusCode: statusCode,
    lastError: ok ? "" : errText,
    $inc: { totalDeliveries: 1 },
  };
  if (ok) {
    update.lastDeliveredAt = now;
    update.consecutiveFailures = 0;
  } else {
    update.$inc.consecutiveFailures = 1;
  }

  await WebhookEndpoint.updateOne({ _id: endpoint._id }, update);
}

async function emitBookingWebhookEvent(event, bookingId, extra = {}) {
  const payload = await loadBookingWebhookPayload(bookingId);
  if (!payload || !payload.business?.id) return;
  const endpoints = await WebhookEndpoint.find({
    business: payload.business.id,
    isActive: true,
    events: event,
  }).lean();
  if (!endpoints.length) return;

  const mergedPayload = { ...payload, ...extra };
  await Promise.allSettled(
    endpoints.map((ep) =>
      deliverToEndpoint({ endpoint: ep, event, payload: mergedPayload }),
    ),
  );
}

async function sendTestWebhookToEndpoint(endpoint, extra = {}) {
  if (!endpoint) return;
  const payload = {
    test: true,
    message: "This is a test webhook from Appointly.",
    sentAt: new Date().toISOString(),
    ...extra,
  };
  await deliverToEndpoint({
    endpoint,
    event: "webhook.test",
    payload,
  });
}

module.exports = {
  randomSecret,
  emitBookingWebhookEvent,
  sendTestWebhookToEndpoint,
};
