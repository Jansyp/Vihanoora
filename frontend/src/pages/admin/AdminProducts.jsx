import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Edit, Trash2, X } from "lucide-react";
import api, { formatINR, formatApiError, assetUrl } from "@/lib/api";
import ImageUploader from "@/components/ImageUploader";
import VideoUploader from "@/components/VideoUploader";
import { toast } from "sonner";

const BLANK = {
  name: "", group: "women", category: "Uncategorized", description: "", details: "", material: "",
  mrp: 0, selling_price: 0, stock: 0, low_stock_threshold: 5, images: [], product_video_url: "", product_video_filename: "", colors: [], color_images: {},
  weight: "", dimensions: "", trending: false, best_seller: false, new_arrival: false,
  featured: false, giftable: false, active: true, flash_price: null, flash_start: null, flash_end: null,
};
const FLAGS = ["trending", "best_seller", "new_arrival", "featured", "giftable", "active"];
const parseColors = (value) => [...new Set(value.split(",").map((color) => color.trim()).filter(Boolean))];

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [colorsInput, setColorsInput] = useState("");
  const [filters, setFilters] = useState({ search: "", main_section: "", category: "", status: "", stock_status: "", sort: "newest" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const load = useCallback(() => {
    const params = { page, limit: pageSize, ...filters };
    Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
    return Promise.all([api.get("/admin/products", { params }), api.get("/categories")]).then(([productsRes, categoriesRes]) => {
      const result = Array.isArray(productsRes.data) ? { items: productsRes.data, total: productsRes.data.length } : productsRes.data;
      setProducts(result.items || []);
      setTotal(result.total || 0);
      setCategories(categoriesRes.data || []);
    });
  }, [filters, page]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const groupedCategories = useMemo(() => {
    const current = categories.filter((group) => group.group === form.group);
    return (current[0]?.subcategories || []).filter((cat) => cat.active !== false);
  }, [categories, form.group]);

  const formCategories = (group) => (categories.find((item) => item.group === group)?.subcategories || [])
    .filter((category) => category.active !== false);

  const openNew = () => {
    const firstCategory = formCategories(BLANK.group)[0];
    setForm({ ...BLANK, category: firstCategory?.name || "Uncategorized", category_id: firstCategory?.id || null });
    setColorsInput(""); setEditId(null); setOpen(true);
  };
  const openEdit = (p) => {
    const availableCategories = formCategories(p.group || BLANK.group);
    const selectedCategory = availableCategories.find((category) => [p.category_id, p.category, p.category_slug].includes(category.id) || [p.category, p.category_slug].includes(category.name) || p.category === category.slug);
    setForm({ ...BLANK, ...p, group: p.group || BLANK.group, category: selectedCategory?.name || p.category || "Uncategorized", category_id: selectedCategory?.id || p.category_id || null, images: p.images || [], product_video_url: p.product_video_url || "", product_video_filename: p.product_video_filename || "", colors: p.colors || [], color_images: p.color_images || {} });
    setColorsInput((p.colors || []).join(", "));
    setEditId(p.id); setOpen(true);
  };

  const save = async () => {
    const colors = parseColors(colorsInput);
    const payload = {
      ...form,
      category_id: form.category_id || null,
      colors,
      color_images: Object.fromEntries(colors.map((color) => [color, form.color_images?.[color] || []])),
      mrp: Number(form.mrp), selling_price: Number(form.selling_price), stock: Number(form.stock), low_stock_threshold: Number(form.low_stock_threshold),
    };
    delete payload.sku;
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

      <div className="bg-white rounded-2xl border border-[var(--line)] p-4 mb-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input value={filters.search} onChange={(e) => { setPage(1); setFilters({ ...filters, search: e.target.value }); }} placeholder="Search products..." className="sm:col-span-2 lg:col-span-2 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          <FilterSelect label="Section" value={filters.main_section} onChange={(value) => { setPage(1); setFilters({ ...filters, main_section: value, category: "" }); }} options={[...categories.map((category) => [category.group, category.name])]} />
          <FilterSelect label="Category" value={filters.category} onChange={(value) => { setPage(1); setFilters({ ...filters, category: value }); }} options={(categories.find((category) => category.group === filters.main_section)?.subcategories || []).map((category) => [category.name, category.name])} disabled={!filters.main_section} />
          <FilterSelect label="Status" value={filters.status} onChange={(value) => { setPage(1); setFilters({ ...filters, status: value }); }} options={[["active", "Active"], ["inactive", "Inactive"]]} />
          <FilterSelect label="Stock" value={filters.stock_status} onChange={(value) => { setPage(1); setFilters({ ...filters, stock_status: value }); }} options={[["in_stock", "In Stock"], ["low_stock", "Low Stock"], ["out_of_stock", "Out of Stock"]]} />
          <FilterSelect label="Sort" value={filters.sort} onChange={(value) => { setPage(1); setFilters({ ...filters, sort: value }); }} options={[["newest", "Newest"], ["oldest", "Oldest"], ["price_low", "Price Low → High"], ["price_high", "Price High → Low"], ["stock_low", "Stock Low → High"], ["stock_high", "Stock High → Low"], ["name_asc", "Name A → Z"]]} />
        </div>
        <p className="text-sm text-[var(--ink-soft)] mt-3">Showing {products.length ? ((page - 1) * pageSize) + 1 : 0}–{(page - 1) * pageSize + products.length} of {total} products</p>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-[var(--card-2)] text-left">
            <tr>{["Product", "SKU", "Group", "Price", "Stock", "Disc", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold text-xs">{h}</th>)}</tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><img src={assetUrl(p.images?.[0])} alt="" className="w-9 h-9 rounded-lg object-cover" /><span className="font-medium line-clamp-1">{p.name}</span></div></td>
                <td className="px-4 py-3 text-[var(--ink-soft)] text-xs">{p.sku}</td>
                <td className="px-4 py-3 capitalize">{p.group} · {p.category}</td>
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
      {Math.ceil(total / pageSize) > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="px-4 py-2 rounded-full border border-[var(--line)] disabled:opacity-40">Previous</button>
          <span className="text-[var(--ink-soft)]">Page {page} of {Math.ceil(total / pageSize)}</span>
          <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((value) => value + 1)} className="px-4 py-2 rounded-full border border-[var(--line)] disabled:opacity-40">Next</button>
        </div>
      )}

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
              <div><label className="text-xs font-semibold">Group</label>
                <select value={form.group} onChange={(e) => { const nextGroup = e.target.value; const nextCategories = formCategories(nextGroup); const nextCategory = nextCategories[0]; setForm({ ...form, group: nextGroup, category: nextCategory?.name || "Uncategorized", category_id: nextCategory?.id || null }); }} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm">
                  {["women", "kids", "gifts"].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-semibold">Category</label>
                <select required value={form.category || "Uncategorized"} onChange={(e) => { const nextCategory = groupedCategories.find((category) => category.name === e.target.value); setForm({ ...form, category: e.target.value, category_id: nextCategory?.id || null }); }} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm">
                  {groupedCategories.length > 0 ? groupedCategories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>) : <option value="Uncategorized">Uncategorized</option>}
                  {groupedCategories.length > 0 && <option value="Uncategorized">Uncategorized</option>}
                </select>
              </div>
              <Field label="MRP" v={form.mrp} on={(x) => setForm({ ...form, mrp: x })} type="number" />
              <Field label="Selling Price" v={form.selling_price} on={(x) => setForm({ ...form, selling_price: x })} type="number" />
              <Field label="Stock" v={form.stock} on={(x) => setForm({ ...form, stock: x })} type="number" />
              <Field label="Low Stock Alert" v={form.low_stock_threshold} on={(x) => setForm({ ...form, low_stock_threshold: x })} type="number" />
              <div className="sm:col-span-2"><ImageUploader label="Fallback Images (for products without color images)" images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} /></div>
              <div className="sm:col-span-2"><VideoUploader url={form.product_video_url} filename={form.product_video_filename} onChange={({ url, filename }) => setForm({ ...form, product_video_url: url, product_video_filename: filename })} /></div>
              <div className="sm:col-span-2"><Field label="Colors (comma separated)" v={colorsInput} on={setColorsInput} /></div>
              {parseColors(colorsInput).map((color) => (
                <div className="sm:col-span-2" key={color}>
                  <ImageUploader
                    label={`${color} Images`}
                    images={form.color_images?.[color] || []}
                    onChange={(imgs) => setForm({ ...form, color_images: { ...form.color_images, [color]: imgs } })}
                    max={6}
                  />
                </div>
              ))}
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

function FilterSelect({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm font-normal disabled:opacity-50">
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
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
