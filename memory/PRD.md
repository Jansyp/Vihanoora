# Vihaanora — PRD & Build Log

## Original Problem
Production-ready, mobile-first e-commerce + gifting platform for "Vihaanora" (tagline: *Little Things. Beautiful Moments.*). Product universe: Women (jewellery, crystal bracelets, hair accessories, scrunchies), Kids (toys, giftables), Gifts (birthday/couple/return/festival/hampers), Combo Offers. Instagram-native, gift-first vibe with a 3D progressive-enhancement layer.

## Stack (as built)
- Frontend: React 19 + React Router 7 + Tailwind + Framer Motion + react-three-fiber/drei (3D)
- Backend: FastAPI (modular routers) + Motor
- DB: MongoDB (uuid string IDs, `id` field; never Mongo `_id`)
- Auth: JWT email/password (Admin+Customer) **and** Emergent Google OAuth
- Payments: Razorpay (server-verified, webhook idempotent) — runs in MOCK mode until keys added

## User choices
React/FastAPI/Mongo · Razorpay · build everything · JWT + Google auth · 3D enabled.

## Implemented (2026-06)
- **Storefront**: 3D WebGL hero (with 2D fallback + reduce-motion), clay category tiles, Trending/Best Sellers/New Arrivals/Gift Picks/Combos/Offer Zone/Instagram gallery/Reviews/Newsletter, sticky header + mobile bottom nav + floating WhatsApp.
- **Catalog**: products with auto discount % (from MRP/selling), flash deals (auto-expire), stock states, tilt product cards, category pages with filters (subcat, price, discount 10/20/30/40/50+) & sorts, search.
- **Product page**: gallery + "Rotate in 3D" viewer, variants, qty, stock, add/buy-now/wishlist/WhatsApp share, PIN estimate, related + frequently-bought, reviews (add live).
- **Offer Zone**: auto-populated, live max-discount claim.
- **Combos**: list + detail, auto combo discount/savings, add as combo line item.
- **Cart/Checkout**: client cart + server `/cart/validate` (re-prices, coupons, admin-configurable delivery/free-ship threshold), guest + logged-in checkout, Razorpay (mock fallback), gift-reveal success screen.
- **Orders/Tracking**: sequential IDs `JH2026xxxxx`, status lifecycle, public Track Order (order# + mobile/email), status timeline, courier/AWB.
- **Coupons**: %/flat, min order, max cap, validity, total + per-customer usage limits.
- **Admin**: dashboard (sales/orders/status/low-stock/top-sellers), product CRUD + flags + flash + stock, orders (status + shipping/AWB → auto Shipped), combos CRUD, coupons CRUD, categories view, store settings (all live-editable).
- **Account**: orders, addresses, wishlist; JWT + Google login; RBAC admin guard.
- **Business rules honored**: delivery ₹50 admin-configurable, order confirmed only after server-verified payment, payment vs order status independent, inventory auto-decrement on paid + no overselling, discount always computed, SellingPrice<MRP auto-enrolls Offer Zone, combos w/ linked inventory, flash/combo expiry, guest checkout always available, mobile-first + 3D 2D-fallback.

## Testing
- Backend: 27/27 pytest pass (catalog, offer zone, combos, cart+coupons, guest order + mock payment, stock decrement, OOS block, tracking, webhook idempotency, auth, admin RBAC/CRUD, order status+shipping, settings propagation).
- Frontend: checkout→order-success→track verified 100%; catalog/product/cart/admin flows verified.

## Backlog / Next (P1/P2)
- Real Razorpay keys → live payments + webhook secret enforcement
- Cloudinary/object-storage image uploads in admin (currently URL paste)
- Email notifications (order lifecycle), SEO sitemap/OG/structured data, GA/Meta Pixel wiring
- Admin category/subcategory & banner CRUD editor UI (backend endpoints exist)
- Abandoned cart, loyalty/referrals, GST invoices

## Credentials
See /app/memory/test_credentials.md — Admin: admin@vihaanora.com / Admin@123

## Feature Batch 2 (2026-06) — DONE
- **Image Uploads**: Admin uploads product & combo images via built-in Emergent object storage (`/api/admin/upload` → `/api/files/{path}`); ImageUploader UI with thumbnails. Verified 100%.
- **Order Emails**: Resend integration (`mailer.py`) sends branded HTML emails on paid/processing/shipped/delivered/cancelled. Runs in CONSOLE-LOG fallback until `RESEND_API_KEY` is set in backend/.env.
- **Live Payments**: Razorpay flow fully implemented & live-ready; auto-activates when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` added (currently MOCK).
- **Banner Studio**: Admin `/admin/banners` CRUD (title, subtitle, image, CTA, order, active) powering the homepage hero as a rotating carousel over the 3D scene. Verified 100%.

## To go live
- Add `RESEND_API_KEY` (+ verified sender) for real emails
- Add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (+ webhook secret) for real payments

## Feature Batch 3 (2026-06) — DONE
- **Homepage Sections**: `home_sections` in store settings; admin `/admin/settings` toggles visibility + reorders 9 sections; Home renders dynamically. Verified 100%.
- **Announcement Editor**: `announcements` collection + admin `/admin/announcements` CRUD with start/end scheduling; public `/api/announcements` returns only live/in-window (legacy settings fallback); header rotates multiple. Verified 100%.
- **Section Themes**: each `home_section` has a `theme` (cream/white/blush/sage/butter/lavender); admin picks a colour swatch per section in `/admin/settings`; homepage renders each section with its themed background live.
- **Section Headings**: each `home_section` also stores editable `title` (heading) and `subtitle` (eyebrow); admins edit them inline in `/admin/settings`; homepage renders custom copy with sensible defaults.
