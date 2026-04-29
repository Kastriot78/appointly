const ContactMessage = require("../models/ContactMessage");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase();
}

function trimStr(raw, max) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (max != null && s.length > max) return s.slice(0, max);
  return s;
}

/**
 * POST /api/contact/messages — public; saves a contact form submission.
 * Body: { name, email, subject, message }
 */
async function submitMessage(req, res) {
  const name = trimStr(req.body?.name, 200);
  const email = normalizeEmail(req.body?.email);
  const subject = trimStr(req.body?.subject, 300);
  const message = trimStr(req.body?.message, 10000);

  if (!name) {
    return res.status(400).json({ message: "Name is required." });
  }
  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return res
      .status(400)
      .json({ message: "Please enter a valid email address." });
  }
  if (!subject) {
    return res.status(400).json({ message: "Subject is required." });
  }
  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  const doc = await ContactMessage.create({
    name,
    email,
    subject,
    message,
  });

  return res.status(201).json({
    ok: true,
    id: doc._id.toString(),
    message: "Thanks — we'll get back to you soon.",
  });
}

const LIST_CAP = 2000;

/**
 * GET /api/contact/messages — admin only.
 */
async function listMessages(req, res) {
  const total = await ContactMessage.countDocuments({});
  const rows = await ContactMessage.find({})
    .sort({ createdAt: -1 })
    .limit(LIST_CAP)
    .lean();

  const messages = rows.map((r) => ({
    id: r._id.toString(),
    name: r.name,
    email: r.email,
    subject: r.subject,
    message: r.message,
    createdAt: r.createdAt,
  }));

  return res.json({
    messages,
    total,
    capped: total > LIST_CAP,
  });
}

module.exports = { submitMessage, listMessages };
