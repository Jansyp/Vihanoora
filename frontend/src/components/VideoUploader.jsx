import { useRef, useState } from "react";
import { Film, Loader2, RefreshCw, Upload, X } from "lucide-react";
import api, { assetUrl, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

export default function VideoUploader({ url = "", filename = "", onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!['video/mp4', 'video/webm'].includes(file.type) && !/\.(mp4|webm)$/i.test(file.name)) {
      toast.error("Only MP4 and WebM videos are supported");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast.error("Video too large (max 50MB)");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/admin/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      onChange({ url: data.url, filename: data.original_filename || file.name });
      toast.success("Product video uploaded");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="text-xs font-semibold">Product Video (optional)</label>
      {url ? (
        <div className="mt-1 rounded-xl border border-[var(--line)] bg-[var(--card-2)] p-3">
          <video src={assetUrl(url)} controls preload="metadata" className="w-full max-h-56 rounded-lg bg-black" />
          <div className="flex items-center justify-between gap-3 mt-2">
            <span className="flex min-w-0 items-center gap-2 text-xs text-[var(--ink-soft)]"><Film size={14} /><span className="truncate">{filename || "Product video"}</span></span>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium"><RefreshCw size={13} /> Replace</button>
              <button type="button" onClick={() => onChange({ url: "", filename: "" })} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-destructive"><X size={13} /> Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] py-8 text-sm text-[var(--ink-soft)] hover:border-[var(--brand)] disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Upload Video
        </button>
      )}
      <input ref={inputRef} type="file" accept="video/mp4,video/webm,.mp4,.webm" hidden onChange={(event) => upload(event.target.files?.[0])} />
      <p className="mt-1 text-[10px] text-[var(--ink-soft)]">Supported formats: MP4, WebM. Maximum size: 50MB. Leave empty if unavailable.</p>
    </div>
  );
}