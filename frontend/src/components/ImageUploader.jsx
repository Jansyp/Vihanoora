import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import api, { API, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function ImageUploader({ images = [], onChange, label = "Images", max = 6 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files) => {
    const list = Array.from(files).slice(0, max - images.length);
    if (list.length === 0) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        urls.push(data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`);
      }
      onChange([...images, ...urls]);
      toast.success(`${urls.length} image(s) uploaded`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <label className="text-xs font-semibold">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {images.map((url, i) => (
          <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--line)] group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(images.filter((_, idx) => idx !== i))}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100" data-testid={`remove-image-${i}`}>
              <X size={12} />
            </button>
          </div>
        ))}
        {images.length < max && (
          <button type="button" data-testid="upload-image-btn" disabled={busy} onClick={() => inputRef.current?.click()}
            className="w-16 h-16 rounded-xl border-2 border-dashed border-[var(--line)] flex items-center justify-center text-[var(--ink-soft)] hover:border-[var(--brand)] disabled:opacity-50">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="image-file-input" />
      <p className="text-[10px] text-[var(--ink-soft)] mt-1">Upload up to {max} images (jpg, png, webp · max 8MB each)</p>
    </div>
  );
}
