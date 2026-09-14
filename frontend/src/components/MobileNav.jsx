import { Link, useLocation } from "react-router-dom";
import { Home, LayoutGrid, Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

export default function MobileNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const loc = useLocation();
  const items = [
    { icon: Home, label: "Home", to: "/" },
    { icon: LayoutGrid, label: "Shop", to: "/women" },
    { icon: ShoppingBag, label: "Cart", to: "/cart", badge: count },
    { icon: Heart, label: "Saved", to: "/wishlist" },
    { icon: User, label: "Account", to: user ? "/account" : "/login" },
  ];
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-[var(--line)] pb-safe">
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = loc.pathname === it.to;
          return (
            <Link key={it.label} to={it.to} data-testid={`bottomnav-${it.label.toLowerCase()}`}
              className={`flex flex-col items-center gap-0.5 py-2.5 relative ${active ? "text-[var(--brand)]" : "text-[var(--ink-soft)]"}`}>
              <it.icon size={20} />
              <span className="text-[10px] font-medium">{it.label}</span>
              {it.badge > 0 && (
                <span className="absolute top-1.5 right-6 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--brand)] text-white text-[9px] font-bold flex items-center justify-center">{it.badge}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
