const User = require("../models/User");
const PendingRegistration = require("../models/PendingRegistration");
const { userMeResponse } = require("../utils/userMeResponse");
const { deleteAccountForUser } = require("../services/deleteAccount.service");
const { createEmailVerificationPayload } = require("../utils/verificationCode");
const {
  sendEmailChangeCode,
  sendVerificationEmail,
} = require("../services/email.service");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_MANAGED_ROLES = new Set(["admin", "tenant", "customer"]);

/**
 * GET /api/users/me — current user (refreshes role from DB).
 */
async function getMe(req, res) {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  return res.json({ user: await userMeResponse(user) });
}

async function isEmailOrPendingTakenByOther(email, excludeUserId) {
  const byLogin = await User.findOne({
    email,
    _id: { $ne: excludeUserId },
  });
  if (byLogin) return true;
  const byPending = await User.findOne({
    pendingEmail: email,
    _id: { $ne: excludeUserId },
  });
  return Boolean(byPending);
}

/**
 * PUT /api/users/me
 * Body: { name?, email?, phone? } — at least one field required.
 * Email change: login email stays until the user confirms the code sent to the new address.
 */
async function updateProfile(req, res) {
  const { name, email, phone } = req.body;
  const hasName = name !== undefined;
  const hasEmail = email !== undefined;
  const hasPhone = phone !== undefined;

  if (!hasName && !hasEmail && !hasPhone) {
    return res.status(400).json({ message: "No fields to update" });
  }

  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (hasName) {
    const n = String(name).trim().toLowerCase();
    if (n.length < 1) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }
    user.name = n;
  }

  if (hasEmail) {
    const e = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(e)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    if (e === user.email) {
      if (user.pendingEmail) {
        user.set("pendingEmail", undefined);
        user.emailChangeCodeHash = null;
        user.emailChangeExpires = null;
      }
    } else if (user.pendingEmail && e === user.pendingEmail) {
      const { code, hash, expiresAt } = await createEmailVerificationPayload();
      user.emailChangeCodeHash = hash;
      user.emailChangeExpires = expiresAt;
      await sendEmailChangeCode(e, user.name, code);
    } else {
      const taken = await isEmailOrPendingTakenByOther(e, user._id);
      if (taken) {
        return res.status(409).json({ message: "Email is already in use" });
      }
      const { code, hash, expiresAt } = await createEmailVerificationPayload();
      user.pendingEmail = e;
      user.emailChangeCodeHash = hash;
      user.emailChangeExpires = expiresAt;
      await sendEmailChangeCode(e, user.name, code);
    }
  }

  if (hasPhone) {
    user.phone = String(phone).trim();
  }

  try {
    await user.save();
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Email is already in use" });
    }
    throw err;
  }
  const fresh = await User.findById(user._id);
  return res.json({ user: await userMeResponse(fresh) });
}

/**
 * PUT /api/users/me/password
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || String(currentPassword).length < 1) {
    return res.status(400).json({ message: "Current password is required" });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ message: "New password must be at least 6 characters" });
  }

  const user = await User.findById(req.userId).select("+password");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const ok = await user.comparePassword(String(currentPassword));
  if (!ok) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  user.password = String(newPassword);
  await user.save();

  return res.json({ message: "Password updated successfully" });
}

/**
 * POST /api/users/me/confirm-email
 * Body: { code } — completes email change; code was sent to pendingEmail.
 */
async function confirmEmailChange(req, res) {
  const { code } = req.body;
  if (!code || String(code).trim().length < 4) {
    return res.status(400).json({ message: "Verification code is required" });
  }

  const user = await User.findById(req.userId).select(
    "+emailChangeCodeHash +emailChangeExpires",
  );
  if (!user || !user.pendingEmail) {
    return res.status(400).json({
      message: "No pending email change. Update your email in Profile first.",
    });
  }

  const ok = await user.compareEmailChangeCode(String(code).trim());
  if (!ok) {
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  user.email = user.pendingEmail;
  user.set("pendingEmail", undefined);
  user.emailChangeCodeHash = null;
  user.emailChangeExpires = null;
  await user.save();

  const fresh = await User.findById(user._id);
  return res.json({
    message: "Email updated. Sign in with your new address from now on.",
    user: await userMeResponse(fresh),
  });
}

/**
 * DELETE /api/users/me/pending-email — cancel a pending email change.
 */
async function cancelPendingEmail(req, res) {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  if (!user.pendingEmail) {
    return res.json({ user: await userMeResponse(user) });
  }
  user.set("pendingEmail", undefined);
  user.emailChangeCodeHash = null;
  user.emailChangeExpires = null;
  await user.save();
  const fresh = await User.findById(user._id);
  return res.json({ user: await userMeResponse(fresh) });
}

/**
 * POST /api/users/me/resend-email-change
 */
async function resendEmailChange(req, res) {
  const user = await User.findById(req.userId);
  if (!user || !user.pendingEmail) {
    return res.status(400).json({ message: "No pending email to verify" });
  }
  const { code, hash, expiresAt } = await createEmailVerificationPayload();
  user.emailChangeCodeHash = hash;
  user.emailChangeExpires = expiresAt;
  await user.save();
  await sendEmailChangeCode(user.pendingEmail, user.name, code);
  return res.json({ message: "A new code has been sent." });
}

/**
 * DELETE /api/users/me
 * Body: { confirmEmail } — must match the account sign-in email.
 */
async function deleteAccount(req, res) {
  const { confirmEmail } = req.body;
  const result = await deleteAccountForUser(req.userId, confirmEmail);
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }
  return res.json({ message: "Your account has been deleted." });
}

