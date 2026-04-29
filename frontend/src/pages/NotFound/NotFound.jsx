import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
const NotFound = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  return (
    <main className="nf-page">
      <div className="container">
        <div className={`nf-content ${visible ? "visible" : ""}`}>
          <div className="nf-number">
            <span className="nf-4">4</span>
            <div className="nf-circle">
              <div className="nf-face">
                <div className="nf-eyes">
                  <div className="nf-eye" />
                  <div className="nf-eye" />
                </div>
                <div className="nf-mouth" />
              </div>
            </div>
            <span className="nf-4">4</span>
          </div>

          <h1 className="nf-title">Page Not Found</h1>
          <p className="nf-subtitle">
            Oops! The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="nf-actions">
            <Link to="/" className="nf-btn-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 6L8 1L14 6V14H10V10H6V14H2V6Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Go Home
            </Link>
            <Link to="/book" className="nf-btn-secondary">
              Find & Book
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8H13M13 8L9 4M13 8L9 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          <div className="nf-links">
            <span>Or try these:</span>
            <Link to="/pricing">Pricing</Link>
            <Link to="/what-we-offer">Features</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/faq">FAQ</Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
