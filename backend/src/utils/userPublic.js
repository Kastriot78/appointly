function toPublicUser(user) {
  if (!user) return null;
  const staffProfileId = user.staffProfile
    ? String(user.staffProfile)
    : null;
  const staffBusinessId = user.staffBusinessId
    ? String(user.staffBusinessId)
    : null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    pendingEmail: user.pendingEmail || null,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    isEmailVerified: user.isEmailVerified,
    staffProfileId,
    staffBusinessId,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    /** Reserved; always false — 2FA is never forced by role. */
    twoFactorRequired: false,
    createdAt: user.createdAt,
  };
}

module.exports = { toPublicUser };
