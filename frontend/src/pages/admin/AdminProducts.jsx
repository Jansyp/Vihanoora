import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const BLANK = {
  name: "", sku: "", group: "women", category: "", description: "", details: "", material: "",
  mrp: 0, selling_price: 0, stock: 0, low_stock_threshold: 5, images: [], colors: [],
  weight: "", dimensions: "", trending: false, best_seller: false, new_arrival: false,
  featured: false, giftable: false, active: true, flash_price: null, flash_start: null, flash_end: null,
};
const FLAGS = ["trending", "best_seller", "new_arrival", "featured", "giftable", "active"];

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/products").then(({ data }) => setProducts(data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(BLANK); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({ ...BLANK, ...p, images: p.images || [], colors: p.colors || [] });
    setEditId(p.id); setOpen(true);
  };

  const save = async () => {
    const payload = { ...form, mrp: Number(form.mrp), selling_price: Number(form.selling_price), stock: Number(form.stock), low_stock_threshold: Number(form.low_stock_threshold) };
    if (!payload.flash_price) { payload.flash_price = null; payload.flash_start = null; payload.flash_end = null; }
    try {
      if (editId) await api.put(`/admin/products/${editId}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Product saved");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete this product?")) return; await api.delete(`/admin/products/${id}`); load(); toast.success("Deleted"); };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-serif text-3xl font-semibold">Products ({products.length})</h1>
        <button data-testid="add-product-btn" onClick={openNew} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium"><Plus size={16} /> Add Product</button>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-[var(--card-2)] text-left">
            <tr>{["Product", "SKU", "Group", "Price", "Stock", "Disc", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold text-xs">{h}</th>)}</tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><img src={p.images?.[0]} alt="" className="w-9 h-9 rounded-lg object-cover" /><span className="font-medium line-clamp-1">{p.name}</span></div></td>
                <td className="px-4 py-3 text-[var(--ink-soft)] text-xs">{p.sku}</td>
                <td className="px-4 py-3 capitalize">{p.group}</td>
                <td className="px-4 py-3">{formatINR(p.effective_price)}</td>
                <td className="px-4 py-3"><span className={p.stock === 0 ? "text-destructive font-semibold" : p.stock <= p.low_stock_threshold ? "text-[var(--amber)] font-semibold" : ""}>{p.stock}</span></td>
                <td className="px-4 py-3">{p.discount_percent}%</td>
                <td className="px-4 py-3"><div className="flex gap-2">
                  <button data-testid={`edit-product-${p.id}`} onClick={() => openEdit(p)} className="text-[var(--ink-soft)] hover:text-[var(--brand)]"><Edit size={16} /></button>
                  <button onClick={() => del(p.id)} className="text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={16} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-serif text-2xl font-semibold">{editId ? "Edit" : "Add"} Product</h2>
              <button onClick={() => setOpen(false)}><X size={22} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name" v={form.name} on={(x) => setForm({ ...form, name: x })} />
              <Field label="SKU" v={form.sku} on={(x) => setForm({ ...form, sku: x })} />
              <div><label className="text-xs font-semibold">Group</label>
                <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm">
                  {["women", "kids", "gifts"].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <Field label="Category slug" v={form.category} on={(x) => setForm({ ...form, category: x })} />
              <Field label="MRP" v={form.mrp} on={(x) => setForm({ ...form, mrp: x })} type="number" />
              <Field label="Selling Price" v={form.selling_price} on={(x) => setForm({ ...form, selling_price: x })} type="number" />
              <Field label="Stock" v={form.stock} on={(x) => setForm({ ...form, stock: x })} type="number" />
              <Field label="Low Stock Alert" v={form.low_stock_threshold} on={(x) => setForm({ ...form, low_stock_threshold: x })} type="number" />
              <div className="sm:col-span-2"><Field label="Image URLs (comma separated)" v={form.images.join(", ")} on={(x) => setForm({ ...form, images: x.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div className="sm:col-span-2"><Field label="Colors (comma separated)" v={form.colors.join(", ")} on={(x) => setForm({ ...form, colors: x.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div className="sm:col-span-2"><Field label="Description" v={form.description} on={(x) => setForm({ ...form, description: x })} area /></div>
              <div className="sm:col-span-2"><Field label="Details" v={form.details} on={(x) => setForm({ ...form, details: x })} /></div>
              <Field label="Material" v={form.material} on={(x) => setForm({ ...form, material: x })} />
              <Field label="Flash Price (optional)" v={form.flash_price || ""} on={(x) => setForm({ ...form, flash_price: x ? Number(x) : null })} type="number" />
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {FLAGS.map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm capitalize"><input type="checkbox" checked={!!form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.checked })} className="accent-[var(--brand)]" data-testid={`flag-${f}`} /> {f.replace("_", " ")}</label>
              ))}
            </div>
            <button data-testid="save-product-btn" onClick={save} className="w-full mt-5 py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Save Product</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, v, on, type = "text", area }) {
  return (
    <div>
      <label className="text-xs font-semibold">{label}</label>
      {area ? (
        <textarea value={v} onChange={(e) => on(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm resize-none" />
      ) : (
        <input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
      )}
    </div>
  );
}
