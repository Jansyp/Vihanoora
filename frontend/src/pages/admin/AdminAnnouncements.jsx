import { useEffect, useState } from "react";
import { Plus, Trash2, Edit, X, Eye, EyeOff, Clock } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const BLANK = { text: "", active: true, start: "", end: "", order: 0 };

export default function AdminAnnouncements() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/announcements").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.text.trim()) { toast.error("Message text is required"); return; }
    const payload = { ...form, order: Number(form.order), start: form.start || null, end: form.end || null };
    try {
      if (editId) await api.put(`/admin/announcements/${editId}`, payload); else await api.post("/admin/announcements", payload);
      toast.success("Announcement saved"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete announcement?")) return; await api.delete(`/admin/announcements/${id}`); load(); };
  const toggle = async (a) => { await api.put(`/admin/announcements/${a.id}`, { ...a, active: !a.active }); load(); };

  const window_ = (a) => {
    const now = new Date().toISOString();
    if (!a.active) return { label: "Hidden", cls: "bg-[var(--card-2)] text-[var(--ink-soft)]" };
    if (a.start && now < a.start) return { label: "Scheduled", cls: "bg-[var(--butter)] text-[var(--amber)]" };
    if (a.end && now > a.end) return { label: "Expired", cls: "bg-[var(--card-2)] text-[var(--ink-soft)]" };
    return { label: "Live", cls: "bg-[var(--sage)] text-[var(--sage-dark)]" };
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h1 className="font-serif text-3xl font-semibold">Announcement Editor</h1>
        <button data-testid="add-announcement-btn" onClick={() => { setForm(BLANK); setEditId(null); setOpen(true); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium"><Plus size={16} /> Add</button>
      </div>
      <p className="text-sm text-[var(--ink-soft)] mb-6">Schedule timed messages for the top announcement bar. Multiple live messages rotate automatically.</p>

      <div className="bg-white rounded-2xl border border-[var(--line)] divide-y divide-[var(--line)]">
        {items.map((a) => {
          const w = window_(a);
          return (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${w.cls}`}>{w.label}</span>
              <span className="flex-1 text-sm line-clamp-1">{a.text}</span>
              {(a.start || a.end) && <span className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--ink-soft)]"><Clock size={11} /> {a.start?.slice(0, 10) || "…"} → {a.end?.slice(0, 10) || "…"}</span>}
              <button onClick={() => toggle(a)} data-testid={`toggle-announcement-${a.id}`} className="text-[var(--ink-soft)] hover:text-[var(--brand)]">{a.active ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <button data-testid={`edit-announcement-${a.id}`} onClick={() => { setForm({ ...BLANK, ...a, start: a.start || "", end: a.end || "" }); setEditId(a.id); setOpen(true); }} className="text-[var(--ink-soft)] hover:text-[var(--brand)]"><Edit size={16} /></button>
              <button onClick={() => del(a.id)} data-testid={`delete-announcement-${a.id}`} className="text-[var(--ink-soft)] hover:text-destructive"><Trash2 size={16} /></button>
            </div>
          );
        })}
        {items.length === 0 && <p className="p-6 text-center text-[var(--ink-soft)] text-sm">No announcements yet.</p>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="font-serif text-2xl font-semibold">{editId ? "Edit" : "New"} Announcement</h2><button onClick={() => setOpen(false)}><X size={22} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-semibold">Message</label>
                <textarea data-testid="announcement-text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm resize-none" placeholder="✨ Diwali Sale — up to 50% off, ends Sunday!" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold">Start (optional)</label><input data-testid="announcement-start" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" /></div>
                <div><label className="text-xs font-semibold">End (optional)</label><input data-testid="announcement-end" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" /></div>
              </div>
              <div><label className="text-xs font-semibold">Order</label><input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[var(--brand)]" /> Active</label>
              <button data-testid="save-announcement-btn" onClick={save} className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Save Announcement</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
