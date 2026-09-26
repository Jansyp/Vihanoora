import { useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function Layout({ children }) {
  const loc = useLocation();
  const navigationType = useNavigationType();
  const isListing = ["/women", "/kids", "/gifts", "/trending", "/offer-zone", "/search"].includes(loc.pathname);
  const scrollKey = `viaura:listing-scroll:${loc.pathname}${loc.search}`;

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, []);

  useEffect(() => {
    if (isListing && navigationType === "POP") return;
    window.scrollTo(0, 0);
  }, [isListing, loc.key, navigationType]);

  useLayoutEffect(() => {
    if (!isListing || navigationType !== "POP") return;
    const savedPosition = Number(sessionStorage.getItem(scrollKey));
    if (Number.isFinite(savedPosition) && savedPosition > 0) window.scrollTo(0, savedPosition);
  }, [isListing, navigationType, scrollKey]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      <Footer />
      <MobileNav />
      <WhatsAppButton />
    </div>
  );
}
