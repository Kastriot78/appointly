const crypto = require("crypto");
const mongoose = require("mongoose");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { canManageBusiness } = require("../utils/businessAccess");
const {
  getStaffRankingPreview,
  getStaffRatingFeedbackDetail,
} = require("../services/anyStaffRanking.service");
const { sendStaffDashboardInviteEmail } = require("../services/email.service");
const {
  assertStaffCapacity,
  assertBusinessFeature,
} = require("../utils/subscriptionEnforcement");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Empty string or a valid email; returns `null` if non-empty but invalid. */
function normalizeStaffEmail(raw) {
  const s = raw != null ? String(raw).trim().toLowerCase() : "";
  if (!s) return "";
  if (!EMAIL_REGEX.test(s)) return null;
  return s;
}

/** UTC calendar day start for "now", matching how Booking.date is stored. */
function utcTodayYmd() {
  const now = new Date();
  return {
    y: now.getUTCFullYear(),
    m: now.getUTCMonth() + 1,
    d: now.getUTCDate(),
  };
}

function utcDayStart({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function utcAddDays(date, days) {
  const x = new Date(date);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Monday 00:00 UTC of the week containing `ref` (ISO week-style). */
function utcWeekMondayStart(ref = new Date()) {
  const x = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  const dow = x.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - daysSinceMonday);
  return x;
}

function serializeStaff(doc) {
  const s = doc.toJSON ? doc.toJSON() : doc;
  if (s._id) {
    s.id = s._id.toString();
    delete s._id;
  }
  delete s.__v;
  if (Array.isArray(s.services)) {
    s.services = s.services.map((x) =>
      typeof x === "object" && x !== null && x._id
        ? { id: x._id.toString(), name: x.name }
        : x,
    );
  }
  return s;
}

async function assertCanManageBusinessId(req, businessId) {
  if (!mongoose.isValidObjectId(businessId)) {
    const err = new Error("Invalid business id");
    err.statusCode = 400;
    throw err;
  }
  const business = await Business.findById(businessId);
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

async function validateServiceIdsForBusiness(businessId, ids) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
  const clean = ids.filter((id) => mongoose.isValidObjectId(id));
  if (clean.length !== ids.length) {
    const err = new Error("Invalid service id in list");
    err.statusCode = 400;
    throw err;
  }
  const n = await Service.countDocuments({
    business: businessId,
    _id: { $in: clean },
  });
  if (n !== clean.length) {
    const err = new Error("All services must belong to this business");
    err.statusCode = 400;
    throw err;
  }
  return clean;
}

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STAFF_TIME_OFF_RANGES = 30;

function normalizeTimeOffInput(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw.slice(0, MAX_STAFF_TIME_OFF_RANGES)) {
    if (!r || typeof r !== "object") continue;
    const a = String(r.startsOn ?? "").trim();
    const b = String(r.endsOn ?? "").trim();
    if (!ISO_YMD.test(a) || !ISO_YMD.test(b)) continue;
    if (a > b) continue;
    const note = String(r.note ?? "").trim().slice(0, 200);
    out.push({ startsOn: a, endsOn: b, note });
  }
  return out;
}

function serializeTimeOffForApi(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    startsOn: String(r.startsOn || "").trim(),
    endsOn: String(r.endsOn || "").trim(),
    note: String(r.note || "").trim().slice(0, 200),
  }));
}

function staffDashboardAccessFromRow(m) {
  if (m.linkedUser) return "connected";
  if (
    m.dashboardInviteExpires &&
    new Date(m.dashboardInviteExpires) > new Date()
  ) {
    return "pending";
  }
  return "none";
}

async function listStaff(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);
  const rows = await Staff.find({ business: businessId })
    .populate("services", "name")
    .sort({ createdAt: -1 })
    .select(
      "name role email phone avatar workingDays timeOff isActive services linkedUser dashboardInviteExpires",
    )
    .lean();
  res.json({
    staff: rows.map((m) => ({
      id: m._id.toString(),
      name: m.name,
      role: m.role,
      email: m.email || "",
      phone: m.phone || "",
      avatar: m.avatar || "",
      workingDays: Array.isArray(m.workingDays) ? m.workingDays : [],
      timeOff: serializeTimeOffForApi(m.timeOff),
      isActive: m.isActive !== false,
      dashboardAccess: staffDashboardAccessFromRow(m),
      services: (m.services || []).map((s) => ({
        id: s._id.toString(),
        name: s.name,
      })),
    })),
  });
}

