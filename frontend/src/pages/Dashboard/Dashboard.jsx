import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  Link,
  useNavigate,
} from "react-router-dom";
import {
  HiOutlineViewGrid,
  HiOutlineCalendar,
  HiOutlineStar,
  HiOutlineUser,
  HiOutlineOfficeBuilding,
  HiOutlineTag,
  HiOutlineLocationMarker,
  HiOutlineChevronDown,
  HiOutlineClipboardList,
  HiOutlineShieldCheck,
  HiOutlineLogout,
  HiOutlineBan,
  HiOutlineXCircle,
  HiOutlineUsers,
  HiOutlineUserAdd,
  HiOutlineClock,
  HiOutlineMail,
  HiOutlineChatAlt,
  HiOutlineCurrencyEuro,
  HiOutlineChartBar,
  HiOutlineLink,
} from "react-icons/hi";
import { useAuth } from "../../auth/AuthContext";
import UserAvatar from "../../components/UserAvatar";
import ThemeToggle from "../../components/ThemeToggle";
import { getMe } from "../../api/users";
import { getPendingBusinessCount, listBusinesses } from "../../api/businesses";
import {
  getStoredWorkspaceId,
  setStoredWorkspaceId,
  clearWorkspaceId,
} from "../../auth/session";
import {
  isCustomerRole,
  canAccessMyBusinessesNav,
  isAdminRole,
  normalizeRole,
  isStaffRole,
  isTenantAccount,
} from "../../utils/roles";
import "./dashboard.css";

