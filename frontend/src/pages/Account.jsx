import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Package, MapPin, Heart, Plus, Trash2 } from "lucide-react";
import api, { formatINR } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { Section, ProductGrid } from "@/components/common";
import { toast } from "sonner";

export default function Account() {
  const { user, loading, logout } = useAuth();
  const { wishlist } = useCart();
  const nav = useNavigate();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [showAddr, setShowAddr] = useState(false);
  const [addr, setAddr] = useState({ name: "", mobile: "", address: "", city: "", state: "", pin: "", is_default: false });

  useEffect(() => {
    if (!loading && !user) nav("/login");
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      api.get("/my/orders").then(({ data }) => setOrders(data)).catch(() => {});
      api.get("/addresses").then(({ data }) => setAddresses(data)).catch(() => {});
    }
  }, [user]);

  if (loading || !user) return <Section><div className="h-64" /></Section>;

  const saveAddr = async () => {
    if (!addr.name || !/^\d{10}$/.test(addr.mobile) || !/^\d{6}$/.test(addr.pin)) { toast.error("Fill valid name, 10-digit mobile & 6-digit PIN"); return; }
    const { data } = await api.post("/addresses", addr);
    setAddresses((a) => [...a, data]);
    setShowAddr(false);
    setAddr({ name: "", mobile: "", address: "", city: "", state: "", pin: "", is_default: false });
    toast.success("Address saved");
  };
  const delAddr = async (id) => { await api.delete(`/addresses/${id}`); setAddresses((a) => a.filter((x) => x.id !== id)); };

  const TABS = [["orders", "Orders", Package], ["addresses", "Addresses", MapPin], ["wishlist", "Wishlist", Heart]];

  return (
    <Section>
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-4">
          {user.picture ? <img src={user.picture} alt="" className="w-14 h-14 rounded-full object-cover" /> :
            <div className="w-14 h-14 rounded-full bg-[var(--brand)] text-white flex items-center justify-center font-serif text-2xl">{user.name?.[0]?.toUpperCase()}</div>}
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold">Hi, {user.name?.split(" ")[0]} 👋</h1>
            <p className="text-sm text-[var(--ink-soft)]">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {user.role === "admin" && <Link to="/admin" className="px-5 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm font-medium">Admin Panel</Link>}
          <button data-testid="logout-btn" onClick={async () => { await logout(); nav("/"); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--line)] text-sm font-medium"><LogOut size={15} /> Logout</button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-[var(--line)]">
        {TABS.map(([k, l, Ic]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`account-tab-${k}`}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--ink-soft)]"}`}>
            <Ic size={15} /> {l}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        orders.length === 0 ? <p className="text-[var(--ink-soft)] py-10 text-center">No orders yet. <Link to="/women" className="text-[var(--brand)]">Start shopping →</Link></p> : (
          <div className="space-y-4">
            {orders.map((o) => (
              <div key={o.id} className="bg-white rounded-3xl p-5 border border-[var(--line)]">
                <div className="flex justify-between flex-wrap gap-2">
                  <div><p className="font-bold">{o.order_number}</p><p className="text-xs text-[var(--ink-soft)]">{new Date(o.created_at).toLocaleDateString()}</p></div>
                  <span className="px-3 py-1 rounded-full bg-[var(--blush)] text-[var(--brand)] text-xs font-semibold h-fit">{o.order_status}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {o.items.map((i, idx) => <div key={idx} className="flex items-center gap-3 text-sm"><img src={i.image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" /><div><p>{i.name} × {i.qty}</p>{i.variant && <p className="text-xs text-[var(--ink-soft)]">Colour: {i.variant}</p>}</div></div>)}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[var(--line)]">
                  <span className="font-bold text-[var(--brand)]">{formatINR(o.grand_total)}</span>
                  <Link to={`/track?order=${o.order_number}`} className="text-sm text-[var(--brand)] font-medium">Track →</Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "addresses" && (
        <div>
          <div className="grid sm:grid-cols-2 gap-4">
            {addresses.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl p-4 border border-[var(--line)] relative">
                <button onClick={() => delAddr(a.id)} className="absolute top-3 right-3 text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={16} /></button>
                <p className="font-semibold">{a.name}</p>
                <p className="text-sm text-[var(--ink-soft)]">{a.mobile}</p>
                <p className="text-sm text-[var(--ink-soft)] mt-1">{a.address}, {a.city}, {a.state} - {a.pin}</p>
              </div>
            ))}
          </div>
          {showAddr ? (
            <div className="mt-4 bg-white rounded-2xl p-5 border border-[var(--line)] grid sm:grid-cols-2 gap-3">
              {["name", "mobile", "address", "city", "state", "pin"].map((k) => (
                <input key={k} value={addr[k]} onChange={(e) => setAddr({ ...addr, [k]: e.target.value })} placeholder={k[0].toUpperCase() + k.slice(1)} className="px-4 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
              ))}
              <div className="sm:col-span-2 flex gap-2">
                <button onClick={saveAddr} className="px-5 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium">Save</button>
                <button onClick={() => setShowAddr(false)} className="px-5 py-2.5 rounded-full border border-[var(--line)] text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddr(true)} className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--line)] text-sm font-medium"><Plus size={15} /> Add Address</button>
          )}
        </div>
      )}

      {tab === "wishlist" && (
        wishlist.length === 0 ? <p className="text-[var(--ink-soft)] py-10 text-center">Your wishlist is empty.</p> : <ProductGrid products={wishlist} />
      )}
    </Section>
  );
}
