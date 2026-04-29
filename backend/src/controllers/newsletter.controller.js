const NewsletterSubscription = require("../models/NewsletterSubscription");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase();
}

/**
 * POST /api/newsletter/subscribe — public; saves email for marketing updates.
 * Body: { email: string, source?: string }
 */
async function subscribe(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  const source =
    typeof req.body?.source === "string"
      ? req.body.source.trim().slice(0, 64) || "footer"
      : "footer";

  const existing = await NewsletterSubscription.findOne({ email }).lean();
  if (existing) {
    return res.status(200).json({
      ok: true,
      alreadySubscribed: true,
      message: "You're already on the list.",
    });
  }

  await NewsletterSubscription.create({ email, source });
  return res.status(201).json({
    ok: true,
    alreadySubscribed: false,
    message: "Thanks for subscribing.",
  });
}

const LIST_CAP = 5000;

/**
 * GET /api/newsletter/subscribers — admin only; lists saved newsletter emails.
 */
async function listSubscribers(req, res) {
  const total = await NewsletterSubscription.countDocuments({});
  const rows = await NewsletterSubscription.find({})
    .sort({ createdAt: -1 })
    .limit(LIST_CAP)
    .lean();

  const subscribers = rows.map((r) => ({
    id: r._id.toString(),
    email: r.email,
    source: r.source || "footer",
    createdAt: r.createdAt,
  }));

  return res.json({
    subscribers,
    total,
    capped: total > LIST_CAP,
  });
}

module.exports = { subscribe, listSubscribers };
