import { headTags } from "@/lib/seoMeta";

/** Applies page metadata to <head>, replacing any previously managed (data-seo) tags. */
export function applySeo(meta) {
  if (typeof document === "undefined" || !meta) return;
  document.title = meta.title;
  document.head.querySelectorAll("[data-seo]").forEach((el) => el.remove());
  // Tags from the static HTML shell that are not marked data-seo.
  document.head.querySelectorAll('meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]').forEach((el) => el.remove());
  const frag = document.createDocumentFragment();
  headTags(meta).forEach(([tag, attrs, text]) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    el.setAttribute("data-seo", "1");
    if (text) el.textContent = text;
    frag.appendChild(el);
  });
  document.head.appendChild(frag);
}
