import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function RouteScrollRestoration() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (prefersReducedMotion()) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [pathname]);

  return null;
}
