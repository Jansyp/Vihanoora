import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { CartProvider } from "@/context/CartContext";
import Layout from "@/components/Layout";
import PageLoader, { HomePageLoader } from "@/components/PageLoader";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";

const Home = lazy(() => import("@/pages/Home"));
const CategoryPage = lazy(() => import("@/pages/CategoryPage"));
const ProductPage = lazy(() => import("@/pages/ProductPage"));
const CombosPage = lazy(() => import("@/pages/CombosPage"));
const ComboDetail = lazy(() => import("@/pages/ComboDetail"));
const CartPage = lazy(() => import("@/pages/CartPage"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const OrderSuccess = lazy(() => import("@/pages/OrderSuccess"));
const TrackOrder = lazy(() => import("@/pages/TrackOrder"));
const InstagramLanding = lazy(() => import("@/pages/InstagramLanding"));
const Wishlist = lazy(() => import("@/pages/Wishlist"));
const Login = lazy(() => import("@/pages/Login"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Account = lazy(() => import("@/pages/Account"));
const StaticPage = lazy(() => import("@/pages/StaticPage"));

const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("@/pages/admin/AdminProducts"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminCombos = lazy(() => import("@/pages/admin/AdminCombos"));
const AdminCoupons = lazy(() => import("@/pages/admin/AdminCoupons"));
const AdminCategories = lazy(() => import("@/pages/admin/AdminCategories"));
const AdminBanners = lazy(() => import("@/pages/admin/AdminBanners"));
const AdminAnnouncements = lazy(() => import("@/pages/admin/AdminAnnouncements"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const ShippingLabelPrint = lazy(() => import("@/pages/admin/ShippingLabelPrint"));

const Store = ({ children, fallback = <PageLoader /> }) => (
  <Layout>
    <RouteErrorBoundary>
      <Suspense fallback={fallback}>{children}</Suspense>
    </RouteErrorBoundary>
  </Layout>
);

const Lazy = ({ children }) => (
  <RouteErrorBoundary>
    <Suspense fallback={<PageLoader />}>{children}</Suspense>
  </RouteErrorBoundary>
);

function AppRoutes() {
  const location = useLocation();
  // Emergent Google OAuth callback — process session_id before anything else
  if (location.hash?.includes("session_id=")) return <Lazy><AuthCallback /></Lazy>;

  return (
    <Routes>
      <Route path="/" element={<Store fallback={<HomePageLoader />}><Home /></Store>} />
      <Route path="/women" element={<Store><CategoryPage type="group" group="women" /></Store>} />
      <Route path="/kids" element={<Store><CategoryPage type="group" group="kids" /></Store>} />
      <Route path="/gifts" element={<Store><CategoryPage type="group" group="gifts" /></Store>} />
      <Route path="/trending" element={<Store><CategoryPage type="trending" /></Store>} />
      <Route path="/offer-zone" element={<Store><CategoryPage type="offer-zone" /></Store>} />
      <Route path="/search" element={<Store><CategoryPage type="search" /></Store>} />
      <Route path="/combo-offers" element={<Store><CombosPage /></Store>} />
      <Route path="/combo/:slug" element={<Store><ComboDetail /></Store>} />
      <Route path="/product/:slug" element={<Store><ProductPage /></Store>} />
      <Route path="/cart" element={<Store><CartPage /></Store>} />
      <Route path="/checkout" element={<Store><CheckoutPage /></Store>} />
      <Route path="/order-success/:orderNumber" element={<Store><OrderSuccess /></Store>} />
      <Route path="/payment-return/:orderNumber" element={<Store><OrderSuccess /></Store>} />
      <Route path="/admin/shipping-labels" element={<Lazy><ShippingLabelPrint /></Lazy>} />
      <Route path="/track" element={<Store><TrackOrder /></Store>} />
      <Route path="/track-order/:orderNumber" element={<Store><TrackOrder /></Store>} />
      <Route path="/instagram" element={<Store><InstagramLanding /></Store>} />
      <Route path="/wishlist" element={<Store><Wishlist /></Store>} />
      <Route path="/login" element={<Store><Login /></Store>} />
      <Route path="/account" element={<Store><Account /></Store>} />
      <Route path="/page/:slug" element={<Store><StaticPage /></Store>} />

      <Route path="/admin" element={<Lazy><AdminLayout /></Lazy>}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="combos" element={<AdminCombos />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <CartProvider>
            <AppRoutes />
            <Toaster position="top-center" richColors closeButton />
          </CartProvider>
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
