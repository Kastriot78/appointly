import { Outlet } from "react-router-dom";
import Header from "./Header";
import ScrollToTop from "./ScrollToTop";
import "./ScrollToTop.css";
import Footer from "./Footer";

const Layout = () => (
  <>
    <Header />
    <Outlet />
    <Footer />
    <ScrollToTop />
  </>
);

export default Layout
