import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { SECTION_THEMES } from "@/lib/themes";
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
];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [sections, setSections] = useState([]);
  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      setS(data);
      setSections((data.home_sections || []).slice().sort((a, b) => a.order - b.order));
    });
  }, []);
  if (!s) return <p className="text-[var(--ink-soft)]">Loading...</p>;

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = sections.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next.map((x, idx) => ({ ...x, order: idx + 1 })));
  };
  const toggleSec = (i) => setSections(sections.map((x, idx) => idx === i ? { ...x, enabled: !x.enabled } : x));
  const setTheme = (i, theme) => setSections(sections.map((x, idx) => idx === i ? { ...x, theme } : x));
  const setField = (i, field, val) => setSections(sections.map((x, idx) => idx === i ? { ...x, [field]: val } : x));

  const save = async () => {
    const payload = {
      store_name: s.store_name, tagline: s.tagline, contact_number: s.contact_number, email: s.email,
      whatsapp: s.whatsapp, instagram_url: s.instagram_url, delivery_charge: Number(s.delivery_charge),
      free_shipping_threshold: Number(s.free_shipping_threshold), gst_percent: Number(s.gst_percent),
      home_sections: sections.map((x, idx) => ({ ...x, order: idx + 1 })),
    };
    try { await api.put("/admin/settings", payload); toast.success("Settings saved"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl font-semibold mb-6">Store Settings</h1>
      <div className="bg-white rounded-2xl border border-[var(--line)] p-6 grid sm:grid-cols-2 gap-4">
        {FIELDS.map(([k, label, type]) => (
          <div key={k}>
            <label className="text-xs font-semibold">{label}</label>
            <input data-testid={`setting-${k}`} type={type} value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })}
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          </div>
        ))}
      </div>

      <h2 className="font-serif text-2xl font-semibold mt-8 mb-2">Homepage Sections</h2>
      <p className="text-sm text-[var(--ink-soft)] mb-4">Reorder or hide sections shown on the homepage. Changes apply live.</p>
      <div className="bg-white rounded-2xl border border-[var(--line)] divide-y divide-[var(--line)]">
        {sections.map((sec, i) => (
          <div key={sec.key} data-testid={`home-section-${sec.key}`} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-[var(--ink-soft)] w-5">{i + 1}</span>
              <span className={`flex-1 min-w-[120px] text-sm font-medium ${sec.enabled ? "" : "text-[var(--ink-soft)] line-through"}`}>{sec.label}</span>
              <div className="flex items-center gap-1.5">
                {Object.entries(SECTION_THEMES).map(([key, t]) => (
                  <button key={key} onClick={() => setTheme(i, key)} data-testid={`theme-${sec.key}-${key}`} title={t.label}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${(sec.theme || "cream") === key ? "border-[var(--ink)] scale-110" : "border-[var(--line)]"}`}
                    style={{ background: t.bg }} />
                ))}
              </div>
              <button onClick={() => toggleSec(i)} data-testid={`toggle-section-${sec.key}`} className="text-[var(--ink-soft)] hover:text-[var(--brand)]" title={sec.enabled ? "Hide" : "Show"}>
                {sec.enabled ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-[var(--ink-soft)] hover:text-[var(--brand)] disabled:opacity-30"><ArrowUp size={17} /></button>
              <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-[var(--ink-soft)] hover:text-[var(--brand)] disabled:opacity-30"><ArrowDown size={17} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mt-2 pl-8">
              <input data-testid={`section-subtitle-${sec.key}`} value={sec.subtitle ?? ""} onChange={(e) => setField(i, "subtitle", e.target.value)}
                placeholder="Eyebrow / subtitle" className="px-3 py-2 rounded-lg bg-[var(--card-2)] outline-none text-xs" />
              <input data-testid={`section-title-${sec.key}`} value={sec.title ?? ""} onChange={(e) => setField(i, "title", e.target.value)}
                placeholder="Heading / title" className="px-3 py-2 rounded-lg bg-[var(--card-2)] outline-none text-xs" />
            </div>
          </div>
        ))}
      </div>

      <button data-testid="save-settings-btn" onClick={save} className="mt-6 px-7 py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Save All Settings</button>
      <p className="text-xs text-[var(--ink-soft)] mt-3">Delivery charge, free-shipping threshold, section order & visibility all read live across the store.</p>
    </div>
  );
}
