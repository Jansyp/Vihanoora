import { useEffect } from "react";
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, Boxes, Ticket, FolderTree, Settings, Home, Image } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/combos", label: "Combos", icon: Boxes },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/banners", label: "Banners", icon: Image },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!user) nav("/login");
      else if (user.role !== "admin") nav("/");
    }
  }, [user, loading]);

  if (loading || !user || user.role !== "admin") return <div className="min-h-screen flex items-center justify-center text-[var(--ink-soft)]">Loading admin...</div>;

  return (
    <div className="min-h-screen bg-[var(--cream)] flex">
      <aside className="hidden md:flex flex-col w-60 bg-[var(--ink)] text-white/80 p-4 sticky top-0 h-screen">
        <Link to="/" className="font-serif text-2xl font-semibold text-white px-2 py-3">JAVE <span className="text-[var(--brand)]">HOUSE</span></Link>
        <p className="text-xs text-white/40 px-2 mb-4">Admin Console</p>
        <nav className="flex flex-col gap-1 flex-1">
          {LINKS.map((l) => {
            const active = l.end ? loc.pathname === l.to : loc.pathname.startsWith(l.to);
            return (
              <Link key={l.to} to={l.to} data-testid={`admin-nav-${l.label.toLowerCase()}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? "bg-[var(--brand)] text-white" : "hover:bg-white/10"}`}>
                <l.icon size={17} /> {l.label}
              </Link>
            );
          })}
        </nav>
        <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-white/10"><Home size={17} /> Back to Store</Link>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--ink)] flex overflow-x-auto no-scrollbar">
        {LINKS.map((l) => {
          const active = l.end ? loc.pathname === l.to : loc.pathname.startsWith(l.to);
          return <Link key={l.to} to={l.to} className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] shrink-0 ${active ? "text-[var(--brand)]" : "text-white/60"}`}><l.icon size={18} />{l.label}</Link>;
        })}
      </div>

      <main className="flex-1 p-4 sm:p-8 pb-24 md:pb-8 overflow-x-hidden"><Outlet /></main>
    </div>
  );
}
