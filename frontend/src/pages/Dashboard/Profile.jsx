import { useState, useMemo, useCallback, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import UserAvatar from "../../components/UserAvatar";
import { useToast } from "../../components/ToastContext";
import { useAuth } from "../../auth/AuthContext";
import { getApiErrorMessage } from "../../api/auth";
import {
  getMe,
  updateProfile,
  changePassword,
  confirmEmailChange,
  cancelPendingEmail,
  resendEmailChange,
  startTwoFactor,
  confirmTwoFactor,
} from "../../api/users";
import DeleteAccountModal from "./DeleteAccountModal";
import { normalizePersonName } from "../../utils/normalizePersonName";
import { isTenantAccount } from "../../utils/roles";
import VerifyEmailModal from "../Auth/VerifyEmailModal";
import PhoneField from "../../components/PhoneField";
import { DashboardPageSkeletonDefault } from "../../components/DashboardPageSkeleton";
import DashboardErrorPanel from "../../components/DashboardErrorPanel";
import { getStoredWorkspaceId } from "../../auth/session";
import { getBusiness, updateBusiness } from "../../api/businesses";
import "./dashboard-pages.css";

const TENANT_NOTIFY_DEFAULTS = {
  newBooking: true,
  bookingCancelled: true,
  newReview: true,
  dailySummary: false,
  weeklyReport: false,
};

const TENANT_NOTIFY_ITEMS = [
  {
    key: "newBooking",
    label: "New booking received",
    desc: "Get notified when a client books an appointment",
  },
  {
    key: "bookingCancelled",
    label: "Booking cancelled",
    desc: "Get notified when a booking is cancelled",
  },
  {
    key: "newReview",
    label: "New review received",
    desc: "Get notified when a client leaves a review",
  },
  {
    key: "dailySummary",
    label: "Daily summary",
    desc: "Receive a daily email with your schedule (UTC morning)",
  },
  {
    key: "weeklyReport",
    label: "Weekly report",
    desc: "Receive a weekly analytics email (Monday UTC)",
  },
];

function mergeTenantNotifyPrefs(raw) {
  return { ...TENANT_NOTIFY_DEFAULTS, ...(raw || {}) };
}

const Profile = () => {
  const { user } = useOutletContext();
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isTenant = isTenantAccount(user.role);

  const hasPhoneInSession = Boolean((user.phone || "").trim());
  const [phoneInputForced, setPhoneInputForced] = useState(false);
  const showPhoneField = hasPhoneInSession || phoneInputForced;

  const [form, setForm] = useState({
    name: (user.name || "").toLowerCase(),
    email: (user.pendingEmail || user.email || "").toLowerCase(),
    phone: (user.phone || "").trim(),
    avatar: user.avatar || "",
  });

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  const [focusedField, setFocusedField] = useState(null);
  const [generalLoading, setGeneralLoading] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [twoFactor, setTwoFactor] = useState(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const [activeSection, setActiveSection] = useState("general");

  const [profileLoading, setProfileLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [workspaceId, setWorkspaceId] = useState(() =>
    getStoredWorkspaceId(),
  );
  const [notifPrefs, setNotifPrefs] = useState(() => ({
    ...TENANT_NOTIFY_DEFAULTS,
  }));
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSavingKey, setNotifSavingKey] = useState(null);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setLoadError(null);
    try {
      const { data } = await getMe();
      if (data?.user) refreshUser(data.user);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setProfileLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const onWs = () => setWorkspaceId(getStoredWorkspaceId());
    window.addEventListener("appointly:workspace-changed", onWs);
    return () =>
      window.removeEventListener("appointly:workspace-changed", onWs);
  }, []);

  useEffect(() => {
    if (!isTenant || activeSection !== "notifications") return undefined;
    if (!workspaceId) return undefined;
    let cancelled = false;
    setNotifLoading(true);
    (async () => {
      try {
        const { data } = await getBusiness(workspaceId);
        const p = data?.business?.tenantNotificationPrefs;
        if (!cancelled) setNotifPrefs(mergeTenantNotifyPrefs(p));
      } catch (err) {
        if (!cancelled) {
          showToast(getApiErrorMessage(err), "error");
        }
      } finally {
        if (!cancelled) setNotifLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTenant, activeSection, workspaceId, showToast]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: (user.name || "").toLowerCase(),
      email: (user.pendingEmail || user.email || "").toLowerCase(),
      phone: (user.phone || "").trim(),
      avatar: user.avatar || "",
    }));
  }, [user.name, user.email, user.pendingEmail, user.phone, user.avatar]);

  useEffect(() => {
    if (!user.pendingEmail) {
      setVerifyModalOpen(false);
    }
  }, [user.pendingEmail]);

  const handleVerifyEmailChange = useCallback(
    async (code) => {
      const { data } = await confirmEmailChange({ code });
      refreshUser(data.user);
    },
    [refreshUser],
  );

  const handleCancelEmailChange = useCallback(async () => {
    const { data } = await cancelPendingEmail();
    refreshUser(data.user);
    showToast("Email change cancelled.", "success");
  }, [refreshUser, showToast]);

  const handleResendWithToast = useCallback(async () => {
    await resendEmailChange();
    showToast("A new code has been sent.", "success");
  }, [showToast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const v =
      name === "name" || name === "email" ? value.toLowerCase() : value;
    setForm((prev) => ({ ...prev, [name]: v }));
  };

  const handlePasswordChange = (e) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveGeneral = useCallback(async () => {
    setGeneralLoading(true);
    try {
      const canonicalEmail = (user.pendingEmail || user.email || "")
        .trim()
        .toLowerCase();
      const emailNorm = form.email.trim().toLowerCase();

      const body = {
        name: normalizePersonName(form.name),
      };
      if (emailNorm !== canonicalEmail) {
        body.email = emailNorm;
      }
      if (showPhoneField) {
        body.phone = form.phone.trim();
      }

      const { data } = await updateProfile(body);
      refreshUser(data.user);
      setForm({
        name: (data.user.name || "").toLowerCase(),
        email: (data.user.pendingEmail || data.user.email || "").toLowerCase(),
        phone: (data.user.phone || "").trim(),
        avatar: data.user.avatar || "",
      });
      if (!(data.user.phone || "").trim()) {
        setPhoneInputForced(false);
      }

      const includedEmail = typeof body.email === "string";
      if (includedEmail && data.user.pendingEmail) {
        setVerifyModalOpen(true);
        showToast(
          `We sent a code to ${data.user.pendingEmail}. You can still sign in with ${data.user.email}.`,
          "success",
        );
      } else if (
        includedEmail &&
        !data.user.pendingEmail &&
        emailNorm === (data.user.email || "").toLowerCase()
      ) {
        showToast("Pending email change cancelled.", "success");
      } else {
        showToast("Your profile has been updated.", "success");
      }
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setGeneralLoading(false);
    }
  }, [form, showPhoneField, refreshUser, showToast, user]);

  const handlePasswordSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (passwordForm.newPass.length < 6) {
        showToast("New password must be at least 6 characters.", "error");
        return;
      }
      if (passwordForm.newPass !== passwordForm.confirm) {
        showToast("New passwords do not match.", "error");
        return;
      }
      setPasswordLoading(true);
      try {
        await changePassword({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.newPass,
        });
        setPasswordForm({ current: "", newPass: "", confirm: "" });
        showToast("Your password has been changed.", "success");
      } catch (err) {
        showToast(getApiErrorMessage(err), "error");
      } finally {
        setPasswordLoading(false);
      }
    },
    [passwordForm, showToast],
  );

  const passwordValid = useMemo(() => {
    return (
      passwordForm.current.length > 0 &&
      passwordForm.newPass.length >= 6 &&
      passwordForm.newPass === passwordForm.confirm
    );
  }, [passwordForm]);

  const twoFactorOn = Boolean(user.twoFactorEnabled);

  const startTwoFactorFlow = useCallback(
    async (action) => {
      if (twoFactorLoading || twoFactor) return;
      setTwoFactorLoading(true);
      try {
        await startTwoFactor(action);
        setTwoFactor({ action });
      } catch (err) {
        showToast(getApiErrorMessage(err), "error");
      } finally {
        setTwoFactorLoading(false);
      }
    },
    [twoFactor, twoFactorLoading, showToast],
  );

  const handleConfirmTwoFactor = useCallback(
    async (code) => {
      if (!twoFactor?.action) return;
      const { data } = await confirmTwoFactor(twoFactor.action, code);
      if (data?.user) refreshUser(data.user);
    },
    [twoFactor, refreshUser],
  );

  const handleResendTwoFactor = useCallback(async () => {
    if (!twoFactor?.action) return;
    await startTwoFactor(twoFactor.action);
  }, [twoFactor]);

  const handleTwoFactorSuccess = useCallback(() => {
    showToast(
      twoFactor?.action === "enable"
        ? "Two-factor authentication is now on."
        : "Two-factor authentication is off.",
      "success",
    );
    setTwoFactor(null);
  }, [twoFactor, showToast]);

  const handleNotifToggle = useCallback(
    async (key) => {
      if (!workspaceId || notifSavingKey) return;
      const prevVal = notifPrefs[key];
      const next = !prevVal;
      setNotifPrefs((p) => ({ ...p, [key]: next }));
      setNotifSavingKey(key);
      try {
        await updateBusiness(workspaceId, {
          tenantNotificationPrefs: { [key]: next },
        });
        showToast("Notification preference saved.", "success");
      } catch (err) {
        setNotifPrefs((p) => ({ ...p, [key]: prevVal }));
        showToast(getApiErrorMessage(err), "error");
      } finally {
        setNotifSavingKey(null);
      }
    },
    [workspaceId, notifSavingKey, notifPrefs, showToast],
  );

  return (
    <div className="dp-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">{isTenant ? "Settings" : "Profile"}</h1>
          <p className="dp-subtitle">
            {isTenant
              ? "Manage your business settings and profile"
              : "Update your personal information"}
          </p>
        </div>
      </div>

      {loadError && !profileLoading ? (
        <DashboardErrorPanel message={loadError} onRetry={loadProfile} />
      ) : profileLoading ? (
        <DashboardPageSkeletonDefault rows={5} />
      ) : (
        <>
      <div className="dp-section-tabs">
        <button
          type="button"
          className={`dp-section-tab ${activeSection === "general" ? "active" : ""}`}
          onClick={() => setActiveSection("general")}
        >
          {isTenant ? "Personal Info" : "General"}
        </button>
        <button
          type="button"
          className={`dp-section-tab ${activeSection === "security" ? "active" : ""}`}
          onClick={() => setActiveSection("security")}
        >
          Security
        </button>
        {isTenant && (
          <button
            type="button"
            className={`dp-section-tab ${activeSection === "notifications" ? "active" : ""}`}
            onClick={() => setActiveSection("notifications")}
          >
            Notifications
          </button>
        )}
      </div>

      {activeSection === "general" && (
        <div className="dp-profile-form">
          <div className="dp-avatar-section">
            <UserAvatar
              name={form.name}
              src={form.avatar}
              className="dp-avatar-large"
              alt={form.name}
            />
            <div>
              <h3>{form.name}</h3>
              <p className="dp-user-login-email">
                Sign in: {user.email}
              </p>
              {user.pendingEmail ? (
                <p className="dp-user-pending-email">
                  Confirming new email: {user.pendingEmail}
                </p>
              ) : null}
            </div>
          </div>

          <div className="dp-form-grid">
            <div
              className={`dp-field ${focusedField === "name" ? "focused" : ""}`}
            >
              <label htmlFor="pf-name">Full Name</label>
              <input
                id="pf-name"
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                onFocus={() => setFocusedField("name")}
                onBlur={() => setFocusedField(null)}
                autoComplete="name"
              />
            </div>
            <div
              className={`dp-field ${focusedField === "email" ? "focused" : ""}`}
            >
              <label htmlFor="pf-email">Email</label>
              <input
                id="pf-email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                autoComplete="email"
                placeholder="your@email.com"
              />
              <span className="dp-field-hint">
                {user.pendingEmail
                  ? "We sent a code to your new address — use the verification window to confirm. Sign-in stays on your current email until then."
                  : "To change email, enter a new address and save — we will send a code there."}
              </span>
            </div>
            {user.pendingEmail && !verifyModalOpen ? (
              <div className="dp-pending-email-nudge">
                <p>
                  Waiting for a code at{" "}
                  <strong>{user.pendingEmail}</strong>.{" "}
                  <button
                    type="button"
                    className="dp-pending-email-open"
                    onClick={() => setVerifyModalOpen(true)}
                  >
                    Open verification
                  </button>
                </p>
              </div>
            ) : null}
            {showPhoneField ? (
              <div
                className={`dp-field ${focusedField === "phone" ? "focused" : ""}`}
              >
                <label htmlFor="pf-phone">Phone</label>
                <PhoneField
                  id="pf-phone"
                  value={form.phone}
                  onChange={(v) =>
                    setForm((prev) => ({ ...prev, phone: v }))
                  }
                  numberInputProps={{
                    onFocus: () => setFocusedField("phone"),
                    onBlur: () => setFocusedField(null),
                    autoComplete: "tel",
                  }}
                />
              </div>
            ) : (
              <div className="dp-field dp-field--add-phone">
                <button
                  type="button"
                  className="dp-add-phone-btn"
                  onClick={() => setPhoneInputForced(true)}
                >
                  + Add phone number
                </button>
              </div>
            )}
          </div>

          <div className="dp-form-footer">
            <button
              type="button"
              className="dp-save-btn"
              onClick={handleSaveGeneral}
              disabled={generalLoading}
            >
              {generalLoading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {activeSection === "security" && (
        <div className="dp-profile-form">
          <h3 className="dp-section-heading">Change Password</h3>
          <form className="dp-form-grid single" onSubmit={handlePasswordSubmit}>
            <div
              className={`dp-field full ${focusedField === "current" ? "focused" : ""}`}
            >
              <label htmlFor="pf-cur">Current Password</label>
              <input
                id="pf-cur"
                type="password"
                name="current"
                value={passwordForm.current}
                onChange={handlePasswordChange}
                onFocus={() => setFocusedField("current")}
                onBlur={() => setFocusedField(null)}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
            </div>
            <div
              className={`dp-field full ${focusedField === "newPass" ? "focused" : ""}`}
            >
              <label htmlFor="pf-new">New Password</label>
              <input
                id="pf-new"
                type="password"
                name="newPass"
                value={passwordForm.newPass}
                onChange={handlePasswordChange}
                onFocus={() => setFocusedField("newPass")}
                onBlur={() => setFocusedField(null)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div
              className={`dp-field full ${focusedField === "confirm" ? "focused" : ""}`}
            >
              <label htmlFor="pf-conf">Confirm New Password</label>
              <input
                id="pf-conf"
                type="password"
                name="confirm"
                value={passwordForm.confirm}
                onChange={handlePasswordChange}
                onFocus={() => setFocusedField("confirm")}
                onBlur={() => setFocusedField(null)}
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
            </div>
            <div className="dp-form-footer">
              <button
                type="submit"
                className="dp-save-btn"
                disabled={!passwordValid || passwordLoading}
              >
                {passwordLoading ? "Updating…" : "Update Password"}
              </button>
            </div>
          </form>

          <div className="dp-2fa-block">
            <div className="dp-2fa-head">
              <div>
                <h3 className="dp-section-heading dp-2fa-title">
                  Two-Factor Authentication
                </h3>
                <p className="dp-2fa-desc">
                  {twoFactorOn
                    ? "We email a 6-digit code each time you sign in."
                    : "Add a second step at sign-in — we'll email a 6-digit code to your account email."}
                </p>
              </div>
              <span
                className={`dp-2fa-status ${twoFactorOn ? "on" : "off"}`}
              >
                {twoFactorOn ? "On" : "Off"}
              </span>
            </div>

            <div className="dp-2fa-actions">
              {twoFactorOn ? (
                <button
                  type="button"
                  className="dp-2fa-btn dp-2fa-btn--danger"
                  onClick={() => startTwoFactorFlow("disable")}
                  disabled={twoFactorLoading}
                >
                  {twoFactorLoading ? "Sending code…" : "Turn off 2FA"}
                </button>
              ) : (
                <button
                  type="button"
                  className="dp-2fa-btn dp-2fa-btn--primary"
                  onClick={() => startTwoFactorFlow("enable")}
                  disabled={twoFactorLoading}
                >
                  {twoFactorLoading ? "Sending code…" : "Turn on 2FA"}
                </button>
              )}
            </div>
          </div>

          <div className="dp-danger-zone">
            <h3>Danger Zone</h3>
            <p>Permanently delete your account and all associated data.</p>
            <button
              type="button"
              className="dp-delete-btn"
              onClick={() => setDeleteAccountOpen(true)}
            >
              Delete Account
            </button>
          </div>
        </div>
      )}

      {activeSection === "notifications" && isTenant && (
        <div className="dp-profile-form">
          <h3 className="dp-section-heading">Notification Preferences</h3>
          <p className="dp-notif-scope-hint">
            Applies to the business selected in the sidebar workspace. Emails
            go to your business contact address, or your account email if none
            is set.
          </p>
          {!workspaceId ? (
            <p className="dp-subtitle">
              Choose a workspace in the sidebar to load notification settings
              for that business.
            </p>
          ) : notifLoading ? (
            <DashboardPageSkeletonDefault rows={4} />
          ) : (
            <div className="dp-notif-list">
              {TENANT_NOTIFY_ITEMS.map((notif) => (
                <div key={notif.key} className="dp-notif-item">
                  <div>
                    <span className="dp-notif-label">{notif.label}</span>
                    <span className="dp-notif-desc">{notif.desc}</span>
                  </div>
                  <label
                    className={`dp-toggle ${notifSavingKey ? "dp-toggle--busy" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(notifPrefs[notif.key])}
                      onChange={() => handleNotifToggle(notif.key)}
                      disabled={Boolean(notifSavingKey)}
                    />
                    <span className="dp-toggle-slider" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </>
      )}

      <VerifyEmailModal
        isOpen={verifyModalOpen && Boolean(user.pendingEmail)}
        onClose={() => setVerifyModalOpen(false)}
        email={user.pendingEmail || ""}
        variant="email-change"
        onVerify={handleVerifyEmailChange}
        onResend={handleResendWithToast}
        onSuccess={() => {
          showToast(
            "Email confirmed — use your new address to sign in next time.",
            "success",
          );
          setVerifyModalOpen(false);
        }}
        onCancelChange={handleCancelEmailChange}
      />

      <VerifyEmailModal
        isOpen={Boolean(twoFactor)}
        onClose={() => setTwoFactor(null)}
        email={user.email || ""}
        variant={
          twoFactor?.action === "disable"
            ? "two-factor-disable"
            : "two-factor-enable"
        }
        onVerify={handleConfirmTwoFactor}
        onResend={handleResendTwoFactor}
        onSuccess={handleTwoFactorSuccess}
      />

      <DeleteAccountModal
        isOpen={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        signInEmail={user.email || ""}
        isTenant={isTenant}
        showToast={showToast}
        onDeleted={() => {
          setDeleteAccountOpen(false);
          logout();
          navigate("/", { replace: true });
        }}
      />
    </div>
  );
};

export default Profile;
