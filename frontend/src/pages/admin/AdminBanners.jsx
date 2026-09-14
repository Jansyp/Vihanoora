import { useEffect, useState } from "react";
import { Plus, Trash2, Edit, X, Eye, EyeOff } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import ImageUploader from "@/components/ImageUploader";
import { toast } from "sonner";

const BLANK = { title: "", subtitle: "", image: "", cta_text: "Shop Now", cta_link: "/offer-zone", active: true, order: 0 };

export default function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/banners").then(({ data }) => setBanners(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title) { toast.error("Title is required"); return; }
    const payload = { ...form, order: Number(form.order) };
    try {
      if (editId) await api.put(`/admin/banners/${editId}`, payload); else await api.post("/admin/banners", payload);
      toast.success("Banner saved"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete banner?")) return; await api.delete(`/admin/banners/${id}`); load(); };
  const toggle = async (b) => { await api.put(`/admin/banners/${b.id}`, { ...b, active: !b.active }); load(); };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h1 className="font-serif text-3xl font-semibold">Banner Studio</h1>
        <button data-testid="add-banner-btn" onClick={() => { setForm(BLANK); setEditId(null); setOpen(true); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium"><Plus size={16} /> Add Banner</button>
      </div>
      <p className="text-sm text-[var(--ink-soft)] mb-6">Active banners rotate in the homepage hero (title, subtitle & call-to-action). Drag order via the Order field.</p>

      <div className="grid sm:grid-cols-2 gap-4">
        {banners.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
            <div className="relative aspect-[16/7] bg-gradient-to-r from-[var(--brand)] to-[var(--terracotta)]">
              {b.image && <img src={b.image} alt="" className="w-full h-full object-cover opacity-70" />}
              <div className="absolute inset-0 p-5 flex flex-col justify-center text-white">
                <p className="font-serif text-xl font-semibold drop-shadow">{b.title}</p>
                <p className="text-sm opacity-90 drop-shadow">{b.subtitle}</p>
                <span className="mt-2 inline-block w-fit text-xs bg-white text-[var(--brand)] px-3 py-1 rounded-full font-medium">{b.cta_text}</span>
              </div>
              {!b.active && <span className="absolute top-2 right-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">Hidden</span>}
            </div>
            <div className="p-3 flex items-center justify-between">
              <span className="text-xs text-[var(--ink-soft)]">Order {b.order} · → {b.cta_link}</span>
              <div className="flex gap-2">
                <button onClick={() => toggle(b)} className="text-[var(--ink-soft)] hover:text-[var(--brand)]">{b.active ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                <button data-testid={`edit-banner-${b.id}`} onClick={() => { setForm({ ...BLANK, ...b }); setEditId(b.id); setOpen(true); }} className="text-[var(--ink-soft)] hover:text-[var(--brand)]"><Edit size={16} /></button>
                <button onClick={() => del(b.id)} className="text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && <p className="text-sm text-[var(--ink-soft)]">No banners yet. Add one to power the homepage hero.</p>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="font-serif text-2xl font-semibold">{editId ? "Edit" : "Add"} Banner</h2><button onClick={() => setOpen(false)}><X size={22} /></button></div>
            <div className="space-y-3">
              <In label="Title" v={form.title} on={(x) => setForm({ ...form, title: x })} testid="banner-title" />
              <In label="Subtitle" v={form.subtitle} on={(x) => setForm({ ...form, subtitle: x })} />
              <ImageUploader images={form.image ? [form.image] : []} onChange={(imgs) => setForm({ ...form, image: imgs[0] || "" })} label="Background Image (optional)" max={1} />
              <div className="grid grid-cols-2 gap-3">
                <In label="Button Text" v={form.cta_text} on={(x) => setForm({ ...form, cta_text: x })} />
                <In label="Button Link" v={form.cta_link} on={(x) => setForm({ ...form, cta_link: x })} />
              </div>
              <In label="Order" v={form.order} on={(x) => setForm({ ...form, order: x })} type="number" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[var(--brand)]" /> Active (show in hero)</label>
              <button data-testid="save-banner-btn" onClick={save} className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Save Banner</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function In({ label, v, on, type = "text", testid }) {
  return <div><label className="text-xs font-semibold">{label}</label><input data-testid={testid} type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" /></div>;
}
