import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const ProtectedRoute = () => {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return <div className="protected-route-loading">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
