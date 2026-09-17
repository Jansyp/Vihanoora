import { Suspense, lazy, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Share2, Truck, ShieldCheck, RotateCcw, Star, Minus, Plus, ShoppingBag } from "lucide-react";
import api, { assetUrl, formatINR } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { Section, ProductRow, SectionHeader, GridSkeleton } from "@/components/common";
import { toast } from "sonner";

const Product3D = lazy(() => import("@/components/Product3D"));

export default function ProductPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { addToCart, toggleWishlist, inWishlist } = useCart();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [img, setImg] = useState(0);
  const [mode3d, setMode3d] = useState(false);
  const [color, setColor] = useState("");
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [rev, setRev] = useState({ name: "", rating: 5, comment: "" });

  useEffect(() => {
    setLoading(true); setMode3d(false); setImg(0);
    api.get(`/products/${slug}`).then(({ data }) => {
      setD(data); setColor(data.product.colors?.[0] || "");
    }).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <Section><GridSkeleton n={4} /></Section>;
  if (!d) return <Section><p className="text-center py-20">Product not found.</p></Section>;

  const p = d.product;
  const activeImages = p.color_images?.[color]?.length ? p.color_images[color] : p.images || [];
  const selectedProduct = activeImages === p.images ? p : { ...p, images: activeImages };
  const oos = p.stock_state === "Out of Stock";
  const wished = inWishlist(p.id);

  const selectColor = (value) => { setColor(value); setImg(0); setMode3d(false); };
  const buyNow = () => { addToCart(selectedProduct, qty, color); nav("/checkout"); };
  const share = () => {
    const url = window.location.href;
    const text = `Check out ${p.name} on Vihaanora — ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const goBack = () => {
    if (window.history.length > 1) nav(-1);
    else nav(`/${p.group}`);
  };
  const checkPin = () => {
    if (pin.length !== 6) { setPinMsg("Enter a valid 6-digit PIN"); return; }
    setPinMsg(`Delivery in 4-6 days to ${pin}. Flat ₹50 delivery.`);
  };
  const submitReview = async () => {
    if (!rev.name.trim()) { toast.error("Please enter your name"); return; }
    const { data } = await api.post(`/products/${p.id}/reviews`, { product_id: p.id, ...rev });
    setD((prev) => ({ ...prev, reviews: [data, ...prev.reviews] }));
    setRev({ name: "", rating: 5, comment: "" });
    toast.success("Thanks for your review!");
  };

  return (
    <div>
      <Section className="!py-8">
        <nav className="mb-6" aria-label="Product navigation">
          <button type="button" onClick={goBack} aria-label="Go to previous page"
            className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--brand)] transition-colors">
            <ArrowLeft size={16} /> <span>Previous page</span>
          </button>
        </nav>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-14">
          {/* Gallery */}
          <div>
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-white border border-[var(--line)] soft-shadow group">
              {mode3d ? (
                <Suspense fallback={<div className="skeleton w-full h-full" />}>
                  <Product3D image={assetUrl(activeImages[0])} />
                </Suspense>
              ) : (
                <img src={assetUrl(activeImages[img])} alt={p.name} className="w-full h-full object-cover" />
              )}
              {p.discount_percent > 0 && !mode3d && (
                <span className="absolute top-4 left-4 text-sm font-bold px-3 py-1 rounded-full bg-[var(--brand)] text-white">-{p.discount_percent}%</span>
              )}
              <button data-testid="toggle-3d" onClick={() => setMode3d((v) => !v)}
                className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-full bg-white/95 backdrop-blur text-sm font-medium soft-shadow hover:bg-white">
                <RotateCcw size={15} /> {mode3d ? "View Photos" : "Rotate in 3D"}
              </button>
            </div>
            {!mode3d && activeImages.length > 1 && (
              <div className="flex gap-3 mt-4">
                {activeImages.map((im, i) => (
                  <button key={i} onClick={() => setImg(i)} className={`w-20 h-20 rounded-2xl overflow-hidden border-2 ${img === i ? "border-[var(--brand)]" : "border-transparent"}`}>
                    <img src={assetUrl(im)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {p.rating > 0 && (
              <div className="flex items-center gap-1.5 text-[var(--amber)] mb-2">
                <Star size={15} className="fill-current" />
                <span className="text-sm font-medium text-[var(--ink-soft)]">{p.rating} · {p.review_count} reviews</span>
              </div>
            )}
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--ink)]">{p.name}</h1>
            <div className="flex items-center gap-3 mt-4">
              <span className="text-3xl font-bold text-[var(--brand)]">{formatINR(p.effective_price)}</span>
              {p.discount_percent > 0 && <>
                <span className="text-lg line-through text-[var(--ink-soft)]">{formatINR(p.mrp)}</span>
                <span className="text-sm font-semibold text-[var(--sage-dark)] bg-[var(--sage)] px-2 py-0.5 rounded-full">{p.discount_percent}% OFF</span>
              </>}
            </div>
            <p className={`text-sm font-medium mt-2 ${oos ? "text-destructive" : p.stock_state.startsWith("Only") ? "text-[var(--amber)]" : "text-[var(--sage-dark)]"}`}>{p.stock_state}</p>

            <p className="text-[var(--ink-soft)] leading-relaxed mt-5">{p.description}</p>

            {p.colors?.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-semibold mb-2">Color: <span className="font-normal text-[var(--ink-soft)]">{color}</span></p>
                <div className="flex gap-2">
                  {p.colors.map((c) => (
                    <button key={c} onClick={() => selectColor(c)} data-testid={`color-${c}`}
                      className={`px-4 py-2 rounded-full text-sm font-medium border-2 ${color === c ? "border-[var(--brand)] bg-[var(--blush)]" : "border-[var(--line)]"}`}>{c}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-4">
              <div className="flex items-center border border-[var(--line)] rounded-full">
                <button data-testid="qty-minus" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-3"><Minus size={16} /></button>
                <span className="w-8 text-center font-semibold" data-testid="qty-value">{qty}</span>
                <button data-testid="qty-plus" onClick={() => setQty((q) => q + 1)} className="p-3"><Plus size={16} /></button>
              </div>
              <button data-testid="wishlist-detail" onClick={() => toggleWishlist(p)}
                className="w-12 h-12 rounded-full border border-[var(--line)] flex items-center justify-center hover:border-[var(--brand)]">
                <Heart size={18} className={wished ? "fill-[var(--brand)] text-[var(--brand)]" : ""} />
              </button>
              <button data-testid="share-btn" onClick={share} className="w-12 h-12 rounded-full border border-[var(--line)] flex items-center justify-center hover:border-[var(--brand)]">
                <Share2 size={18} />
              </button>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button data-testid="add-to-cart-detail" disabled={oos} onClick={() => addToCart(selectedProduct, qty, color)}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-full bg-[var(--ink)] text-white font-medium hover:bg-[var(--brand)] transition-colors disabled:opacity-40">
                <ShoppingBag size={18} /> Add to Cart
              </button>
              <button data-testid="buy-now" disabled={oos} onClick={buyNow}
                className="flex-1 py-4 rounded-full bg-[var(--brand)] text-white font-medium hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-40">
                Buy Now
              </button>
            </div>

            <div className="mt-6 p-4 bg-white rounded-2xl border border-[var(--line)]">
              <div className="flex gap-2">
                <input data-testid="pin-input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter PIN code" className="flex-1 px-4 py-2.5 rounded-full bg-[var(--card-2)] outline-none text-sm" />
                <button data-testid="pin-check" onClick={checkPin} className="px-5 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm font-medium">Check</button>
              </div>
              {pinMsg && <p className="text-xs text-[var(--sage-dark)] mt-2">{pinMsg}</p>}
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--ink-soft)]">
                <span className="flex items-center gap-1.5"><Truck size={14} /> Flat ₹50 delivery</span>
                <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Secure checkout</span>
                <span className="flex items-center gap-1.5"><RotateCcw size={14} /> Easy returns</span>
              </div>
            </div>

            {(p.details || p.material) && (
              <div className="mt-6 text-sm text-[var(--ink-soft)] space-y-1">
                {p.details && <p><span className="font-semibold text-[var(--ink)]">Details: </span>{p.details}</p>}
                {p.material && <p><span className="font-semibold text-[var(--ink)]">Material: </span>{p.material}</p>}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Frequently bought */}
      {d.frequently_bought?.length > 0 && (
        <Section className="!pt-0">
          <SectionHeader subtitle="Complete the look" title="Frequently Bought Together" />
          <ProductRow products={d.frequently_bought} />
        </Section>
      )}

      {/* Reviews */}
      <Section className="bg-white rounded-[2.5rem] mx-2 sm:mx-6 lg:mx-12">
        <SectionHeader subtitle="What buyers say" title="Reviews" />
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {d.reviews.length === 0 && <p className="text-[var(--ink-soft)]">No reviews yet. Be the first!</p>}
            {d.reviews.map((r) => (
              <div key={r.id} className="bg-[var(--card-2)] rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{r.name}</span>
                  <div className="flex gap-0.5 text-[var(--amber)]">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={13} className="fill-current" />)}</div>
                </div>
                {r.comment && <p className="text-sm text-[var(--ink-soft)] mt-2">{r.comment}</p>}
              </div>
            ))}
          </div>
          <div className="bg-[var(--card-2)] rounded-2xl p-5 h-fit">
            <h4 className="font-semibold mb-3">Write a review</h4>
            <input data-testid="review-name" value={rev.name} onChange={(e) => setRev({ ...rev, name: e.target.value })} placeholder="Your name" className="w-full px-4 py-2.5 rounded-xl mb-2 outline-none text-sm" />
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRev({ ...rev, rating: s })}><Star size={20} className={s <= rev.rating ? "fill-[var(--amber)] text-[var(--amber)]" : "text-[var(--line)]"} /></button>
              ))}
            </div>
            <textarea data-testid="review-comment" value={rev.comment} onChange={(e) => setRev({ ...rev, comment: e.target.value })} placeholder="Share your thoughts..." rows={3} className="w-full px-4 py-2.5 rounded-xl mb-2 outline-none text-sm resize-none" />
            <button data-testid="review-submit" onClick={submitReview} className="w-full py-2.5 rounded-full bg-[var(--ink)] text-white text-sm font-medium">Submit Review</button>
          </div>
        </div>
      </Section>

      {/* Related */}
      {d.related?.length > 0 && (
        <Section>
          <SectionHeader subtitle="You may also like" title="Related Products" to={`/${p.group}`} />
          <ProductRow products={d.related} />
        </Section>
      )}
    </div>
  );
}