const customerLinks = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect
          x="1.5"
          y="1.5"
          width="6"
          height="6"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="10.5"
          y="1.5"
          width="6"
          height="6"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="1.5"
          y="10.5"
          width="6"
          height="6"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="10.5"
          y="10.5"
          width="6"
          height="6"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    ),
    end: true,
  },
  {
    to: "/dashboard/bookings",
    label: "My Bookings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect
          x="2"
          y="3"
          width="14"
          height="13"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M2 7H16" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M6 1V4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M12 1V4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: "/dashboard/my-calendar",
    label: "My Calendar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect
          x="2"
          y="3"
          width="14"
          height="13"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M2 7H16" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M6 1V4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M12 1V4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="6" cy="11" r="1" fill="currentColor" />
        <circle cx="12" cy="11" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: "/dashboard/spending",
    label: "Spending",
    icon: <HiOutlineCurrencyEuro size={18} />,
  },
  {
    to: "/dashboard/reviews",
    label: "My Reviews",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M9 1L11.47 6.01L17 6.82L13 10.72L13.94 16.24L9 13.67L4.06 16.24L5 10.72L1 6.82L6.53 6.01L9 1Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: "/dashboard/profile",
    label: "Profile",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2.5 15.5C2.5 12.46 5.46 10 9 10C12.54 10 15.5 12.46 15.5 15.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * Accordion: at most one of workspace | bookings | business may be expanded.
   * Prevents Bookings and My Business (and Workspace) staying open together.
   */
  const [openSidebarGroup, setOpenSidebarGroup] = useState(
    /** @type {null | "workspace" | "bookings" | "business"} */ (null),
  );
  const toggleSidebarGroup = useCallback(
    (/** @type {"workspace" | "bookings" | "business"} */ key) => {
      setOpenSidebarGroup((cur) => (cur === key ? null : key));
    },
    [],
  );
  /** Top bar user menu (Home / Find & Book / Logout) */
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  /** Admin — businesses waiting for approval (sidebar badge). */
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  /** Tenant — multi-business workspace: loading | ready | pick | empty */
  const [tenantWorkspaceState, setTenantWorkspaceState] = useState("loading");
  const [tenantWorkspaces, setTenantWorkspaces] = useState([]);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() =>
    getStoredWorkspaceId(),
  );
  const { user: authUser, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useMemo(() => {
    if (!authUser) return null;
    const name = authUser.name?.trim() || "User";
    const raw = authUser.avatar && String(authUser.avatar).trim();
    return {
      ...authUser,
      name,
      avatar: raw || "",
      businessName: authUser.businessName ?? null,
    };
  }, [authUser]);

  const isTenantOwner = useMemo(
    () => normalizeRole(user?.role) === "tenant",
    [user?.role],
  );

  /** Effective plan limits from API (tenant owner or staff inherit owner's workspace limits). */
  const subLimits = user?.subscription?.limits;
  const subIsAdmin = Boolean(user?.subscription?.isAdmin);

  const links = (() => {
    if (!user?.role || isCustomerRole(user.role)) {
      return customerLinks;
    }
    if (isStaffRole(user.role)) {
      return [
        {
          to: "/dashboard",
          label: "Dashboard",
          icon: <HiOutlineViewGrid size={18} />,
          end: true,
        },
        {
          to: "/dashboard/profile",
          label: "Profile",
          icon: <HiOutlineUser size={18} />,
        },
      ];
    }
    const overview = {
      to: "/dashboard",
      label: "Dashboard",
      icon: <HiOutlineViewGrid size={18} />,
      end: true,
    };
    const adminApprovals = {
      kind: "adminApprovals",
      to: "/dashboard/admin/business-approvals",
      label: "Business approvals",
      icon: <HiOutlineShieldCheck size={18} />,
    };
    const adminNewsletter = {
      to: "/dashboard/admin/newsletter-subscribers",
      label: "Newsletter",
      icon: <HiOutlineMail size={18} />,
    };
    const adminUsers = {
      to: "/dashboard/admin/admin-users",
      label: "Admins",
      icon: <HiOutlineUserAdd size={18} />,
    };
    const adminContactMessages = {
      to: "/dashboard/admin/contact-messages",
      label: "Contact messages",
      icon: <HiOutlineChatAlt size={18} />,
    };
    const analytics = {
      to: "/dashboard/analytics",
      label: "Analytics",
      icon: <HiOutlineChartBar size={18} />,
    };
    const reviews = {
      to: "/dashboard/reviews",
      label: "Reviews",
      icon: <HiOutlineStar size={18} />,
    };
    const account = {
      to: "/dashboard/profile",
      label: "My Account",
      icon: <HiOutlineUser size={18} />,
    };
    const out = [overview];
    if (isAdminRole(user.role)) {
      out.push(
        adminApprovals,
        adminUsers,
        adminNewsletter,
        adminContactMessages,
      );
    } else {
      if (subIsAdmin || subLimits?.analytics) {
        out.push(analytics);
      }
      out.push(reviews);
    }
    out.push(account);
    return out;
  })();

  useEffect(() => {
    if (!user) return;
    if (isStaffRole(user.role) && user.staffBusinessId) {
      const id = String(user.staffBusinessId).trim();
      if (!id) return;
      if (getStoredWorkspaceId() !== id) {
        setStoredWorkspaceId(id);
        setActiveWorkspaceId(id);
      }
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMe();
        if (!cancelled && data?.user) {
          refreshUser(data.user);
        }
      } catch {
        /* session may be invalid; ProtectedRoute handles auth */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  useLayoutEffect(() => {
    if (!user) return;
    if (!isTenantOwner) {
      setTenantWorkspaceState("ready");
    }
  }, [user, isTenantOwner]);

  useEffect(() => {
    if (!user) return;
    if (!isTenantOwner) {
      setTenantWorkspaces([]);
      return;
    }
    let cancelled = false;
    setTenantWorkspaceState("loading");
    (async () => {
      try {
        const { data } = await listBusinesses({ scope: "mine" });
        const list = Array.isArray(data.businesses) ? data.businesses : [];
        if (cancelled) return;
        setTenantWorkspaces(list);
        const ids = list.map((b) => String(b.id ?? b._id));
        if (list.length === 0) {
          clearWorkspaceId();
          setActiveWorkspaceId(null);
          setTenantWorkspaceState("empty");
          return;
        }
        if (list.length === 1) {
          const id = ids[0];
          setStoredWorkspaceId(id);
          setActiveWorkspaceId(id);
          setTenantWorkspaceState("ready");
          return;
        }
        /**
         * Multi-business: restore previously selected workspace on refresh
         * when it still exists, otherwise ask user to pick again.
         */
        const storedId = String(getStoredWorkspaceId() || "").trim();
        const currentId = String(activeWorkspaceId || "").trim();
        const restoredId =
          (currentId && ids.includes(currentId) && currentId) ||
          (storedId && ids.includes(storedId) && storedId) ||
          null;
        if (restoredId) {
          if (storedId !== restoredId) setStoredWorkspaceId(restoredId);
          setActiveWorkspaceId(restoredId);
          setTenantWorkspaceState("ready");
          return;
        }
        clearWorkspaceId();
        setActiveWorkspaceId(null);
        setTenantWorkspaceState("pick");
      } catch {
        if (!cancelled) setTenantWorkspaceState("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isTenantOwner, activeWorkspaceId, workspaceVersion]);

  useEffect(() => {
    const onBusinessesChanged = () => {
      setWorkspaceVersion((v) => v + 1);
    };
    window.addEventListener("appointly:businesses-changed", onBusinessesChanged);
    return () => {
      window.removeEventListener(
        "appointly:businesses-changed",
        onBusinessesChanged,
      );
    };
  }, []);

  useEffect(() => {
    if (!isAdminRole(user?.role)) {
      setPendingApprovalCount(0);
      return undefined;
    }
    const fetchPending = async () => {
      try {
        const { data } = await getPendingBusinessCount();
        const n = data?.pendingCount;
        setPendingApprovalCount(typeof n === "number" && n >= 0 ? n : 0);
      } catch {
        setPendingApprovalCount(0);
      }
    };
    fetchPending();
    const onChanged = () => fetchPending();
    window.addEventListener("appointly:pending-count-changed", onChanged);
    const interval = setInterval(fetchPending, 45000);
    return () => {
      window.removeEventListener("appointly:pending-count-changed", onChanged);
      clearInterval(interval);
    };
  }, [user?.role]);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleWorkspaceSelect = useCallback((id) => {
    setStoredWorkspaceId(id);
    setActiveWorkspaceId(id);
    setTenantWorkspaceState("ready");
    window.dispatchEvent(
      new CustomEvent("appointly:workspace-changed", { detail: { id } }),
    );
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith("/dashboard/bookings")) {
      setOpenSidebarGroup("bookings");
      return;
    }
    if (
      p.startsWith("/dashboard/businesses") ||
      p.startsWith("/dashboard/manage")
    ) {
      setOpenSidebarGroup("business");
      return;
    }
    setOpenSidebarGroup((prev) => {
      if (prev === "bookings" || prev === "business") return null;
      return prev;
    });
  }, [location.pathname]);

  const path = location.pathname;
  /** List page only — single-business edit/hub routes use Services/Staff/etc. */
  const myBusinessesNavActive = path === "/dashboard/businesses";
  const createBusinessNavActive = path === "/dashboard/businesses/new";
  const servicesHubNavActive =
    path === "/dashboard/manage/services" ||
    /\/businesses\/[^/]+\/services$/.test(path);
  const staffHubNavActive =
    path === "/dashboard/manage/staff" ||
    /\/businesses\/[^/]+\/staff$/.test(path);
  const staffRankingHubNavActive =
    path === "/dashboard/manage/staff-ranking" ||
    /\/businesses\/[^/]+\/staff-ranking$/.test(path);
  const couponsHubNavActive =
    path === "/dashboard/manage/coupons" ||
    /\/businesses\/[^/]+\/coupons$/.test(path);

  /**
   * Routes that belong to the user's account, not to any single business.
   * The "Preparing your workspace…" skeleton is only relevant for pages
   * that read `activeWorkspaceId` (overview, tenant bookings, customers,
   * closing-days, etc.). Account-level pages render immediately so visiting
   * /dashboard/profile doesn't flash the skeleton for ~half a second.
   */
  const isAccountScopedRoute =
    path === "/dashboard/profile" ||
    path === "/dashboard/businesses" ||
    path === "/dashboard/businesses/new";
  const isCreateBusinessRoute = path === "/dashboard/businesses/new";
  const showCreateWorkspaceModal =
    isTenantOwner && tenantWorkspaceState === "empty" && !isCreateBusinessRoute;

  useEffect(() => {
    const root = document.getElementById("root");
    document.documentElement.classList.add("db-page-html");
    document.body.classList.add("db-page-body");
    root?.classList.add("db-page-root");
    return () => {
      document.documentElement.classList.remove("db-page-html");
      document.body.classList.remove("db-page-body");
      root?.classList.remove("db-page-root");
    };
  }, []);

  if (!user) {
    return null;
  }

  const showWorkspacePlanPill =
    Boolean(user.subscription?.planId) &&
    !isAdminRole(user.role) &&
    (isTenantAccount(user.role) || isStaffRole(user.role));

  function renderWorkspacePlanPill(variant) {
    if (!showWorkspacePlanPill) return null;
    const isSidebar = variant === "sidebar";
    return (
      <Link
        to="/pricing"
        className={`db-plan-pill ${isSidebar ? "db-plan-pill--sidebar" : "db-plan-pill--topbar"}`}
        title="View plans and billing (demo checkout)"
        onClick={isSidebar ? () => setSidebarOpen(false) : undefined}
      >
        <span className="db-plan-pill-label">
          {subLimits?.label || user.subscription.planId}
        </span>
        <span className="db-plan-pill-billing">
          {user.subscription.billing === "yearly" ? "Yearly" : "Monthly"}
        </span>
      </Link>
    );
  }

  return (
    <div className="db-layout">
      {/* Mobile overlay */}
      <div
        className={`db-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`db-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="db-sidebar-header">
          <div className="db-user-info">
            <UserAvatar
              name={user.name}
              src={user.avatar}
              className="db-user-avatar"
              alt={user.name}
            />
            <div>
              <span className="db-user-name">{user.name}</span>
            </div>
          </div>
          {/* {showWorkspacePlanPill ? (
            <div className="db-sidebar-plan">{renderWorkspacePlanPill("sidebar")}</div>
          ) : null} */}
        </div>

        <nav className="db-nav">
          {isTenantOwner &&
          tenantWorkspaceState === "ready" &&
          tenantWorkspaces.length > 0 ? (
            tenantWorkspaces.length > 1 ? (
              <div
                className={`db-nav-group db-nav-group--workspace ${openSidebarGroup === "workspace" ? "open" : ""}`}
              >
                <button
                  type="button"
                  className="db-nav-group-toggle db-nav-group-toggle--brand"
                  onClick={() => toggleSidebarGroup("workspace")}
                  aria-expanded={openSidebarGroup === "workspace"}
                >
                  <span className="db-nav-group-toggle-label">
                    <HiOutlineOfficeBuilding size={18} />
                    Workspace
                  </span>
                  <HiOutlineChevronDown className="db-nav-chevron" size={16} />
                </button>
                {openSidebarGroup === "workspace" ? (
                  <div className="db-nav-group-items">
                    {tenantWorkspaces.map((b) => {
                      const bid = String(b.id ?? b._id);
                      const isActive = activeWorkspaceId === bid;
                      return (
                        <button
                          key={bid}
                          type="button"
                          className={`db-nav-link db-nav-link--sub${isActive ? " active" : ""}`}
                          onClick={() => {
                            handleWorkspaceSelect(bid);
                            setSidebarOpen(false);
                          }}
                          aria-current={isActive ? "true" : undefined}
                        >
                          <span className="db-nav-icon">
                            <HiOutlineOfficeBuilding size={16} />
                          </span>
                          <span className="db-workspace-name">
                            {b.name?.trim() || "Business"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="db-nav-group db-nav-group--workspace db-nav-group--workspace-single">
                <div className="db-nav-group-title db-nav-group-toggle db-nav-group-toggle--brand">
                  <span className="db-nav-group-toggle-label">
                    <HiOutlineOfficeBuilding size={18} />
                    Workspace
                  </span>
                </div>
                <div className="db-nav-group-items">
                  <button
                    type="button"
                    className="db-nav-link db-nav-link--sub active"
                    onClick={() => setSidebarOpen(false)}
                    aria-current="true"
                  >
                    <span className="db-nav-icon">
                      <HiOutlineOfficeBuilding size={16} />
                    </span>
                    <span className="db-workspace-name">
                      {tenantWorkspaces[0]?.name?.trim() || "Business"}
                    </span>
                  </button>
                </div>
              </div>
            )
          ) : null}
          {links.map((link) =>
            link.kind === "adminApprovals" ? (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `db-nav-link db-nav-link--row ${isActive ? "active" : ""}`
                }
              >
                <span className="db-nav-icon">{link.icon}</span>
                <span className="db-nav-link-label">{link.label}</span>
                {pendingApprovalCount > 0 ? (
                  <span
                    className="db-nav-badge db-nav-badge--pulse"
                    aria-label={`${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? "" : "s"}`}
                  >
                    {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
                  </span>
                ) : null}
              </NavLink>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `db-nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="db-nav-icon">{link.icon}</span>
                <span>{link.label}</span>
              </NavLink>
            ),
          )}
          {isTenantAccount(user.role) || isStaffRole(user.role) ? (
            <div
              className={`db-nav-group ${openSidebarGroup === "bookings" ? "open" : ""}`}
            >
              <button
                type="button"
                className="db-nav-group-toggle db-nav-group-toggle--brand"
                onClick={() => toggleSidebarGroup("bookings")}
                aria-expanded={openSidebarGroup === "bookings"}
              >
                <span className="db-nav-group-toggle-label">
                  <HiOutlineCalendar size={18} />
                  Bookings
                </span>
                <HiOutlineChevronDown className="db-nav-chevron" size={16} />
              </button>
              {openSidebarGroup === "bookings" ? (
                <div className="db-nav-group-items">
                  <NavLink
                    to="/dashboard/bookings"
                    end
                    className={({ isActive }) =>
                      `db-nav-link db-nav-link--sub ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <HiOutlineClipboardList size={16} />
                    </span>
                    <span>Active</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/bookings/all"
                    className={({ isActive }) =>
                      `db-nav-link db-nav-link--sub ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <HiOutlineClipboardList size={16} />
                    </span>
                    <span>All bookings</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/bookings/completed"
                    className={({ isActive }) =>
                      `db-nav-link db-nav-link--sub ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <HiOutlineClipboardList size={16} />
                    </span>
                    <span>Completed</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/bookings/no-shows"
                    className={({ isActive }) =>
                      `db-nav-link db-nav-link--sub ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <HiOutlineBan size={16} />
                    </span>
                    <span>No-shows</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/bookings/cancelled"
                    className={({ isActive }) =>
                      `db-nav-link db-nav-link--sub ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <HiOutlineXCircle size={16} />
                    </span>
                    <span>Cancelled</span>
                  </NavLink>
                </div>
              ) : null}
            </div>
          ) : null}
          {isTenantAccount(user.role) ? (
            <NavLink
              to="/dashboard/customers"
              className={({ isActive }) =>
                `db-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="db-nav-icon">
                <HiOutlineUsers size={18} />
              </span>
              <span>Customers</span>
            </NavLink>
          ) : null}
          {isTenantAccount(user.role) ? (
            <NavLink
              to="/dashboard/closing-days"
              className={({ isActive }) =>
                `db-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="db-nav-icon">
                <HiOutlineClock size={18} />
              </span>
              <span>Closing days</span>
            </NavLink>
          ) : null}
          {isTenantAccount(user.role) ? (
            <NavLink
              to="/dashboard/email-integration"
              className={({ isActive }) =>
                `db-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="db-nav-icon">
                <HiOutlineMail size={18} />
              </span>
              <span>Email integration</span>
            </NavLink>
          ) : null}
          {isTenantAccount(user.role) ? (
            subIsAdmin || subLimits?.webhooks ? (
              <NavLink
                to="/dashboard/webhooks"
                className={({ isActive }) =>
                  `db-nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="db-nav-icon">
                  <HiOutlineLink size={18} />
                </span>
                <span>Webhooks</span>
              </NavLink>
            ) : (
              <Link
                to="/pricing"
                className="db-nav-link db-nav-link--upgrade"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="db-nav-icon">
                  <HiOutlineLink size={18} />
                </span>
                <span>Webhooks</span>
                <span className="db-nav-upgrade-pill">Upgrade</span>
              </Link>
            )
          ) : null}
          {canAccessMyBusinessesNav(user.role) ? (
            <div
              className={`db-nav-group ${openSidebarGroup === "business" ? "open" : ""}`}
            >
              <button
                type="button"
                className="db-nav-group-toggle db-nav-group-toggle--brand"
                onClick={() => toggleSidebarGroup("business")}
                aria-expanded={openSidebarGroup === "business"}
              >
                <span className="db-nav-group-toggle-label">
                  <HiOutlineOfficeBuilding size={18} />
                  My Business
                </span>
                <HiOutlineChevronDown className="db-nav-chevron" size={16} />
              </button>
              {openSidebarGroup === "business" ? (
                <div className="db-nav-group-items">
                  <NavLink
                    to="/dashboard/businesses"
                    end
                    className={() =>
                      `db-nav-link db-nav-link--sub ${myBusinessesNavActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <HiOutlineClipboardList size={16} />
                    </span>
                    <span>My Businesses</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/businesses/new"
                    className={() =>
                      `db-nav-link db-nav-link--sub ${createBusinessNavActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M8 3V13M3 8H13"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span>Create business</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/manage/services"
                    className={() =>
                      `db-nav-link db-nav-link--sub ${servicesHubNavActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <rect
                          x="2"
                          y="3"
                          width="12"
                          height="10"
                          rx="1.5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                        <path
                          d="M5 7H11M5 10H9"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span>Services</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/manage/staff"
                    className={() =>
                      `db-nav-link db-nav-link--sub ${staffHubNavActive ? "active" : ""}`
                    }
                  >
                    <span className="db-nav-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <circle
                          cx="8"
                          cy="5"
                          r="2.5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                        <path
                          d="M3 14C3 11.5 5.2 9.5 8 9.5C10.8 9.5 13 11.5 13 14"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span>Staff</span>
                  </NavLink>
                  {subIsAdmin || subLimits?.smartRanking ? (
                    <NavLink
                      to="/dashboard/manage/staff-ranking"
                      className={() =>
                        `db-nav-link db-nav-link--sub ${staffRankingHubNavActive ? "active" : ""}`
                      }
                    >
                      <span className="db-nav-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 13V4C3 3.45 3.45 3 4 3H9L13 7V12C13 12.55 12.55 13 12 13H4C3.45 13 3 12.55 3 12V13Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9 3V7H13"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M5 10H11M5 7.5H8"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span>Smart ranking</span>
                    </NavLink>
                  ) : (
                    <Link
                      to="/pricing"
                      className="db-nav-link db-nav-link--sub db-nav-link--upgrade"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="db-nav-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 13V4C3 3.45 3.45 3 4 3H9L13 7V12C13 12.55 12.55 13 12 13H4C3.45 13 3 12.55 3 12V13Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9 3V7H13"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M5 10H11M5 7.5H8"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span>Smart ranking</span>
                      <span className="db-nav-upgrade-pill">Upgrade</span>
                    </Link>
                  )}
                  {subIsAdmin || subLimits?.coupons ? (
                    <NavLink
                      to="/dashboard/manage/coupons"
                      className={() =>
                        `db-nav-link db-nav-link--sub ${couponsHubNavActive ? "active" : ""}`
                      }
                    >
                      <span className="db-nav-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 6.5L8 3L13 6.5V6.5C13 6.5 13 11 8 13C3 11 3 6.5 3 6.5V6.5Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6 8.5L7.5 10L10 7"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span>Coupons</span>
                    </NavLink>
                  ) : (
                    <Link
                      to="/pricing"
                      className="db-nav-link db-nav-link--sub db-nav-link--upgrade"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="db-nav-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 6.5L8 3L13 6.5V6.5C13 6.5 13 11 8 13C3 11 3 6.5 3 6.5V6.5Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6 8.5L7.5 10L10 7"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span>Coupons</span>
                      <span className="db-nav-upgrade-pill">Upgrade</span>
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          {isAdminRole(user?.role) ? (
            <>
              <div className="db-nav-divider" />
              <NavLink
                to="/dashboard/admin/categories"
                className={({ isActive }) =>
                  `db-nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="db-nav-icon">
                  <HiOutlineTag size={18} />
                </span>
                <span>Categories</span>
              </NavLink>
              <NavLink
                to="/dashboard/admin/locations"
                className={({ isActive }) =>
                  `db-nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="db-nav-icon">
                  <HiOutlineLocationMarker size={18} />
                </span>
                <span>Locations</span>
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="db-sidebar-footer">
          <button
            type="button"
            className="db-logout-btn"
            onClick={handleLogout}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M6.5 16H3.5C2.67 16 2 15.33 2 14.5V3.5C2 2.67 2.67 2 3.5 2H6.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M12 13L16 9L12 5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 9H6"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="db-main">
        <header className="db-topbar">
          <button className="db-hamburger" onClick={() => setSidebarOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M3 6H19M3 11H19M3 16H19"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="db-topbar-right">
            {renderWorkspacePlanPill("topbar")}
            <ThemeToggle variant="ghost" />
            <div
              className={`db-user-menu ${userMenuOpen ? "open" : ""}`}
              ref={userMenuRef}
            >
              <button
                type="button"
                className="db-user-menu-trigger"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                aria-label={`Account menu (${user.name})`}
              >
                <span className="db-user-menu-trigger-label">
                  <span className="db-user-menu-trigger-name">{user.name}</span>
                </span>
                <HiOutlineChevronDown
                  size={16}
                  className="db-user-menu-chevron"
                  aria-hidden
                />
              </button>
              {userMenuOpen ? (
                <div className="db-user-menu-panel" role="menu">
                  <div className="db-user-menu-info" role="none">
                    <span className="db-user-menu-info-name">{user.name}</span>
                    <span className="db-user-menu-info-email">
                      {user.email?.trim() || "—"}
                    </span>
                  </div>
                  <div className="db-user-menu-divider" />
                  <Link
                    to="/"
                    className="db-user-menu-item"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M2 7L9 1L16 7V16H11V11H7V16H2V7Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Home
                  </Link>
                  <Link
                    to="/book"
                    className="db-user-menu-item"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      aria-hidden
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M12 12L16 16"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Find &amp; Booking
                  </Link>
                  <div className="db-user-menu-divider" />
                  <button
                    type="button"
                    className="db-user-menu-item db-user-menu-item--danger"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    <HiOutlineLogout size={18} strokeWidth={1.5} aria-hidden />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="db-content">
          {isTenantOwner &&
          tenantWorkspaceState === "loading" &&
          !isAccountScopedRoute ? (
            <div
              className="db-ws-loading"
              aria-busy="true"
              aria-live="polite"
              aria-label="Loading workspace"
            >
              <div className="db-ws-skel-header">
                <span className="db-skeleton db-skeleton--title" />
                <span className="db-skeleton db-skeleton--subtitle" />
              </div>
              <div className="db-ws-skel-stats">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="db-ws-skel-stat">
                    <span className="db-skeleton db-skeleton--icon" />
                    <div className="db-ws-skel-stat-text">
                      <span className="db-skeleton db-skeleton--value" />
                      <span className="db-skeleton db-skeleton--label" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="db-ws-skel-panels">
                <div className="db-ws-skel-panel">
                  <span className="db-skeleton db-skeleton--panel-title" />
                  <span className="db-skeleton db-skeleton--line" />
                  <span className="db-skeleton db-skeleton--line db-skeleton--line-short" />
                  <span className="db-skeleton db-skeleton--line" />
                </div>
                <div className="db-ws-skel-panel">
                  <span className="db-skeleton db-skeleton--panel-title" />
                  <span className="db-skeleton db-skeleton--line" />
                  <span className="db-skeleton db-skeleton--line db-skeleton--line-short" />
                </div>
              </div>
              <p className="db-ws-loading-caption">Preparing your workspace…</p>
            </div>
          ) : isTenantOwner &&
            (tenantWorkspaceState === "pick" ||
              (tenantWorkspaceState === "empty" && !isAccountScopedRoute)) &&
            !isAccountScopedRoute ? null : (
            <Outlet
              context={{
                user,
                workspaces: tenantWorkspaces,
                activeWorkspaceId,
                selectWorkspace: handleWorkspaceSelect,
              }}
            />
          )}
        </div>
      </div>

      {isTenantOwner && tenantWorkspaceState === "pick" ? (
        <div
          className="db-ws-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="db-ws-title"
        >
          <div className="db-ws-modal">
            <h2 id="db-ws-title">Choose a workspace</h2>
            <p className="db-ws-sub">
              You have more than one business. Pick which one to manage — staff,
              services, and bookings stay separate per workspace.
            </p>
            <ul className="db-ws-list">
              {tenantWorkspaces.map((b) => {
                const bid = String(b.id ?? b._id);
                return (
                  <li key={bid}>
                    <button
                      type="button"
                      className="db-ws-item"
                      onClick={() => handleWorkspaceSelect(bid)}
                    >
                      <HiOutlineOfficeBuilding size={22} aria-hidden />
                      <span>{b.name?.trim() || "Business"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="db-ws-logout"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
      {showCreateWorkspaceModal ? (
        <div
          className="db-ws-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="db-ws-empty-title"
        >
          <div className="db-ws-modal">
            <h2 id="db-ws-empty-title">Create your first business</h2>
            <p className="db-ws-sub">
              You do not have a workspace yet. Create your first business to
              start managing services, staff, and bookings from your dashboard.
            </p>
            <div className="db-ws-actions">
              <Link
                to="/dashboard/businesses/new"
                className="db-ws-item db-ws-item--primary"
              >
                <HiOutlineOfficeBuilding size={20} aria-hidden />
                <span>Create first business</span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
