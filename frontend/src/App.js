import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { CartProvider } from "@/context/CartContext";
import Layout from "@/components/Layout";

import Home from "@/pages/Home";
import CategoryPage from "@/pages/CategoryPage";
import ProductPage from "@/pages/ProductPage";
import CombosPage from "@/pages/CombosPage";
import ComboDetail from "@/pages/ComboDetail";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import OrderSuccess from "@/pages/OrderSuccess";
import TrackOrder from "@/pages/TrackOrder";
import InstagramLanding from "@/pages/InstagramLanding";
import Wishlist from "@/pages/Wishlist";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Account from "@/pages/Account";
import StaticPage from "@/pages/StaticPage";

import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminCombos from "@/pages/admin/AdminCombos";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminBanners from "@/pages/admin/AdminBanners";
import AdminSettings from "@/pages/admin/AdminSettings";

const Store = ({ children }) => <Layout>{children}</Layout>;

function AppRoutes() {
  const location = useLocation();
  // Emergent Google OAuth callback — process session_id before anything else
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/" element={<Store><Home /></Store>} />
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
      <Route path="/track" element={<Store><TrackOrder /></Store>} />
      <Route path="/instagram" element={<Store><InstagramLanding /></Store>} />
      <Route path="/wishlist" element={<Store><Wishlist /></Store>} />
      <Route path="/login" element={<Store><Login /></Store>} />
      <Route path="/account" element={<Store><Account /></Store>} />
      <Route path="/page/:slug" element={<Store><StaticPage /></Store>} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="combos" element={<AdminCombos />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="banners" element={<AdminBanners />} />
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
