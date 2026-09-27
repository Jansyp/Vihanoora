import { useState } from "react";
import { ImageOff } from "lucide-react";
import { assetUrl, productSrcSet } from "@/lib/api";

const DEFAULT_SIZES = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";

// Centralized product-image renderer: responsive Cloudinary srcset, lazy/eager
// loading, and a graceful fallback (no broken-image icon, no retry loop).
export default function ProductImage({ src, alt = "", className = "", priority = false, sizes = DEFAULT_SIZES }) {
  const [failed, setFailed] = useState(false);
  const resolved = assetUrl(src);
  const srcSet = productSrcSet(src);

  if (failed || !resolved) {
    return (
      <div className={`${className} flex items-center justify-center bg-[var(--card-2)] text-[var(--ink-soft)]`} title="Image unavailable">
        <ImageOff size={16} />
      </div>
    );
  }

  return (
    <img
      src={resolved}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
