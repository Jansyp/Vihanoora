import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  useEffect(() => { api.get("/categories").then(({ data }) => setCats(data)); }, []);
  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-6">Categories</h1>
      <div className="grid sm:grid-cols-2 gap-4">
        {cats.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-[var(--line)] p-5">
            <h3 className="font-semibold text-lg capitalize">{c.name} <span className="text-xs text-[var(--ink-soft)]">/{c.slug}</span></h3>
            <div className="flex flex-wrap gap-2 mt-3">
              {c.subcategories?.map((s) => (
                <span key={s.slug} className="px-3 py-1 rounded-full bg-[var(--card-2)] text-xs font-medium">{s.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-[var(--ink-soft)] mt-6">Categories map products by their <b>group</b> and <b>category slug</b>. Assign these when creating products.</p>
    </div>
  );
}
