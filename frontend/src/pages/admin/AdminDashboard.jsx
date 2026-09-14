import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, ShoppingBag, IndianRupee, Clock, AlertTriangle } from "lucide-react";
import api, { formatINR } from "@/lib/api";

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/dashboard").then(({ data }) => setD(data)).catch(() => {}); }, []);
  if (!d) return <p className="text-[var(--ink-soft)]">Loading dashboard...</p>;

  const stats = [
    { label: "Today's Orders", value: d.today_orders, icon: ShoppingBag, color: "var(--brand)" },
    { label: "Today's Sales", value: formatINR(d.today_sales), icon: IndianRupee, color: "var(--sage-dark)" },
    { label: "Total Orders", value: d.total_orders, icon: TrendingUp, color: "var(--lavender-dark)" },
    { label: "Total Revenue", value: formatINR(d.total_revenue), icon: IndianRupee, color: "var(--amber)" },
    { label: "Pending Payments", value: d.pending_payments, icon: Clock, color: "var(--terracotta)" },
    { label: "Active Offers", value: d.active_offers, icon: TrendingUp, color: "var(--brand)" },
  ];

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-5 border border-[var(--line)]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--ink-soft)]">{s.label}</span>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <p className="text-2xl font-bold mt-2" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(d.status_counts).map(([k, v]) => (
          <div key={k} className="bg-white rounded-xl p-3 border border-[var(--line)] text-center">
            <p className="text-lg font-bold">{v}</p><p className="text-[10px] text-[var(--ink-soft)]">{k}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-5 border border-[var(--line)]">
          <h3 className="font-semibold mb-3">Recent Orders</h3>
          <div className="space-y-2">
            {d.recent_orders.length === 0 && <p className="text-sm text-[var(--ink-soft)]">No orders yet.</p>}
            {d.recent_orders.map((o) => (
              <Link key={o.id} to="/admin/orders" className="flex justify-between text-sm py-1.5 border-b border-[var(--line)] last:border-0">
                <span className="font-medium">{o.order_number}</span>
                <span className="text-[var(--ink-soft)]">{o.order_status}</span>
                <span className="font-semibold">{formatINR(o.grand_total)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[var(--line)]">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-[var(--amber)]" /> Low Stock</h3>
          <div className="space-y-2">
            {d.low_stock.length === 0 && <p className="text-sm text-[var(--ink-soft)]">All stocked up! 🎉</p>}
            {d.low_stock.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-[var(--line)] last:border-0">
                <span className="line-clamp-1">{p.name}</span>
                <span className={`font-semibold ${p.stock === 0 ? "text-destructive" : "text-[var(--amber)]"}`}>{p.stock} left</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[var(--line)] mt-6">
        <h3 className="font-semibold mb-3">Top Sellers</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {d.top_sellers.map((p) => (
            <div key={p.id} className="text-center">
              <img src={p.images?.[0]} alt="" className="w-full aspect-square rounded-xl object-cover" />
              <p className="text-xs font-medium mt-1 line-clamp-1">{p.name}</p>
              <p className="text-[10px] text-[var(--ink-soft)]">{p.sold_count} sold</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
