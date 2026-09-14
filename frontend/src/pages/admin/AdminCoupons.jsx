import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const BLANK = { code: "", type: "percentage", value: 10, min_order: 0, max_discount: "", total_usage_limit: "", per_customer_limit: "", active: true };

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(BLANK);
  const load = () => api.get("/admin/coupons").then(({ data }) => setCoupons(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = {
      code: form.code, type: form.type, value: Number(form.value), min_order: Number(form.min_order),
      max_discount: form.max_discount ? Number(form.max_discount) : null,
      total_usage_limit: form.total_usage_limit ? Number(form.total_usage_limit) : null,
      per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : null, active: form.active,
    };
    try { await api.post("/admin/coupons", payload); toast.success("Coupon created"); setForm(BLANK); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/admin/coupons/${id}`); load(); };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-6">Coupons</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[var(--line)] overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-[var(--card-2)] text-left"><tr>{["Code", "Type", "Value", "Min Order", "Used", "Active", ""].map((h) => <th key={h} className="px-4 py-3 text-xs font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 font-bold">{c.code}</td>
                  <td className="px-4 py-3">{c.type}</td>
                  <td className="px-4 py-3">{c.type === "percentage" ? `${c.value}%` : `₹${c.value}`}</td>
                  <td className="px-4 py-3">₹{c.min_order}</td>
                  <td className="px-4 py-3">{c.used_count}{c.total_usage_limit ? `/${c.total_usage_limit}` : ""}</td>
                  <td className="px-4 py-3">{c.active ? "✅" : "❌"}</td>
                  <td className="px-4 py-3"><button onClick={() => del(c.id)} className="text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {coupons.length === 0 && <p className="p-6 text-center text-[var(--ink-soft)] text-sm">No coupons yet.</p>}
        </div>

        <div className="bg-white rounded-2xl border border-[var(--line)] p-5 h-fit">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus size={16} /> New Coupon</h3>
          <div className="space-y-3">
            <In label="Code" v={form.code} on={(x) => setForm({ ...form, code: x.toUpperCase() })} />
            <div><label className="text-xs font-semibold">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] text-sm outline-none">
                <option value="percentage">Percentage</option><option value="flat">Flat</option>
              </select>
            </div>
            <In label={form.type === "percentage" ? "Value (%)" : "Value (₹)"} v={form.value} on={(x) => setForm({ ...form, value: x })} type="number" />
            <In label="Min Order (₹)" v={form.min_order} on={(x) => setForm({ ...form, min_order: x })} type="number" />
            <In label="Max Discount (₹, optional)" v={form.max_discount} on={(x) => setForm({ ...form, max_discount: x })} type="number" />
            <In label="Total Usage Limit" v={form.total_usage_limit} on={(x) => setForm({ ...form, total_usage_limit: x })} type="number" />
            <In label="Per Customer Limit" v={form.per_customer_limit} on={(x) => setForm({ ...form, per_customer_limit: x })} type="number" />
            <button data-testid="save-coupon-btn" onClick={save} className="w-full py-3 rounded-full bg-[var(--brand)] text-white font-medium text-sm">Create Coupon</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function In({ label, v, on, type = "text" }) {
  return <div><label className="text-xs font-semibold">{label}</label><input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" /></div>;
}
