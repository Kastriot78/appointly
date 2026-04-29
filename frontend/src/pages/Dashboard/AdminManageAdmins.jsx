import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import {
  HiOutlineSearch,
  HiOutlineTrash,
  HiOutlineUserAdd,
  HiOutlineUserGroup,
  HiOutlineX,
} from "react-icons/hi";
import {
  createAdminUser,
  listManagedUsers,
  deleteManagedUser,
  updateManagedUserRole,
} from "../../api/users";
import {
  getApiErrorMessage,
  verifyEmail as verifyEmailRequest,
  resendVerification as resendVerificationRequest,
} from "../../api/auth";
import { isAdminRole } from "../../utils/roles";
import { useToast } from "../../components/ToastContext";
import VerifyEmailModal from "../Auth/VerifyEmailModal";
import CustomSelect from "../../utils/CustomSelect";
import "./dashboard-pages.css";

export default function AdminManageAdmins() {
  const { user } = useOutletContext();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingRoleId, setUpdatingRoleId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [undoDelete, setUndoDelete] = useState(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const undoTimerRef = useRef(null);
  const undoIntervalRef = useRef(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "admin",
  });

  const canSubmit =
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.password.length >= 6 &&
    !submitting;

  const roleOptions = useMemo(
    () => [
      { value: "admin", label: "Admin" },
      { value: "tenant", label: "Tenant" },
      { value: "customer", label: "Customer" },
    ],
    [],
  );

  const filterOptions = useMemo(
    () => [{ value: "all", label: "All roles" }, ...roleOptions],
    [roleOptions],
  );

  const roleBadgeLabel = (role) => (role === "customer" ? "user" : role);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleAccounts = useMemo(() => {
    if (!normalizedSearch) return accounts;
    return accounts.filter((account) => {
      const name = String(account?.name || "").toLowerCase();
      const email = String(account?.email || "").toLowerCase();
      return name.includes(normalizedSearch) || email.includes(normalizedSearch);
    });
  }, [accounts, normalizedSearch]);

  const loadAccounts = async () => {
    setLoadingList(true);
    try {
      const params = roleFilter === "all" ? {} : { role: roleFilter };
      const { data } = await listManagedUsers(params);
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      setAccounts([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
      if (undoIntervalRef.current) {
        window.clearInterval(undoIntervalRef.current);
      }
    };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await createAdminUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      const e = String(data?.email || form.email || "")
        .trim()
        .toLowerCase();
      setPendingEmail(e);
      setVerifyModalOpen(true);
      showToast("Verification code sent to the new admin email.", "success");
      setForm({ name: "", email: "", password: "", role: "admin" });
      await loadAccounts();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemoveAccount = (account) => {
    if (!account?.id) return;
    setDeleteConfirm(account);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setDeleteConfirm(null);
  };

  const performDeleteWithUndo = async () => {
    const account = deleteConfirm;
    if (!account?.id) return;
    setDeleteConfirm(null);
    setDeletingId(account.id);

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    if (undoIntervalRef.current) {
      window.clearInterval(undoIntervalRef.current);
    }

    const expiresAt = Date.now() + 10000;
    setUndoDelete({ account, expiresAt });
    setUndoCountdown(10);
    undoIntervalRef.current = window.setInterval(() => {
      setUndoCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    showToast("Account scheduled for removal. Undo within 10 seconds.", "success");

    undoTimerRef.current = window.setTimeout(async () => {
      try {
        await deleteManagedUser(account.id);
        setAccounts((prev) => prev.filter((row) => row.id !== account.id));
        showToast("Account removed permanently.", "success");
      } catch (err) {
        showToast(getApiErrorMessage(err), "error");
      } finally {
        setUndoDelete(null);
        setUndoCountdown(0);
        setDeletingId(null);
        undoTimerRef.current = null;
        if (undoIntervalRef.current) {
          window.clearInterval(undoIntervalRef.current);
          undoIntervalRef.current = null;
        }
      }
    }, 10000);
  };

  const undoRemove = () => {
    if (!undoDelete?.account) return;
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoIntervalRef.current) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    setUndoDelete(null);
    setUndoCountdown(0);
    setDeletingId(null);
    showToast("Removal undone.", "success");
  };

  const changeRole = async (account, nextRole) => {
    if (!account?.id || !nextRole || nextRole === account.role) return;
    setUpdatingRoleId(account.id);
    try {
      const { data } = await updateManagedUserRole(account.id, nextRole);
      const updated = data?.account;
      if (updated?.id) {
        setAccounts((prev) =>
          prev.map((row) =>
            row.id === updated.id ? { ...row, role: updated.role } : row,
          ),
        );
      } else {
        await loadAccounts();
      }
      showToast("Role updated.", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setUpdatingRoleId(null);
    }
  };

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dp-page">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Manage platform accounts</h1>
          <p className="dp-subtitle">
            Create admin, tenant, or customer accounts. Verification code is sent
            by email before first sign-in.
          </p>
        </div>
      </div>

      <form className="ac-form-card" onSubmit={onSubmit} noValidate>
        <div className="ac-form-grid">
          <div className="dp-field">
            <label>Full name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="john doe"
              autoComplete="name"
            />
          </div>
          <div className="dp-field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value.toLowerCase() }))
              }
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>
          <div className="dp-field">
            <label>Role</label>
            <CustomSelect
              options={roleOptions}
              value={form.role}
              onChange={(v) => setForm((p) => ({ ...p, role: v }))}
              placeholder="Select role"
            />
          </div>
          <div className="dp-field">
            <label>Temporary password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((p) => ({ ...p, password: e.target.value }))
              }
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
            <span className="dp-field-hint">
              User can change password later from profile/reset flow.
            </span>
          </div>
        </div>

        <div className="dt-modal-footer" style={{ padding: 0, borderTop: 0 }}>
          <button type="submit" className="dp-btn-primary" disabled={!canSubmit}>
            <HiOutlineUserAdd size={18} style={{ marginRight: 6 }} />
            {submitting ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>

      <div className="ac-table-wrap" style={{ marginTop: 16 }}>
        <div
          className="dp-header dp-header--row"
          style={{ marginBottom: 0, alignItems: "center",paddingBottom: 0, }}
        >
          <h3 className="dp-section-heading d-flex align-items-center" style={{ margin: 0 }}>
            <HiOutlineUserGroup size={18} style={{ marginRight: 6 }} />
            Accounts
          </h3>
          <div className="ac-role-filter-wrap">
            <CustomSelect options={filterOptions} value={roleFilter} onChange={setRoleFilter} />
          </div>
        </div>
        <div className="ac-search-row">
          <div className="dp-bookings-search ac-search-input">
            <HiOutlineSearch size={18} aria-hidden />
            <input
              type="search"
              className="form-control dp-bookings-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search accounts by name or email"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        {loadingList ? (
          <p className="ac-muted">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="ac-muted">No accounts found.</p>
        ) : visibleAccounts.length === 0 ? (
          <p className="ac-muted text-center">No accounts match your search.</p>
        ) : (
          <table className="ac-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name || "—"}</td>
                  <td className="ac-muted">{a.email || "—"}</td>
                  <td>
                    {String(a.id) === String(user?.id) ? (
                      <span className="aba-status aba-status--live">
                        {roleBadgeLabel(a.role)}
                      </span>
                    ) : (
                      <div style={{ minWidth: 140 }}>
                        <CustomSelect
                          options={[
                            { value: "admin", label: "admin" },
                            { value: "tenant", label: "tenant" },
                            { value: "customer", label: "user" },
                          ]}
                          value={a.role}
                          onChange={(v) => changeRole(a, v)}
                          disabled={updatingRoleId === a.id}
                        />
                      </div>
                    )}
                  </td>
                  <td className="ac-muted">
                    {a.isEmailVerified ? "Verified" : "Pending"}
                  </td>
                  <td className="ac-muted">
                    {a.createdAt
                      ? new Date(a.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {String(a.id) === String(user?.id) ? (
                      <span className="ac-muted">You</span>
                    ) : (
                      undoDelete?.account?.id === a.id ? (
                        <button
                          type="button"
                          className="dp-btn-primary"
                          onClick={undoRemove}
                          style={{
                            padding: "6px 10px",
                            fontSize: 13,
                            minWidth: 96,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          Undo ({Math.max(0, undoCountdown)}s)
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="dp-btn-ghost"
                          disabled={deletingId === a.id}
                          onClick={() => confirmRemoveAccount(a)}
                          style={{ padding: "6px 10px", fontSize: 13 }}
                        >
                          <HiOutlineTrash size={15} style={{ marginRight: 6 }} />
                          {deletingId === a.id ? "Removing…" : "Remove"}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <VerifyEmailModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        email={pendingEmail}
        onVerify={async (code) => {
          await verifyEmailRequest({ email: pendingEmail, code });
        }}
        onResend={async () => {
          await resendVerificationRequest({ email: pendingEmail });
        }}
        onSuccess={() => {
          setVerifyModalOpen(false);
          showToast("Admin email verified. Account is now active.", "success");
          loadAccounts();
        }}
      />

      {deleteConfirm ? (
        <div className="dt-modal-overlay" role="presentation" onClick={closeDeleteModal}>
          <div
            className="dt-modal mb-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-account-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-modal-header">
              <h2 id="admin-account-delete-title">Remove account?</h2>
              <button
                type="button"
                className="dt-modal-close"
                onClick={closeDeleteModal}
                aria-label="Close"
                disabled={!!deletingId}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="dt-modal-body">
              <p className="mb-delete-modal-text">
                This account will be removed. You can undo this action for 10 seconds
                after confirming.
              </p>
              <p className="dp-closing-delete-preview">
                <span className="dp-closing-kicker">Name</span>{" "}
                {deleteConfirm.name || "—"}
                <br />
                <span className="dp-closing-kicker mt-2">Email</span>{" "}
                {deleteConfirm.email || "—"}
              </p>
            </div>
            <div className="dt-modal-footer">
              <button
                type="button"
                className="dp-action-btn cancel"
                onClick={closeDeleteModal}
                disabled={!!deletingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-delete-modal-confirm"
                onClick={performDeleteWithUndo}
                disabled={!!deletingId}
              >
                {deletingId ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
