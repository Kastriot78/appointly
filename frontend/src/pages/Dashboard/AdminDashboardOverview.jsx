import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import {
  HiOutlineShieldCheck,
  HiOutlineUserAdd,
  HiOutlineMail,
  HiOutlineChatAlt,
  HiOutlineTag,
  HiOutlineLocationMarker,
  HiHand,
} from "react-icons/hi";
import { getPendingBusinessCount } from "../../api/businesses";
import "./dashboard-overview.css";


export default function AdminDashboardOverview() {
  const { user } = useOutletContext();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await getPendingBusinessCount();
        const n = data?.pendingCount;
        if (!cancelled) {
          setPendingCount(typeof n === "number" && n >= 0 ? n : 0);
        }
      } catch {
        if (!cancelled) setPendingCount(0);
      }
    };
    load();
    const onChanged = () => load();
    window.addEventListener("appointly:pending-count-changed", onChanged);
    const interval = setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.removeEventListener(
        "appointly:pending-count-changed",
        onChanged,
      );
      clearInterval(interval);
    };
  }, []);

  const firstName =
    (user?.name || "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="dp-page dp-overview">
      <div className="dp-header">
        <div>
          <h1 className="dp-title">
            Administration{" "}
            <HiHand
              size={28}
              style={{
                display: "inline",
                verticalAlign: "middle",
                color: "#f59e0b",
              }}
            />
          </h1>
          <p className="dp-subtitle">
            Hi {firstName} — you&apos;re signed in as a platform administrator.
          </p>
        </div>
      </div>

      <p className="dp-subtitle dp-admin-hint">
        Use the tools below for approvals, messages, and global catalog data.
        To create or run a business (bookings, services, customers), sign in
        with a tenant account — admins do not operate inside tenant
        workspaces from here.
      </p>

      <div className="dp-quick-actions">
        <h3 className="dp-section-heading">Platform tools</h3>
        <div className="dp-actions-grid">
          <Link
            to="/dashboard/admin/business-approvals"
            className="dp-quick-card dp-admin-card"
          >
            {pendingCount > 0 ? (
              <span
                className="dp-admin-card-badge"
                aria-label={`${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}`}
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            ) : null}
            <HiOutlineShieldCheck size={28} />
            <span>Business approvals</span>
          </Link>
          <Link
            to="/dashboard/admin/newsletter-subscribers"
            className="dp-quick-card dp-admin-card"
          >
            <HiOutlineMail size={28} />
            <span>Newsletter</span>
          </Link>
          <Link
            to="/dashboard/admin/admin-users"
            className="dp-quick-card dp-admin-card"
          >
            <HiOutlineUserAdd size={28} />
            <span>Admins</span>
          </Link>
          <Link
            to="/dashboard/admin/contact-messages"
            className="dp-quick-card dp-admin-card"
          >
            <HiOutlineChatAlt size={28} />
            <span>Contact messages</span>
          </Link>
          <Link
            to="/dashboard/admin/categories"
            className="dp-quick-card dp-admin-card"
          >
            <HiOutlineTag size={28} />
            <span>Categories</span>
          </Link>
          <Link
            to="/dashboard/admin/locations"
            className="dp-quick-card dp-admin-card"
          >
            <HiOutlineLocationMarker size={28} />
            <span>Locations</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
