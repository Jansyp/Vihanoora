"""Commerce routes: settings, cart, coupons, orders, payments, tracking, wishlist, addresses."""
import os
import uuid
import hmac
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException

from core import (db, enrich_product, next_order_number, now_iso,
                  get_current_user, get_optional_user)
from mailer import send_order_email
from models import (ValidateCartInput, CreateOrderInput, VerifyPaymentInput,
                    TrackInput, AddressInput, CartItemIn)

router = APIRouter(prefix="/api", tags=["commerce"])

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
PAYMENT_MODE = "razorpay" if (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) else "mock"


def _product_image_for_variant(product: dict, variant: str | None) -> str:
    """Return the first image assigned to a selected color, with a legacy fallback."""
    color_images = product.get("color_images") or {}
    variant_images = color_images.get(variant) if variant else None
    return (variant_images or product.get("images") or [""])[0]


DEFAULT_SETTINGS = {
    "store_name": "Viaura",
    "tagline": "Little Things. Beautiful Moments.",
    "logo": "",
    "contact_number": "+917010177567",
    "email": "hello@Viaura.com",
    "whatsapp": "919000000000",
    "instagram_url": "https://instagram.com/Viaura",
    "delivery_charge": 50,
    "free_shipping_threshold": 999,
    "currency": "INR",
    "gst_percent": 0,
    "announcement_bar_text": "✨ Free shipping on orders above ₹999 • Flat ₹50 delivery • Shop the Instagram trends",
    "announcement_enabled": True,
    "home_sections": [
        {"key": "trending", "label": "Trending on Instagram", "enabled": True, "order": 1, "theme": "white", "subtitle": "#Viaura", "title": "Trending on Instagram"},
        {"key": "best_sellers", "label": "Best Sellers", "enabled": True, "order": 2, "theme": "cream", "subtitle": "Loved by many", "title": "Best Sellers"},
        {"key": "offer_banner", "label": "Offer Zone Banner", "enabled": True, "order": 3, "theme": "cream", "subtitle": "Flash & Everyday Deals", "title": ""},
        {"key": "new_arrivals", "label": "New Arrivals", "enabled": True, "order": 4, "theme": "cream", "subtitle": "Fresh drops", "title": "New Arrivals"},
        {"key": "gift_picks", "label": "Gift Picks", "enabled": True, "order": 5, "theme": "blush", "subtitle": "For someone special", "title": "Gift Picks"},
        {"key": "combos", "label": "Combo Offers", "enabled": True, "order": 6, "theme": "cream", "subtitle": "Bundle & save", "title": "Combo Offers"},
        {"key": "instagram", "label": "Instagram Gallery", "enabled": True, "order": 7, "theme": "white", "subtitle": "@Viaura", "title": "Viaura on Instagram"},
        {"key": "reviews", "label": "Customer Reviews", "enabled": True, "order": 8, "theme": "sage", "subtitle": "Kind words", "title": "Customer Reviews"},
        {"key": "newsletter", "label": "Newsletter", "enabled": True, "order": 9, "theme": "cream", "subtitle": "", "title": "Join the Viaura fam ✨"},
    ],
}


async def get_settings() -> dict:
    s = await db.store_settings.find_one({"id": "singleton"}, {"_id": 0})
    if not s:
        s = {"id": "singleton", **DEFAULT_SETTINGS}
        await db.store_settings.insert_one(dict(s))
    merged = {**DEFAULT_SETTINGS, **s}
    return merged


@router.get("/settings")
async def public_settings():
    return await get_settings()


@router.get("/announcements")
async def public_announcements():
    now = datetime.now(timezone.utc).isoformat()
    docs = await db.announcements.find({"active": True}, {"_id": 0}).sort([("order", 1)]).to_list(50)
    live = [a for a in docs if (not a.get("start") or a["start"] <= now) and (not a.get("end") or a["end"] >= now)]
    if live:
        return live
    # Fallback to legacy single announcement in settings
    s = await get_settings()
    if s.get("announcement_enabled") and s.get("announcement_bar_text"):
        return [{"id": "legacy", "text": s["announcement_bar_text"], "active": True}]
    return []


