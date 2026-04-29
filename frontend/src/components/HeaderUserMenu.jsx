import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineUserCircle,
  HiOutlineChevronDown,
  HiOutlineViewGrid,
  HiOutlineLogout,
} from "react-icons/hi";
import { useAuth } from "../auth/AuthContext";
import { usePrefersFineHover } from "../hooks/usePrefersFineHover";

const ICON_SIZE = 18;

const HeaderUserMenu = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fineHover = usePrefersFineHover();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (fineHover) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [fineHover]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate("/", { replace: true });
  };

  const handleTriggerClick = () => {
    if (!fineHover) setOpen((o) => !o);
  };

  if (!user) return null;

  const displayEmail =
    (user.email || user.pendingEmail || "").trim() || null;

  return (
    <div
      className="header-user-wrap"
      ref={wrapRef}
      onMouseEnter={() => fineHover && setOpen(true)}
      onMouseLeave={() => fineHover && setOpen(false)}
    >
      <button
        type="button"
        className="header-user-trigger"
        onClick={handleTriggerClick}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <HiOutlineUserCircle size={22} strokeWidth={1.5} aria-hidden />
        <span className="header-user-trigger__name">{user.name}</span>
        <HiOutlineChevronDown
          size={16}
          className={`header-user-trigger__chev ${open ? "is-open" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="header-user-dropdown" role="menu">
          {displayEmail ? (
            <div className="header-user-dropdown__meta">
              <span className="header-user-dropdown__meta-label">Signed in as</span>
              <span className="header-user-dropdown__meta-email">{displayEmail}</span>
            </div>
          ) : null}
          <Link
            to="/dashboard"
            role="menuitem"
            className="header-user-dropdown__item"
            onClick={() => setOpen(false)}
          >
            <HiOutlineViewGrid size={ICON_SIZE} strokeWidth={1.5} aria-hidden />
            <span>Dashboard</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            className="header-user-dropdown__item header-user-dropdown__item--danger"
            onClick={handleLogout}
          >
            <HiOutlineLogout size={ICON_SIZE} strokeWidth={1.5} aria-hidden />
            <span>Logout</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default HeaderUserMenu;