async function createStaff(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);
  await assertStaffCapacity(req, businessId);
  const {
    name,
    role,
    email,
    phone,
    workingDays,
    timeOff: timeOffRaw,
    services: serviceIds,
  } = req.body;
  const n = String(name || "").trim();
  const r = String(role || "").trim();
  if (!n) {
    return res.status(400).json({ message: "Name is required" });
  }
  if (!r) {
    return res.status(400).json({ message: "Role is required" });
  }
  const svcIds = await validateServiceIdsForBusiness(
    businessId,
    serviceIds || [],
  );
  const emailNorm = normalizeStaffEmail(email);
  if (emailNorm === null) {
    return res.status(400).json({
      message: "Enter a valid email address or leave the field empty.",
    });
  }
  const doc = await Staff.create({
    business: businessId,
    name: n,
    role: r,
    email: emailNorm,
    phone: phone != null ? String(phone).trim() : "",
    avatar: "",
    services: svcIds,
    workingDays: Array.isArray(workingDays) ? workingDays : [],
    timeOff: normalizeTimeOffInput(timeOffRaw),
    isActive: true,
  });
  await doc.populate("services", "name");
  return res.status(201).json({ staff: serializeStaff(doc) });
}

async function updateStaff(req, res) {
  const businessId = req.params.id;
  const { staffId } = req.params;
  await assertCanManageBusinessId(req, businessId);
  if (!mongoose.isValidObjectId(staffId)) {
    return res.status(400).json({ message: "Invalid staff id" });
  }
  const member = await Staff.findOne({
    _id: staffId,
    business: businessId,
  });
  if (!member) {
    return res.status(404).json({ message: "Staff member not found" });
  }
  const body = req.body;
  if (body.name !== undefined) member.name = String(body.name).trim() || member.name;
  if (body.role !== undefined) member.role = String(body.role).trim() || member.role;
  if (body.email !== undefined) {
    const emailNorm = normalizeStaffEmail(body.email);
    if (emailNorm === null) {
      return res.status(400).json({
        message: "Enter a valid email address or leave the field empty.",
      });
    }
    if (member.linkedUser) {
      const cur = String(member.email || "").trim().toLowerCase();
      if (emailNorm !== cur) {
        return res.status(400).json({
          message:
            "Cannot change email while this staff member has dashboard access. Remove access first.",
        });
      }
    }
    member.email = emailNorm;
  }
  if (body.phone !== undefined) member.phone = String(body.phone ?? "").trim();
  if (body.avatar !== undefined) member.avatar = String(body.avatar ?? "").trim();
  if (body.workingDays !== undefined) {
    member.workingDays = Array.isArray(body.workingDays) ? body.workingDays : [];
  }
  if (body.timeOff !== undefined) {
    member.timeOff = normalizeTimeOffInput(body.timeOff);
  }
  if (body.services !== undefined) {
    member.services = await validateServiceIdsForBusiness(
      businessId,
      body.services,
    );
  }
  if (body.isActive !== undefined) member.isActive = Boolean(body.isActive);
  await member.save();
  await member.populate("services", "name");
  return res.json({ staff: serializeStaff(member) });
}

async function deleteStaff(req, res) {
  const businessId = req.params.id;
  const { staffId } = req.params;
  await assertCanManageBusinessId(req, businessId);
  if (!mongoose.isValidObjectId(staffId)) {
    return res.status(400).json({ message: "Invalid staff id" });
  }
  const member = await Staff.findOne({
    _id: staffId,
    business: businessId,
  });
  if (!member) {
    return res.status(404).json({ message: "Staff member not found" });
  }
  if (member.linkedUser) {
    return res.status(400).json({
      message:
        "Remove dashboard access for this staff member before deleting their profile.",
    });
  }
  await Staff.findByIdAndDelete(staffId);
  return res.status(204).send();
}

/**
 * POST /api/businesses/:id/staff/:staffId/invite-dashboard
 * Body optional: { email } — updates staff email before sending.
 */
async function inviteStaffDashboard(req, res) {
  const businessId = req.params.id;
  const { staffId } = req.params;
  await assertCanManageBusinessId(req, businessId);
  if (!mongoose.isValidObjectId(staffId)) {
    return res.status(400).json({ message: "Invalid staff id" });
  }
  const member = await Staff.findOne({
    _id: staffId,
    business: businessId,
  }).select("+dashboardInviteToken");
  if (!member) {
    return res.status(404).json({ message: "Staff member not found" });
  }
  if (member.linkedUser) {
    return res.status(400).json({
      message: "This staff member already has dashboard access.",
    });
  }
  if (req.body?.email !== undefined) {
    member.email = String(req.body.email ?? "").trim().toLowerCase();
  }
  const email = String(member.email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({
      message: "Add a valid email for this staff member before sending an invite.",
    });
  }
  const token = crypto.randomBytes(32).toString("hex");
  member.dashboardInviteToken = token;
  member.dashboardInviteExpires = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  );
  await member.save();
  const biz = await Business.findById(businessId).select("name").lean();
  const base = (
    process.env.FRONTEND_URL ||
    process.env.APP_PUBLIC_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
  const inviteUrl = `${base}/staff-invite?token=${encodeURIComponent(token)}`;
  await sendStaffDashboardInviteEmail({
    to: email,
    businessName: biz?.name || "Business",
    staffName: member.name,
    inviteUrl,
  });
  return res.json({
    message: "Invite sent.",
    expiresAt: member.dashboardInviteExpires,
  });
}

