import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Heart, ShoppingBag, User, Menu, X } from "lucide-react";
import api from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

const NAV = [
  { label: "Home", to: "/" },
  { label: "Women", to: "/women" },
  { label: "Kids", to: "/kids" },
  { label: "Gifts", to: "/gifts" },
  { label: "Combo Offers", to: "/combo-offers" },
  { label: "Trending", to: "/trending" },
  { label: "Offer Zone", to: "/offer-zone", accent: true },
];

export default function Header() {
  const { count, wishlist } = useCart();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [anns, setAnns] = useState([]);
  const [annIdx, setAnnIdx] = useState(0);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    api.get("/announcements").then(({ data }) => setAnns(data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (anns.length <= 1) return;
    const t = setInterval(() => setAnnIdx((i) => (i + 1) % anns.length), 4500);
    return () => clearInterval(t);
  }, [anns.length]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); setOpen(false); }
  };

  const announce = anns.length > 0 ? anns[annIdx % anns.length]?.text : null;

  return (
    <>
      {announce && (
        <div className="bg-[var(--ink)] text-white text-center text-xs sm:text-sm py-2 px-4 overflow-hidden" data-testid="announcement-bar">
          <div className="whitespace-nowrap transition-opacity duration-500">{announce}</div>
        </div>
      )}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[var(--line)]" style={{ boxShadow: "0 4px 20px rgba(42,36,33,0.05)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex items-center justify-between h-16 gap-4">
            <button className="lg:hidden p-2 -ml-2" onClick={() => setOpen(true)} data-testid="mobile-menu-btn" aria-label="menu">
              <Menu size={22} />
            </button>

            <Link to="/" data-testid="logo-link" className="flex items-center gap-2 shrink-0">
              <span className="font-serif text-2xl font-semibold tracking-tight text-[var(--brand)]">Vihaanora</span>
            </Link>

            <nav className="hidden lg:flex items-center gap-6 flex-1 justify-center">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
                  className={`text-sm font-medium transition-colors relative ${
                    loc.pathname === n.to ? "text-[var(--brand)]" : "text-[var(--ink)] hover:text-[var(--brand)]"
                  } ${n.accent ? "text-[var(--brand)]" : ""}`}>
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <form onSubmit={submitSearch} className="hidden md:flex items-center bg-[var(--card-2)] rounded-full px-3 py-2">
                <Search size={16} className="text-[var(--ink-soft)]" />
                <input data-testid="search-input" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search..." className="bg-transparent outline-none text-sm px-2 w-28 lg:w-40" />
              </form>
              <Link to="/search" className="md:hidden p-2" aria-label="search"><Search size={20} /></Link>
              <Link to="/wishlist" data-testid="wishlist-nav" className="p-2 relative" aria-label="wishlist">
                <Heart size={20} />
                {wishlist.length > 0 && <Badge>{wishlist.length}</Badge>}
              </Link>
              <Link to="/cart" data-testid="cart-nav" className="p-2 relative" aria-label="cart">
                <ShoppingBag size={20} />
                {count > 0 && <Badge>{count}</Badge>}
              </Link>
              <Link to={user ? "/account" : "/login"} data-testid="account-nav" className="p-2" aria-label="account">
                <User size={20} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white p-6 shadow-xl fade-up">
            <div className="flex items-center justify-between mb-6">
              <span className="font-serif text-xl font-semibold">Vihaanora</span>
              <button onClick={() => setOpen(false)} data-testid="mobile-menu-close"><X size={22} /></button>
            </div>
            <form onSubmit={submitSearch} className="flex items-center bg-[var(--card-2)] rounded-full px-3 py-2 mb-5">
              <Search size={16} className="text-[var(--ink-soft)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..."
                className="bg-transparent outline-none text-sm px-2 flex-1" />
            </form>
            <nav className="flex flex-col gap-1">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                  className="py-3 px-3 rounded-xl text-[var(--ink)] font-medium hover:bg-[var(--blush)] transition-colors">
                  {n.label}
                </Link>
              ))}
              <Link to="/track" onClick={() => setOpen(false)} className="py-3 px-3 rounded-xl text-[var(--ink)] font-medium hover:bg-[var(--blush)]">Track Order</Link>
              <Link to={user ? "/account" : "/login"} onClick={() => setOpen(false)} className="py-3 px-3 rounded-xl text-[var(--ink)] font-medium hover:bg-[var(--blush)]">
                {user ? "My Account" : "Login / Register"}
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function Badge({ children }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--brand)] text-white text-[10px] font-bold flex items-center justify-center">
      {children}
    </span>
  );
}
