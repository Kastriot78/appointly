import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Navigate, useOutletContext } from "react-router-dom";
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from "react-icons/hi";
import { useToast } from "../../components/ToastContext";
import { getApiErrorMessage } from "../../api/auth";
import {
  createLocation,
  updateLocation,
  deleteLocation,
} from "../../api/locations";
import { useLocations } from "../../hooks/useLocations";
import { isAdminRole } from "../../utils/roles";
import { DashboardSkeletonTable } from "../../components/DashboardPageSkeleton";
import "./dashboard-pages.css";

const emptyForm = () => ({
  name: "",
  sortOrder: "0",
});

const AdminLocations = () => {
  const { user } = useOutletContext();
  const { showToast } = useToast();
  const { locations, loading, refetch } = useLocations();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const sorted = useMemo(
    () =>
      [...locations].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          String(a.name).localeCompare(String(b.name)),
      ),
    [locations],
  );

  useEffect(() => {
    if (!deleteTarget) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !deletingId) {
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [deleteTarget, deletingId]);

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      sortOrder: String(c.sortOrder ?? 0),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      showToast("Name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateLocation(editingId, {
          name,
          sortOrder: Number(form.sortOrder) || 0,
        });
        showToast("Location updated.", "success");
      } else {
        await createLocation({
          name,
          sortOrder: Number(form.sortOrder) || 0,
        });
        showToast("Location created.", "success");
      }
      closeForm();
      await refetch();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteLocation(deleteTarget.id);
      showToast("Location removed.", "success");
      setDeleteTarget(null);
      await refetch();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteModal =
    deleteTarget &&
    createPortal(
      <div
        className="dt-modal-overlay"
        role="presentation"
        onClick={() => !deletingId && setDeleteTarget(null)}
      >
        <div
          className="dt-modal ac-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="al-delete-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dt-modal-header">
            <h2 id="al-delete-title">Remove this location?</h2>
            <button
              type="button"
              className="dt-modal-close"
              onClick={() => !deletingId && setDeleteTarget(null)}
              aria-label="Close"
              disabled={Boolean(deletingId)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4L12 12M12 4L4 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="dt-modal-body">
            <p className="ac-delete-lead">
              <span className="ac-delete-name">{deleteTarget.name}</span> will
              be removed from the city list. Businesses using this city
              may need to be updated.
            </p>
          </div>
          <div className="dt-modal-footer">
            <button
              type="button"
              className="dp-btn-ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={Boolean(deletingId)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="dp-btn-danger"
              onClick={confirmDelete}
              disabled={Boolean(deletingId)}
            >
              {deletingId ? "Removing…" : "Remove location"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="dp-page">
      {deleteModal}
      <div className="dp-header dp-header--row">
        <div>
          <h1 className="dp-title">Locations</h1>
          <p className="dp-subtitle">
            Manage cities for business profiles and Find &amp; Book filters.
            Only admins can change this list.
          </p>
        </div>
        <button
          type="button"
          className="dp-btn-primary"
          onClick={openCreate}
        >
          <HiOutlinePlus size={18} />
          Add location
        </button>
      </div>

      {formOpen && (
        <div className="ac-form-card">
          <h2 className="ac-form-title">
            {editingId ? "Edit location" : "New location"}
          </h2>
          <form className="ac-form-grid" onSubmit={handleSubmit}>
            <div className="dp-field">
              <label htmlFor="al-name">Display name</label>
              <input
                id="al-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Prishtina"
                required
                disabled={saving}
              />
            </div>
            <div className="dp-field">
              <label htmlFor="al-order">Sort order</label>
              <input
                id="al-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortOrder: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="ac-form-actions">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="dp-btn-primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="ac-table-wrap">
        {loading ? (
          <DashboardSkeletonTable cols={3} rows={6} />
        ) : sorted.length === 0 ? (
          <p className="ac-muted">No locations yet. Add a city to get started.</p>
        ) : (
          <table className="ac-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Name</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <td>{c.sortOrder ?? 0}</td>
                  <td>{c.name}</td>
                  <td className="ac-actions">
                    <button
                      type="button"
                      className="ac-icon-btn"
                      onClick={() => openEdit(c)}
                      aria-label="Edit"
                    >
                      <HiOutlinePencil size={18} />
                    </button>
                    <button
                      type="button"
                      className="ac-icon-btn ac-icon-btn--danger"
                      onClick={() => setDeleteTarget(c)}
                      disabled={Boolean(deletingId)}
                      aria-label="Delete"
                    >
                      <HiOutlineTrash size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminLocations;
