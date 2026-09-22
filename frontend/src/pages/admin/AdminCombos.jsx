import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Edit, X } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import ImageUploader from "@/components/ImageUploader";
import { toast } from "sonner";

const BLANK = { name: "", description: "", images: [], product_ids: [], original_price: 0, combo_price: 0, stock: 0, active: true };

export default function AdminCombos() {
  const [combos, setCombos] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const searchRequest = useRef(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/combos").then(({ data }) => setCombos(data));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const requestId = ++searchRequest.current;
    const timer = setTimeout(async () => {
      setProductsLoading(true);
      try {
        const { data } = await api.get("/admin/products", { params: { search: productSearch, page: productPage, limit: 30 } });
        if (requestId !== searchRequest.current) return;
        const result = Array.isArray(data) ? { items: data, total: data.length } : data;
        setProducts(result.items || []);
        setProductTotal(result.total || 0);
      } finally {
        if (requestId === searchRequest.current) setProductsLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [open, productPage, productSearch]);

  const toggleProduct = (product) => {
    const selected = form.product_ids.includes(product.id);
    setForm((f) => ({ ...f, product_ids: selected ? f.product_ids.filter((x) => x !== product.id) : [...f.product_ids, product.id] }));
    setSelectedProducts((current) => {
      const next = { ...current };
      if (selected) delete next[product.id]; else next[product.id] = product;
      return next;
    });
  };

  const removeSelectedProduct = (id) => {
    setForm((current) => ({ ...current, product_ids: current.product_ids.filter((productId) => productId !== id) }));
    setSelectedProducts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const openCombo = async (combo) => {
    const productIds = combo.product_ids || [];
    setForm({ ...BLANK, ...combo, images: combo.images || [], product_ids: productIds });
    setSelectedProducts({});
    if (productIds.length) {
      const { data } = await api.get("/admin/products", { params: { product_ids: productIds.join(","), limit: productIds.length } });
      const result = Array.isArray(data) ? data : data.items || [];
      setSelectedProducts(Object.fromEntries(result.map((product) => [product.id, product])));
    }
    setProducts([]); setProductTotal(0); setProductSearch(""); setProductPage(1); setEditId(combo.id); setOpen(true);
  };

  const save = async () => {
    const payload = { ...form, original_price: Number(form.original_price), combo_price: Number(form.combo_price), stock: Number(form.stock) };
    try {
      if (editId) await api.put(`/admin/combos/${editId}`, payload); else await api.post("/admin/combos", payload);
      toast.success("Combo saved"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete combo?")) return; await api.delete(`/admin/combos/${id}`); load(); };

  const autoPrice = () => {
    const sum = form.product_ids.reduce((total, id) => total + Number(selectedProducts[id]?.effective_price || 0), 0);
    setForm((f) => ({ ...f, original_price: sum, combo_price: Math.round(sum * 0.8) }));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-serif text-3xl font-semibold">Combos ({combos.length})</h1>
        <button data-testid="add-combo-btn" onClick={() => { setForm(BLANK); setSelectedProducts({}); setProducts([]); setProductTotal(0); setProductSearch(""); setProductPage(1); setEditId(null); setOpen(true); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium"><Plus size={16} /> Add Combo</button>
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
                <button onClick={() => openCombo(c)} className="text-[var(--ink-soft)] hover:text-[var(--brand)]"><Edit size={16} /></button>
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
                <input value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="Search products by title..." className="w-full mb-2 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
                <div className="flex items-center justify-between text-xs text-[var(--ink-soft)] mb-2">
                  <span>{productSearch ? `${productTotal} products found` : `${productTotal} recent products`}</span>
                  <span>Selected: {form.product_ids.length} products</span>
                </div>
                {form.product_ids.length > 0 && (
                  <div className="mb-2 border border-[var(--line)] rounded-xl p-2 space-y-1">
                    <p className="text-[11px] font-semibold text-[var(--ink-soft)]">Selected products</p>
                    {form.product_ids.map((id) => {
                      const product = selectedProducts[id];
                      return <label key={id} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked onChange={() => removeSelectedProduct(id)} className="accent-[var(--brand)]" /> {product?.name || "Selected product"} <span className="text-[var(--ink-soft)] text-xs ml-auto">{product ? formatINR(product.effective_price) : ""}</span></label>;
                    })}
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto border border-[var(--line)] rounded-xl p-2 space-y-1">
                  {productsLoading ? <p className="text-xs text-[var(--ink-soft)] py-2">Searching products...</p> : products.length ? products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p)} className="accent-[var(--brand)]" /> {p.name} <span className="text-[var(--ink-soft)] text-xs ml-auto">{formatINR(p.effective_price)}</span></label>
                  )) : <p className="text-xs text-[var(--ink-soft)] py-2">{productSearch ? `No products found for "${productSearch}"` : "No products found"}</p>}
                </div>
                {Math.ceil(productTotal / 30) > 1 && <div className="flex items-center justify-between mt-2 text-xs"><button disabled={productPage === 1} onClick={() => setProductPage((value) => value - 1)} className="px-2 py-1 rounded border border-[var(--line)] disabled:opacity-40">Previous</button><span>Page {productPage} of {Math.ceil(productTotal / 30)}</span><button disabled={productPage >= Math.ceil(productTotal / 30)} onClick={() => setProductPage((value) => value + 1)} className="px-2 py-1 rounded border border-[var(--line)] disabled:opacity-40">Next</button></div>}
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
