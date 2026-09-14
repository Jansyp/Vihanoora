import { useEffect, useState } from "react";
import { Plus, Trash2, Edit, X } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import ImageUploader from "@/components/ImageUploader";
import { toast } from "sonner";

const BLANK = { name: "", description: "", images: [], product_ids: [], original_price: 0, combo_price: 0, stock: 0, active: true };

export default function AdminCombos() {
  const [combos, setCombos] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/combos").then(({ data }) => setCombos(data));
  useEffect(() => { load(); api.get("/admin/products").then(({ data }) => setProducts(data)); }, []);

  const toggleProduct = (id) => setForm((f) => ({ ...f, product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id] }));

  const save = async () => {
    const payload = { ...form, original_price: Number(form.original_price), combo_price: Number(form.combo_price), stock: Number(form.stock) };
    try {
      if (editId) await api.put(`/admin/combos/${editId}`, payload); else await api.post("/admin/combos", payload);
      toast.success("Combo saved"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete combo?")) return; await api.delete(`/admin/combos/${id}`); load(); };

  const autoPrice = () => {
    const sum = products.filter((p) => form.product_ids.includes(p.id)).reduce((s, p) => s + p.effective_price, 0);
    setForm((f) => ({ ...f, original_price: sum, combo_price: Math.round(sum * 0.8) }));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-serif text-3xl font-semibold">Combos ({combos.length})</h1>
        <button data-testid="add-combo-btn" onClick={() => { setForm(BLANK); setEditId(null); setOpen(true); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium"><Plus size={16} /> Add Combo</button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {combos.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
            <img src={c.images?.[0]} alt="" className="w-full aspect-video object-cover" />
            <div className="p-4">
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-sm mt-1"><b className="text-[var(--brand)]">{formatINR(c.combo_price)}</b> <span className="line-through text-[var(--ink-soft)] text-xs">{formatINR(c.original_price)}</span></p>
              <p className="text-xs text-[var(--ink-soft)]">{c.product_ids?.length} items · Stock {c.stock}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setForm({ ...BLANK, ...c, images: c.images || [], product_ids: c.product_ids || [] }); setEditId(c.id); setOpen(true); }} className="text-[var(--ink-soft)] hover:text-[var(--brand)]"><Edit size={16} /></button>
                <button onClick={() => del(c.id)} className="text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="font-serif text-2xl font-semibold">{editId ? "Edit" : "Add"} Combo</h2><button onClick={() => setOpen(false)}><X size={22} /></button></div>
            <div className="space-y-3">
              <In label="Name" v={form.name} on={(x) => setForm({ ...form, name: x })} />
              <In label="Description" v={form.description} on={(x) => setForm({ ...form, description: x })} />
              <ImageUploader images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} label="Combo Image" max={3} />
              <div>
                <p className="text-xs font-semibold mb-2">Select products</p>
                <div className="max-h-44 overflow-y-auto border border-[var(--line)] rounded-xl p-2 space-y-1">
                  {products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} className="accent-[var(--brand)]" /> {p.name} <span className="text-[var(--ink-soft)] text-xs ml-auto">{formatINR(p.effective_price)}</span></label>
                  ))}
                </div>
                <button onClick={autoPrice} className="text-xs text-[var(--brand)] font-medium mt-2">Auto-fill prices from selection</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <In label="Original ₹" v={form.original_price} on={(x) => setForm({ ...form, original_price: x })} type="number" />
                <In label="Combo ₹" v={form.combo_price} on={(x) => setForm({ ...form, combo_price: x })} type="number" />
                <In label="Stock" v={form.stock} on={(x) => setForm({ ...form, stock: x })} type="number" />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[var(--brand)]" /> Active</label>
              <button data-testid="save-combo-btn" onClick={save} className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Save Combo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function In({ label, v, on, type = "text" }) {
  return <div><label className="text-xs font-semibold">{label}</label><input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" /></div>;
}