@router.get("/payment-config")
async def payment_config():
    return {"mode": PAYMENT_MODE, "key_id": RAZORPAY_KEY_ID}


async def _price_items(items: list[CartItemIn]):
    """Re-price items from DB. Returns (line_items, subtotal, total_mrp)."""
    line_items = []
    subtotal = 0.0
    total_mrp = 0.0
    for it in items:
        if it.combo:
            c = await db.combos.find_one({"id": it.product_id})
            if not c or not c.get("active"):
                raise HTTPException(status_code=400, detail="Combo unavailable")
            if int(c.get("stock", 0)) < it.qty:
                raise HTTPException(status_code=400, detail=f"'{c['name']}' is out of stock")
            price = float(c["combo_price"])
            mrp = float(c.get("original_price", price))
            line_items.append({
                "product_id": it.product_id, "name": c["name"],
                "image": (c.get("images") or [""])[0], "variant": None,
                "qty": it.qty, "mrp": mrp, "unit_price": price,
                "discount": round((mrp - price)), "combo": True,
            })
        else:
            p = await db.products.find_one({"id": it.product_id})
            if not p or not p.get("active"):
                raise HTTPException(status_code=400, detail="Product unavailable")
            ep = enrich_product(dict(p))
            if int(p.get("stock", 0)) < it.qty:
                raise HTTPException(status_code=400, detail=f"'{p['name']}' is out of stock")
            price = ep["effective_price"]
            mrp = float(p["mrp"])
            line_items.append({
                "product_id": it.product_id, "name": p["name"],
                "image": _product_image_for_variant(p, it.variant), "variant": it.variant,
                "qty": it.qty, "mrp": mrp, "unit_price": price,
                "discount": round((mrp - price)), "combo": False,
            })
        subtotal += price * it.qty
        total_mrp += mrp * it.qty
    return line_items, round(subtotal, 2), round(total_mrp, 2)


async def _apply_coupon(code: str, subtotal: float, email: str | None):
    if not code:
        return 0.0, None
    coupon = await db.coupons.find_one({"code": code.upper(), "active": True})
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon code")
    now = datetime.now(timezone.utc).isoformat()
    if coupon.get("valid_from") and now < coupon["valid_from"]:
        raise HTTPException(status_code=400, detail="Coupon not yet active")
    if coupon.get("valid_to") and now > coupon["valid_to"]:
        raise HTTPException(status_code=400, detail="Coupon has expired")
    if subtotal < float(coupon.get("min_order", 0)):
        raise HTTPException(status_code=400, detail=f"Minimum order ₹{coupon['min_order']} required for this coupon")
    if coupon.get("total_usage_limit") is not None and coupon.get("used_count", 0) >= coupon["total_usage_limit"]:
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    if email and coupon.get("per_customer_limit") is not None:
        used = await db.coupon_usage.count_documents({"code": coupon["code"], "email": email.lower()})
        if used >= coupon["per_customer_limit"]:
            raise HTTPException(status_code=400, detail="You have already used this coupon")
    if coupon["type"] == "percentage":
        disc = subtotal * float(coupon["value"]) / 100
        if coupon.get("max_discount"):
            disc = min(disc, float(coupon["max_discount"]))
    else:
        disc = float(coupon["value"])
    disc = round(min(disc, subtotal), 2)
    return disc, coupon["code"]