/**
 * POST /api/users/admin/accounts
 * Admin-only: create pending account (admin/tenant/customer) and send verification code.
 */
async function createManagedAccount(req, res) {
  const { name, email, password, role } = req.body || {};
  const n = String(name || "").trim().toLowerCase();
  const e = String(email || "")
    .trim()
    .toLowerCase();
  const p = String(password || "");
  const r = String(role || "admin")
    .trim()
    .toLowerCase();

  if (n.length < 1) {
    return res.status(400).json({ message: "Name is required" });
  }
  if (!EMAIL_REGEX.test(e)) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  if (p.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }
  if (!ADMIN_MANAGED_ROLES.has(r)) {
    return res
      .status(400)
      .json({ message: "Role must be one of: admin, tenant, customer" });
  }

  const existingVerified = await User.findOne({ email: e, isEmailVerified: true });
  if (existingVerified) {
    return res.status(409).json({ message: "Email already registered" });
  }

  await User.deleteMany({ email: e, isEmailVerified: false });

  let pending = await PendingRegistration.findOne({ email: e });
  if (!pending) {
    pending = new PendingRegistration({
      name: n,
      email: e,
      password: p,
      role: r,
    });
  } else {
    pending.name = n;
    pending.password = p;
    pending.role = r;
  }

  const { code, hash, expiresAt } = await createEmailVerificationPayload();
  pending.emailVerificationCodeHash = hash;
  pending.emailVerificationExpires = expiresAt;

  await pending.save();
  await sendVerificationEmail(pending.email, pending.name, code);

  return res.status(201).json({
    message:
      "Account invitation created. A verification code has been sent to that email.",
    email: pending.email,
    role: pending.role,
    verificationPending: true,
  });
}

/**
 * GET /api/users/admin/accounts
 * Admin-only: list existing platform accounts for managed roles.
 */
async function listManagedAccounts(req, res) {
  const roleQ = String(req.query.role || "")
    .trim()
    .toLowerCase();
  const filter = {};
  if (roleQ && ADMIN_MANAGED_ROLES.has(roleQ)) {
    filter.role = roleQ;
  } else {
    filter.role = { $in: Array.from(ADMIN_MANAGED_ROLES) };
  }
  const rows = await User.find(filter)
    .select("name email role isEmailVerified createdAt")
    .sort({ createdAt: -1 })
    .lean();
  return res.json({
    accounts: rows.map((u) => ({
      id: String(u._id),
      name: u.name || "",
      email: u.email || "",
      role: u.role || "customer",
      isEmailVerified: u.isEmailVerified !== false,
      createdAt: u.createdAt ? u.createdAt.toISOString() : null,
    })),
  });
}

/**
 * DELETE /api/users/admin/accounts/:id
 * Admin-only: remove account by id (cannot remove own account here).
 */
async function deleteManagedAccount(req, res) {
  const { id } = req.params;
  if (!id || String(id) === String(req.userId)) {
    return res.status(400).json({
      message:
        "You cannot remove your own account from this screen. Use profile delete flow instead.",
    });
  }
  const user = await User.findById(id).select("role");
  if (!user) {
    return res.status(404).json({ message: "Account not found" });
  }
  if (!ADMIN_MANAGED_ROLES.has(String(user.role || ""))) {
    return res.status(400).json({ message: "This account cannot be removed here." });
  }
  await User.deleteOne({ _id: id });
  return res.json({ message: "Account removed." });
}

/**
 * PUT /api/users/admin/accounts/:id/role
 * Admin-only: change role for managed roles.
 */
async function updateManagedAccountRole(req, res) {
  const { id } = req.params;
  const nextRole = String(req.body?.role || "")
    .trim()
    .toLowerCase();

  if (!id) {
    return res.status(400).json({ message: "Account id is required." });
  }
  if (!ADMIN_MANAGED_ROLES.has(nextRole)) {
    return res
      .status(400)
      .json({ message: "Role must be one of: admin, tenant, customer" });
  }
  if (String(id) === String(req.userId)) {
    return res.status(400).json({
      message: "You cannot change your own role from this screen.",
    });
  }

  const user = await User.findById(id).select(
    "name email role isEmailVerified createdAt staffProfile staffBusinessId",
  );
  if (!user) {
    return res.status(404).json({ message: "Account not found" });
  }
  if (!ADMIN_MANAGED_ROLES.has(String(user.role || ""))) {
    return res.status(400).json({ message: "This account cannot be edited here." });
  }

  user.role = nextRole;
  if (nextRole !== "staff") {
    user.staffProfile = null;
    user.staffBusinessId = null;
  }
  await user.save();

  return res.json({
    account: {
      id: String(user._id),
      name: user.name || "",
      email: user.email || "",
      role: user.role || "customer",
      isEmailVerified: user.isEmailVerified !== false,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    },
  });
}

module.exports = {
  getMe,
  updateProfile,
  changePassword,
  confirmEmailChange,
  cancelPendingEmail,
  resendEmailChange,
  deleteAccount,
  createManagedAccount,
  listManagedAccounts,
  deleteManagedAccount,
  updateManagedAccountRole,
};
