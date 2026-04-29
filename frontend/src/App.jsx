import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/ToastContext";
import ProtectedRoute from "./components/ProtectedRoute";
import RouteScrollRestoration from "./components/RouteScrollRestoration";
import OfflineStatusBar from "./components/OfflineStatusBar";
import { registerSlotHoldUnloadRelease } from "./utils/slotHoldSession";

const Layout = lazy(() => import("./components/Layout"));
const Home = lazy(() => import("./pages/Home/Home"));
const Pricing = lazy(() => import("./pages/Pricing/Pricing"));
const PricingCheckout = lazy(() => import("./pages/Pricing/PricingCheckout"));
const Faq = lazy(() => import("./pages/Faq/Faq"));
const About = lazy(() => import("./pages/About/About"));
const HowItWorks = lazy(() => import("./pages/HowItWorks/HowItWorks"));
const Contact = lazy(() => import("./pages/Contact/Contact"));
const Book = lazy(() => import("./pages/Book/Book"));
const BusinessProfile = lazy(() => import("./pages/Book/BusinessProfile"));
const SignIn = lazy(() => import("./pages/Auth/SignIn"));
const SignUp = lazy(() => import("./pages/Auth/SignUp"));
const ForgotPassword = lazy(() => import("./pages/Auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/Auth/ResetPassword"));
const StaffInvite = lazy(() => import("./pages/Auth/StaffInvite"));
const NotFound = lazy(() => import("./pages/NotFound/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const MyBookings = lazy(() => import("./pages/Dashboard/MyBookings"));
const MyReviews = lazy(() => import("./pages/Dashboard/MyReviews"));
const Profile = lazy(() => import("./pages/Dashboard/Profile"));
const DashboardOverview = lazy(() =>
  import("./pages/Dashboard/DashboardOverview"),
);
const ServicesManagement = lazy(() =>
  import("./pages/Dashboard/ServicesManagement"),
);
const StaffManagement = lazy(() => import("./pages/Dashboard/StaffManagement"));
const StaffSmartRankingPage = lazy(() =>
  import("./pages/Dashboard/StaffSmartRankingPage"),
);
const Analytics = lazy(() => import("./pages/Dashboard/Analytics"));
const CalendarPage = lazy(() => import("./pages/Dashboard/CalendarPage"));
const BusinessOnboarding = lazy(() =>
  import("./pages/BusinessOnboarding/BusinessOnboarding"),
);
const MyBusinesses = lazy(() => import("./pages/Dashboard/MyBusinesses"));
const BusinessManageHub = lazy(() =>
  import("./pages/Dashboard/BusinessManageHub"),
);
const BusinessEdit = lazy(() => import("./pages/Dashboard/BusinessEdit"));
const AdminCategories = lazy(() => import("./pages/Dashboard/AdminCategories"));
const AdminLocations = lazy(() => import("./pages/Dashboard/AdminLocations"));
const AdminBusinessApprovals = lazy(() =>
  import("./pages/Dashboard/AdminBusinessApprovals"),
);
const AdminManageAdmins = lazy(() =>
  import("./pages/Dashboard/AdminManageAdmins"),
);
const AdminNewsletterSubscribers = lazy(() =>
  import("./pages/Dashboard/AdminNewsletterSubscribers"),
);
const AdminContactMessages = lazy(() =>
  import("./pages/Dashboard/AdminContactMessages"),
);
const BusinessCustomers = lazy(() =>
  import("./pages/Dashboard/BusinessCustomers"),
);
const ClosingDays = lazy(() => import("./pages/Dashboard/ClosingDays"));
const EmailIntegration = lazy(() =>
  import("./pages/Dashboard/EmailIntegration"),
);
const Webhooks = lazy(() => import("./pages/Dashboard/Webhooks"));
const CouponManagement = lazy(() =>
  import("./pages/Dashboard/CouponManagement"),
);
const CustomerSpending = lazy(() =>
  import("./pages/Dashboard/CustomerSpending"),
);
const MyCalendar = lazy(() => import("./pages/Dashboard/MyCalendar"));

function App() {
  useEffect(() => registerSlotHoldUnloadRelease(), []);

  return (
    <BrowserRouter>
      <RouteScrollRestoration />
      <ToastProvider>
        <AuthProvider>
          <OfflineStatusBar />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="book" element={<Book />} />
                <Route path="/book/:id" element={<BusinessProfile />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="pricing/checkout" element={<PricingCheckout />} />
                <Route path="faq" element={<Faq />} />
                <Route path="about" element={<About />} />
                <Route path="how-it-works" element={<HowItWorks />} />
                <Route path="contact" element={<Contact />} />
                <Route path="sign-in" element={<SignIn />} />
                <Route path="sign-up" element={<SignUp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="staff-invite" element={<StaffInvite />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />}>
                  <Route index element={<DashboardOverview />} />
                  <Route path="bookings/:listScope" element={<MyBookings />} />
                  <Route path="bookings" element={<MyBookings />} />
                  <Route path="my-calendar" element={<MyCalendar />} />
                  <Route path="spending" element={<CustomerSpending />} />
                  <Route path="customers" element={<BusinessCustomers />} />
                  <Route path="closing-days" element={<ClosingDays />} />
                  <Route
                    path="email-integration"
                    element={<EmailIntegration />}
                  />
                  <Route path="webhooks" element={<Webhooks />} />
                  <Route path="reviews" element={<MyReviews />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="businesses" element={<MyBusinesses />} />
                  <Route path="manage/:scope" element={<BusinessManageHub />} />
                  <Route
                    path="businesses/:businessId/services"
                    element={<ServicesManagement />}
                  />
                  <Route
                    path="businesses/:businessId/staff"
                    element={<StaffManagement />}
                  />
                  <Route
                    path="businesses/:businessId/staff-ranking"
                    element={<StaffSmartRankingPage />}
                  />
                  <Route
                    path="businesses/:businessId/coupons"
                    element={<CouponManagement />}
                  />
                  <Route path="businesses/:id/edit" element={<BusinessEdit />} />
                  <Route
                    path="businesses/new"
                    element={<BusinessOnboarding />}
                  />
                  <Route
                    path="admin/categories"
                    element={<AdminCategories />}
                  />
                  <Route path="admin/locations" element={<AdminLocations />} />
                  <Route
                    path="admin/business-approvals"
                    element={<AdminBusinessApprovals />}
                  />
                  <Route
                    path="admin/admin-users"
                    element={<AdminManageAdmins />}
                  />
                  <Route
                    path="admin/newsletter-subscribers"
                    element={<AdminNewsletterSubscribers />}
                  />
                  <Route
                    path="admin/contact-messages"
                    element={<AdminContactMessages />}
                  />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
