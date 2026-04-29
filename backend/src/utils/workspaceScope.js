const mongoose = require("mongoose");
const Business = require("../models/Business");
const Staff = require("../models/Staff");
const { isAdminRole, isStaffRole } = require("./roleChecks");

/**
 * Resolves which business id(s) tenant dashboard APIs should use.
 * - Tenant + 1 business: that id (header optional).
 * - Tenant + N>1: requires X-Workspace-Id (or workspaceId / businessId query).
 * - Admin: only with explicit business id (no global aggregation).
 *
 * @returns {{ businessIds: mongoose.Types.ObjectId[], error: null } | { businessIds: [], error: { status: number, message: string, code?: string } }}
 */
async function resolveWorkspaceBusinessIds(req) {
  if (isStaffRole(req.user?.role)) {
    const st = await Staff.findOne({ linkedUser: req.userId })
      .select("business")
      .lean();
    if (!st?.business) {
      return {
        businessIds: [],
        staffId: null,
        error: {
          status: 403,
          message: "Staff profile is not linked to a business",
        },
      };
    }
    return {
      businessIds: [st.business],
      staffId: st._id,
      error: null,
    };
  }

  const raw =
    req.get("X-Workspace-Id") ||
    req.get("x-workspace-id") ||
    req.query.workspaceId ||
    req.query.businessId;
  const wid = raw != null ? String(raw).trim() : "";

  const mine = await Business.find({ owner: req.userId }).select("_id").lean();
  const mineIds = mine.map((b) => String(b._id));

  if (isAdminRole(req.user.role)) {
    if (wid && mongoose.isValidObjectId(wid)) {
      const exists = await Business.findById(wid).select("_id").lean();
      if (!exists) {
        return {
          businessIds: [],
          staffId: null,
          error: { status: 400, message: "Unknown business id" },
        };
      }
      return { businessIds: [exists._id], staffId: null, error: null };
    }
    /** Platform admins do not aggregate all tenant workspaces; use a tenant account. */
    return { businessIds: [], staffId: null, error: null };
  }

  if (mineIds.length === 0) {
    return { businessIds: [], staffId: null, error: null };
  }

  if (wid) {
    if (!mongoose.isValidObjectId(wid) || !mineIds.includes(wid)) {
      return {
        businessIds: [],
        staffId: null,
        error: {
          status: 403,
          message: "Invalid or inaccessible workspace",
        },
      };
    }
    return {
      businessIds: [new mongoose.Types.ObjectId(wid)],
      staffId: null,
      error: null,
    };
  }

  if (mineIds.length === 1) {
    return {
      businessIds: [new mongoose.Types.ObjectId(mineIds[0])],
      staffId: null,
      error: null,
    };
  }

  return {
    businessIds: [],
    staffId: null,
    error: {
      status: 400,
      message:
        "Choose a workspace: send header X-Workspace-Id with your business id",
      code: "WORKSPACE_REQUIRED",
    },
  };
}

module.exports = { resolveWorkspaceBusinessIds };
