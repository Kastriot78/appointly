import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineUserCircle,
  HiOutlineViewGrid,
  HiOutlineLogout,
} from "react-icons/hi";
import { useAuth } from "../auth/AuthContext";
import HeaderUserMenu from "./HeaderUserMenu";
import ThemeToggle from "./ThemeToggle";
import RightArrow from "../assets/right-arrow.svg";

const MOBILE_NAV_LINKS = [
  { kind: "route", to: "/book", label: "Find & Book" },
  { kind: "route", to: "/how-it-works", label: "How It Works" },
  { kind: "route", to: "/about", label: "What We Offer" },
  { kind: "route", to: "/pricing", label: "Pricing" },
  { kind: "route", to: "/contact", label: "Contact" },
  { kind: "route", to: "/faq", label: "FAQ" },
];

const Header = () => {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen((o) => !o);
  const close = () => setIsOpen(false);

  const handleMobileLogout = () => {
    logout();
    close();
    navigate("/", { replace: true });
  };

  const displayEmail =
    user && ((user.email || user.pendingEmail || "").trim() || null);

  return (
    <header className="header">
      <div className="container">
        <div className="wrapper">
          <Link to="/" className="header-logo">
            <img src="/appointly-logo.png" alt="Logo" />
          </Link>
          <div className="list">
            <ul>
              <li>
                <NavLink to="/book">Find & Book</NavLink>
              </li>
              <li>
                <NavLink to="/how-it-works">How It Works</NavLink>
              </li>
              <li>
                <NavLink to="/about">What We Offer</NavLink>
              </li>
              <li>
                <NavLink to="/pricing">Pricing</NavLink>
              </li>
              <li>
                <NavLink to="/contact">Contact</NavLink>
              </li>
              <li>
                <NavLink to="/faq">FAQ</NavLink>
              </li>
            </ul>
          </div>
          <button
            className={`hamburger ${isOpen ? "open" : ""}`}
            onClick={toggle}
            aria-label="Toggle menu"
          >
            <span className="hamburger__line" />
            <span className="hamburger__line" />
            <span className="hamburger__line" />
          </button>
          <div className="right-buttons">
            <ThemeToggle />
            {!ready ? (
              <div className="header-auth-slot" aria-hidden />
            ) : user ? (
              <HeaderUserMenu />
            ) : (
              <Link to="/sign-in" className="sign_in_btn btn btn-link">
                Sign In <img src={RightArrow} alt="" />
              </Link>
            )}
          </div>
        </div>
      </div>
      <div
        className={`mobile-overlay ${isOpen ? "open" : ""}`}
        onClick={close}
        aria-hidden="true"
      />
      <nav className={`mobile-nav ${isOpen ? "open" : ""}`} id="sidebar">
        <div className="mobile-nav__header d-flex justify-content-between align-items-center">
          <Link to="/" onClick={close}>
            <img src="/appointly-logo.png" alt="Logo" style={{ height: 45 }} />
          </Link>
          <button
            className="mobile-nav__close btn"
            onClick={close}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <ul className="mobile-nav__links">
          {MOBILE_NAV_LINKS.map((item, i) => (
            <li
              key={item.label}
              className="mobile-nav__item"
              style={{ transitionDelay: `${(i + 1) * 0.15}s` }}
            >
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `nav-scroll${isActive ? " active" : ""}`
                }
                onClick={close}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mobile-nav__footer-tools">
          <ThemeToggle />
        </div>
        <div className="mobile-nav__buttons d-grid gap-2 mt-4">
          {ready && user ? (
            <>
              <div className="mobile-nav__account">
                <HiOutlineUserCircle
                  size={36}
                  strokeWidth={1.5}
                  className="mobile-nav__account-icon"
                  aria-hidden
                />
                <div className="mobile-nav__account-text">
                  <span className="mobile-nav__account-name">{user.name}</span>
                  {displayEmail ? (
                    <span className="mobile-nav__account-email">
                      {displayEmail}
                    </span>
                  ) : null}
                </div>
              </div>
              <Link
                to="/dashboard"
                className="sign_in_btn btn btn-light mobile-nav__action-btn"
                onClick={close}
              >
                <HiOutlineViewGrid size={18} strokeWidth={1.5} aria-hidden />
                Dashboard
              </Link>
              <button
                type="button"
                className="btn btn-outline-secondary w-100 mobile-nav__action-btn mobile-nav__action-btn--logout"
                onClick={handleMobileLogout}
              >
                <HiOutlineLogout size={18} strokeWidth={1.5} aria-hidden />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/sign-in"
                className="sign_in_btn btn btn-light"
                onClick={close}
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Header;
