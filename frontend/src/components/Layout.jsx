import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import ScrollToTop from "./ScrollToTop";
import "./ScrollToTop.css";
import Footer from "./Footer";

const Layout = () => {
  const location = useLocation();
  const isDashboardRoute = location.pathname.startsWith("/dashboard");

  return (
    <>
      <Header />
      <main
        className={`app-main${isDashboardRoute ? " app-main--dashboard" : ""}`}
      >
        <Outlet />
      </main>
      <Footer />
      <ScrollToTop />
    </>
  );
};

export default Layout;
