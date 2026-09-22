import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const BLANK = { name: "", group: "women", active: true };

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get("/admin/categories");
    setCats(data);
  };

  useEffect(() => { load(); }, []);

  const groupCategoryCount = useMemo(() => Object.fromEntries(
    cats.map((c) => [c.group, (c.subcategories || []).filter((s) => s.active !== false).length])
  ), [cats]);

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Category name is required");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/admin/categories/${editingId}`, { ...form, name, active: form.active });
        toast.success("Category updated");
      } else {
        await api.post("/admin/categories", { ...form, name, active: form.active });
        toast.success("Category added");
      }
      setForm(BLANK);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const remove = async (category) => {
    const hasProducts = Number(category.product_count || 0) > 0;
    const message = hasProducts
      ? "This category has assigned products and cannot be deleted until they are reassigned. Disable it instead?"
      : "Delete this category permanently?";
    if (!window.confirm(message)) return;
    try {
      await api.delete(`/admin/categories/${category.id}`);
      toast.success("Category removed");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const toggleActive = async (category) => {
    try {
      await api.put(`/admin/categories/${category.id}`, {
        name: category.name,
        group: category.group,
        slug: category.slug,
        active: !category.active,
        subcategories: [],
      });
      toast.success(category.active ? "Category disabled" : "Category enabled");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setForm({ name: category.name, group: category.group, active: category.active });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif text-3xl font-semibold">Category Management</h1>
        <div className="text-sm text-[var(--ink-soft)]">{cats.reduce((sum, c) => sum + (c.subcategories || []).length, 0)} total categories</div>
      </div>

      <div className="bg-white rounded-3xl border border-[var(--line)] p-5 mb-6">
        <h2 className="font-semibold text-lg mb-4">{editingId ? "Edit Category" : "Add New Category"}</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold">Main Section</label>
            <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm">
              {['women', 'kids', 'gifts'].map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold">Category Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rings" className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <label className="text-sm font-medium">Active</label>
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[var(--brand)]" />
        </div>
        <div className="flex gap-3 mt-5 flex-wrap">
          <button onClick={save} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium">
            <Plus size={16} /> {editingId ? "Save Changes" : "Add Category"}
          </button>
          {editingId && <button onClick={() => { setEditingId(null); setForm(BLANK); }} className="px-4 py-2.5 rounded-full bg-[var(--card-2)] text-sm">Cancel</button>}
        </div>
      </div>

      <div className="grid gap-4">
        {cats.map((group) => (
          <div key={group.id || group.slug} className="bg-white rounded-2xl border border-[var(--line)] p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="font-semibold text-lg capitalize">{group.name}</h3>
                <p className="text-xs text-[var(--ink-soft)]">{groupCategoryCount[group.group] || 0} active categories</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-[var(--card-2)] text-xs font-medium">{group.group}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(group.subcategories || []).map((item) => (
                <div key={item.id || item.slug} className={`px-3 py-2 rounded-full border text-xs font-medium flex items-center gap-2 ${item.active === false ? "border-dashed opacity-50" : "border-[var(--line)] bg-[var(--card-2)]"}`}>
                  <span>{item.name}</span>
                  <button onClick={() => toggleActive(item)} className="text-[var(--ink-soft)]" aria-label={item.active === false ? "Enable category" : "Disable category"}>
                    {item.active === false ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                  </button>
                  <button onClick={() => startEdit({ ...item, group: group.group })} className="text-[var(--ink-soft)] hover:text-[var(--brand)]"><Pencil size={12} /></button>
                  <button onClick={() => remove({ ...item, group: group.group, product_count: item.product_count || 0 })} className="text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