@router.post("/cart/validate")
async def validate_cart(payload: ValidateCartInput):
    settings = await get_settings()
    line_items, subtotal, total_mrp = await _price_items(payload.items)
    coupon_discount, applied = 0.0, None
    coupon_error = None
    if payload.coupon_code:
        try:
            coupon_discount, applied = await _apply_coupon(payload.coupon_code, subtotal, payload.email)
        except HTTPException as e:
            coupon_error = e.detail
    delivery = 0 if subtotal >= float(settings["free_shipping_threshold"]) else float(settings["delivery_charge"])
    grand_total = round(subtotal + delivery - coupon_discount, 2)
    return {
        "items": line_items, "subtotal": subtotal, "total_mrp": total_mrp,
        "product_discount": round(total_mrp - subtotal, 2),
        "delivery_charge": delivery, "coupon_discount": coupon_discount,
        "coupon_code": applied, "coupon_error": coupon_error,
        "grand_total": grand_total, "currency": settings["currency"],
    }


@router.post("/orders")
async def create_order(payload: CreateOrderInput, request: Request, user: dict = Depends(get_optional_user)):
    settings = await get_settings()
    line_items, subtotal, total_mrp = await _price_items(payload.items)
    coupon_discount, applied = await _apply_coupon(payload.coupon_code, subtotal, payload.customer.email) if payload.coupon_code else (0.0, None)
    delivery = 0 if subtotal >= float(settings["free_shipping_threshold"]) else float(settings["delivery_charge"])
    grand_total = round(subtotal + delivery - coupon_discount, 2)

    order_id = str(uuid.uuid4())
    order_number = await next_order_number()
    order = {
        "id": order_id,
        "order_number": order_number,
        "user_id": user["id"] if user else None,
        "customer": payload.customer.model_dump(),
        "items": line_items,
        "subtotal": subtotal,
        "total_mrp": total_mrp,
        "delivery_charge": delivery,
        "coupon_code": applied,
        "coupon_discount": coupon_discount,
        "grand_total": grand_total,
        "currency": settings["currency"],
        "order_status": "Payment Pending",
        "payment_status": "PENDING",
        "payment": {},
        "shipping": {},
        "status_history": [{"status": "Placed", "at": now_iso()}],
        "created_at": now_iso(),
    }

    razorpay_order = None
    if PAYMENT_MODE == "razorpay":
        import razorpay
        rp = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        razorpay_order = rp.order.create({
            "amount": int(round(grand_total * 100)),
            "currency": settings["currency"],
            "receipt": order_number,
            "payment_capture": 1,
        })
        order["payment"]["razorpay_order_id"] = razorpay_order["id"]

    await db.orders.insert_one(dict(order))
    order.pop("_id", None)
    return {
        "order": order,
        "payment_mode": PAYMENT_MODE,
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "razorpay_order_id": razorpay_order["id"] if razorpay_order else None,
        "amount": int(round(grand_total * 100)),
    }


async def _finalize_paid(order: dict, payment_id: str, method: str = "razorpay"):
    """Decrement stock, record coupon usage, mark order paid. Idempotent."""
    if order.get("payment_status") == "PAID":
        return
    for it in order["items"]:
        if it.get("combo"):
            await db.combos.update_one({"id": it["product_id"]},
                                       {"$inc": {"stock": -it["qty"], "sold_count": it["qty"]}})
        else:
            await db.products.update_one({"id": it["product_id"]},
                                         {"$inc": {"stock": -it["qty"], "sold_count": it["qty"]}})
    if order.get("coupon_code"):
        await db.coupons.update_one({"code": order["coupon_code"]}, {"$inc": {"used_count": 1}})
        await db.coupon_usage.insert_one({
            "id": str(uuid.uuid4()), "code": order["coupon_code"],
            "email": order["customer"]["email"].lower(), "order_id": order["id"],
            "at": now_iso(),
        })
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"payment_status": "PAID", "order_status": "Paid",
                  "payment.razorpay_payment_id": payment_id, "payment.method": method,
                  "paid_at": now_iso()},
         "$push": {"status_history": {"status": "Payment Confirmed", "at": now_iso()}}},
    )
    fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    if fresh:
        await send_order_email("paid", fresh)


