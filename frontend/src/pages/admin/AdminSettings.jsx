import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const FIELDS = [
  ["store_name", "Store Name", "text"],
  ["tagline", "Tagline", "text"],
  ["contact_number", "Contact Number", "text"],
  ["email", "Email", "text"],
  ["whatsapp", "WhatsApp (with country code, no +)", "text"],
  ["instagram_url", "Instagram URL", "text"],
  ["delivery_charge", "Delivery Charge (₹)", "number"],
  ["free_shipping_threshold", "Free Shipping Above (₹)", "number"],
  ["gst_percent", "GST %", "number"],
  ["announcement_bar_text", "Announcement Bar Text", "text"],
];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/settings").then(({ data }) => setS(data)); }, []);
  if (!s) return <p className="text-[var(--ink-soft)]">Loading...</p>;

  const save = async () => {
    const payload = {
      store_name: s.store_name, tagline: s.tagline, contact_number: s.contact_number, email: s.email,
      whatsapp: s.whatsapp, instagram_url: s.instagram_url, delivery_charge: Number(s.delivery_charge),
      free_shipping_threshold: Number(s.free_shipping_threshold), gst_percent: Number(s.gst_percent),
      announcement_bar_text: s.announcement_bar_text, announcement_enabled: s.announcement_enabled,
    };
    try { await api.put("/admin/settings", payload); toast.success("Settings saved"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold mb-6">Store Settings</h1>
      <div className="bg-white rounded-2xl border border-[var(--line)] p-6 grid sm:grid-cols-2 gap-4">
        {FIELDS.map(([k, label, type]) => (
          <div key={k} className={k === "announcement_bar_text" ? "sm:col-span-2" : ""}>
            <label className="text-xs font-semibold">{label}</label>
            <input data-testid={`setting-${k}`} type={type} value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })}
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!s.announcement_enabled} onChange={(e) => setS({ ...s, announcement_enabled: e.target.checked })} className="accent-[var(--brand)]" /> Show announcement bar</label>
        <div className="sm:col-span-2"><button data-testid="save-settings-btn" onClick={save} className="px-7 py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Save Settings</button></div>
      </div>
      <p className="text-xs text-[var(--ink-soft)] mt-4">Changes apply instantly across the store — delivery charge, free-shipping threshold and announcement bar are all read live.</p>
    </div>
  );
}