/**
 * POST /api/businesses/:id/staff/:staffId/revoke-dashboard
 */
async function revokeStaffDashboard(req, res) {
  const businessId = req.params.id;
  const { staffId } = req.params;
  await assertCanManageBusinessId(req, businessId);
  if (!mongoose.isValidObjectId(staffId)) {
    return res.status(400).json({ message: "Invalid staff id" });
  }
  const member = await Staff.findOne({
    _id: staffId,
    business: businessId,
  }).select("+dashboardInviteToken linkedUser");
  if (!member) {
    return res.status(404).json({ message: "Staff member not found" });
  }
  if (!member.linkedUser) {
    member.dashboardInviteToken = null;
    member.dashboardInviteExpires = null;
    await member.save();
    return res.json({ message: "Pending invite cleared." });
  }
  const uid = member.linkedUser;
  member.linkedUser = null;
  member.dashboardInviteToken = null;
  member.dashboardInviteExpires = null;
  await member.save();
  await User.deleteOne({ _id: uid });
  return res.json({ message: "Dashboard access removed and account deleted." });
}

const BOOKING_STATS_EXCLUDE = ["cancelled"];

/**
 * GET /api/businesses/:id/staff/booking-stats
 * Per-staff counts: today, this week (Mon–Sun UTC), this calendar month (UTC).
 */
async function getStaffBookingStats(req, res) {
  const businessId = req.params.id;
  await assertCanManageBusinessId(req, businessId);

  const now = new Date();
  const ymd = utcTodayYmd();
  const todayStart = utcDayStart(ymd);
  const todayEnd = utcAddDays(todayStart, 1);

  const weekStart = utcWeekMondayStart(now);
  const weekEnd = utcAddDays(weekStart, 7);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const minBound = new Date(
    Math.min(weekStart.getTime(), monthStart.getTime()),
  );
  const maxBound = new Date(
    Math.max(weekEnd.getTime(), monthEnd.getTime()),
  );

  const businessOid = new mongoose.Types.ObjectId(businessId);

  const rows = await Booking.aggregate([
    {
      $match: {
        business: businessOid,
        status: { $nin: BOOKING_STATS_EXCLUDE },
        date: { $gte: minBound, $lt: maxBound },
      },
    },
    {
      $group: {
        _id: "$staff",
        today: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$date", todayStart] },
                  { $lt: ["$date", todayEnd] },
                ],
              },
              1,
              0,
            ],
          },
        },
        week: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$date", weekStart] },
                  { $lt: ["$date", weekEnd] },
                ],
              },
              1,
              0,
            ],
          },
        },
        month: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$date", monthStart] },
                  { $lt: ["$date", monthEnd] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const byStaff = {};
  for (const r of rows) {
    byStaff[String(r._id)] = {
      today: r.today,
      week: r.week,
      month: r.month,
    };
  }

  const staffIds = await Staff.find({ business: businessId })
    .select("_id")
    .lean();
  const stats = staffIds.map((s) => {
    const id = s._id.toString();
    const c = byStaff[id] || { today: 0, week: 0, month: 0 };
    return { staffId: id, ...c };
  });

  return res.json({ stats });
}

/**
 * GET /api/businesses/:id/staff/smart-ranking
 * Tenant (manage) — preview metrics and assignment order for “Anyone available”.
 */
async function getStaffSmartRanking(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid business id" });
  }
  const business = await Business.findById(id).lean();
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed" });
  }
  await assertBusinessFeature(req, id, "smartRanking");
  const preview = await getStaffRankingPreview(id, business);
  return res.json(preview);
}

/**
 * GET /api/businesses/:id/staff/:staffId/smart-ranking-feedback
 * Tenant — full list of booking-linked review texts for smart ranking (modal).
 */
async function getStaffSmartRankingFeedback(req, res) {
  const { id, staffId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(staffId)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const business = await Business.findById(id).lean();
  if (!business) {
    return res.status(404).json({ message: "Business not found" });
  }
  if (!canManageBusiness(req.user, business)) {
    return res.status(403).json({ message: "Not allowed" });
  }
  await assertBusinessFeature(req, id, "smartRanking");
  const staff = await Staff.findOne({
    _id: staffId,
    business: id,
  })
    .select("_id")
    .lean();
  if (!staff) {
    return res.status(404).json({ message: "Staff not found" });
  }
  const detail = await getStaffRatingFeedbackDetail(id, staffId);
  return res.json(detail);
}

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  inviteStaffDashboard,
  revokeStaffDashboard,
  getStaffBookingStats,
  getStaffSmartRanking,
  getStaffSmartRankingFeedback,
};
