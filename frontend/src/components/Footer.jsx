import { Link } from "react-router-dom";
import { Instagram, MessageCircle, Mail } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

export default function Footer() {
  const { settings, reduceMotion, setReduceMotion } = useSettings();
  const cols = [
    { title: "Shop", links: [["Women", "/women"], ["Kids", "/kids"], ["Gifts", "/gifts"], ["Combo Offers", "/combo-offers"], ["Offer Zone", "/offer-zone"]] },
    { title: "Help", links: [["Track Order", "/track"], ["Shipping Policy", "/page/shipping"], ["Returns & Refunds", "/page/returns"], ["FAQ", "/page/faq"], ["Contact", "/page/contact"]] },
    { title: "Company", links: [["About Us", "/page/about"], ["Privacy Policy", "/page/privacy"], ["Terms", "/page/terms"]] },
  ];
  return (
    <footer className="bg-[var(--ink)] text-white/90 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-14">
        <div className="grid md:grid-cols-4 gap-10">
          <div>
            <div className="font-serif text-2xl font-semibold text-white mb-3">JAVE HOUSE</div>
            <p className="text-sm text-white/60 max-w-xs">{settings?.tagline || "Little Things. Beautiful Moments."} Curated gifting & Instagram-trending finds.</p>
            <div className="flex gap-3 mt-5">
              <a href={settings?.instagram_url || "#"} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--brand)] transition-colors"><Instagram size={18} /></a>
              <a href={`https://wa.me/${settings?.whatsapp || ""}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--brand)] transition-colors"><MessageCircle size={18} /></a>
              <a href={`mailto:${settings?.email || ""}`} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--brand)] transition-colors"><Mail size={18} /></a>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="font-semibold text-white mb-4 text-sm">{c.title}</h4>
              <ul className="space-y-2.5">
                {c.links.map(([label, to]) => (
                  <li key={to}><Link to={to} className="text-sm text-white/60 hover:text-white transition-colors">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50">© {new Date().getFullYear()} JAVE HOUSE. All rights reserved.</p>
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer" data-testid="reduce-motion-toggle">
            <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} className="accent-[var(--brand)]" />
            Reduce motion
          </label>
        </div>
      </div>
    </footer>
  );
}
