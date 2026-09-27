import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import api, { assetUrl } from "@/lib/api";

// Renders an order item's snapshot image, falling back to the current product image
// (via product_id) for legacy orders, and a clean placeholder if nothing loads.
export default function OrderItemImage({ image, productId, alt, className = "w-10 h-10 rounded-lg object-cover" }) {
  const [src, setSrc] = useState(() => (image ? assetUrl(image) : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (image) { setSrc(assetUrl(image)); return; }
    if (!productId) { setSrc(null); return; }
    let active = true;
    api.get(`/products/${productId}`)
      .then(({ data }) => { if (active) setSrc(assetUrl((data.images || [])[0]) || null); })
      .catch(() => { if (active) setSrc(null); });
    return () => { active = false; };
  }, [image, productId]);

  if (failed || !src) {
    return (
      <div className={`${className} shrink-0 flex items-center justify-center bg-[var(--card-2)] text-[var(--ink-soft)]`} title="Image unavailable">
        <ImageOff size={14} />
      </div>
    );
  }
  return <img src={src} alt={alt || ""} className={`${className} shrink-0`} onError={() => setFailed(true)} />;
}