@router.post("/payments/verify")
async def verify_payment(payload: VerifyPaymentInput):
    order = await db.orders.find_one({"id": payload.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if PAYMENT_MODE == "razorpay":
        body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
        expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, payload.razorpay_signature or ""):
            await db.orders.update_one({"id": order["id"]},
                                       {"$set": {"payment_status": "FAILED"}})
            raise HTTPException(status_code=400, detail="Payment signature verification failed")
        await _finalize_paid(order, payload.razorpay_payment_id, "razorpay")
    else:
        # Mock mode: accept and mark paid
        await _finalize_paid(order, f"mock_{uuid.uuid4().hex[:12]}", "mock")
    updated = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    return {"status": "success", "order": updated}


@router.post("/payments/webhook")
async def payment_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if RAZORPAY_WEBHOOK_SECRET:
        expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    import json
    payload = json.loads(body.decode())
    event_id = request.headers.get("X-Razorpay-Event-Id", str(uuid.uuid4()))
    if await db.webhook_events.find_one({"event_id": event_id}):
        return {"status": "duplicate_ignored"}
    await db.webhook_events.insert_one({"event_id": event_id, "at": now_iso(), "event": payload.get("event")})
    event = payload.get("event")
    entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    rp_order_id = entity.get("order_id")
    if rp_order_id:
        order = await db.orders.find_one({"payment.razorpay_order_id": rp_order_id})
        if order:
            if event in ("payment.captured", "order.paid"):
                await _finalize_paid(order, entity.get("id", "webhook"), "razorpay")
            elif event == "payment.failed":
                await db.orders.update_one({"id": order["id"]}, {"$set": {"payment_status": "FAILED"}})
    return {"status": "processed"}


@router.get("/orders/track")
async def track_order(order_number: str, contact: str):
    order = await db.orders.find_one({"order_number": order_number}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    c = order["customer"]
    if contact.lower() not in (c["email"].lower(), c["mobile"]):
        raise HTTPException(status_code=403, detail="Contact does not match order")
    return {
        "order_number": order["order_number"],
        "order_status": order["order_status"],
        "payment_status": order["payment_status"],
        "status_history": order.get("status_history", []),
        "shipping": order.get("shipping", {}),
        "items": [{"name": i["name"], "qty": i["qty"], "image": i.get("image")} for i in order["items"]],
        "grand_total": order["grand_total"],
        "created_at": order["created_at"],
    }


@router.get("/orders/{order_id}")
async def get_order(order_id: str):
    order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/my/orders")
async def my_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    return orders


# ---- Wishlist ----
@router.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    wl = await db.wishlists.find_one({"user_id": user["id"]}, {"_id": 0})
    ids = wl.get("product_ids", []) if wl else []
    docs = await db.products.find({"id": {"$in": ids}}).to_list(200)
    return [enrich_product(d) for d in docs]


@router.post("/wishlist/{product_id}")
async def toggle_wishlist(product_id: str, user: dict = Depends(get_current_user)):
    wl = await db.wishlists.find_one({"user_id": user["id"]})
    ids = wl.get("product_ids", []) if wl else []
    if product_id in ids:
        ids.remove(product_id)
        added = False
    else:
        ids.append(product_id)
        added = True
    await db.wishlists.update_one({"user_id": user["id"]},
                                  {"$set": {"product_ids": ids}}, upsert=True)
    return {"added": added, "product_ids": ids}


# ---- Addresses ----
@router.get("/addresses")
async def list_addresses(user: dict = Depends(get_current_user)):
    return await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)


@router.post("/addresses")
async def add_address(payload: AddressInput, user: dict = Depends(get_current_user)):
    addr = {"id": str(uuid.uuid4()), "user_id": user["id"], **payload.model_dump()}
    if payload.is_default:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.insert_one(dict(addr))
    addr.pop("_id", None)
    return addr


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    return {"deleted": True}
