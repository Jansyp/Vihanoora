"""Commerce routes: settings, cart, coupons, orders, payments, tracking, wishlist, addresses."""
import os
import uuid
import base64
import hmac
import hashlib
import json
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException
import httpx

from core import (db, enrich_product, next_order_number, now_iso,
                  get_current_user, get_optional_user)
from mailer import send_order_email
from models import (ValidateCartInput, CreateOrderInput, VerifyPaymentInput,
                    TrackInput, AddressInput, CartItemIn)

router = APIRouter(prefix="/api", tags=["commerce"])

CASHFREE_APP_ID = os.environ.get("CASHFREE_APP_ID", "")
CASHFREE_SECRET_KEY = os.environ.get("CASHFREE_SECRET_KEY", "")
CASHFREE_ENVIRONMENT = os.environ.get("CASHFREE_ENVIRONMENT", "sandbox").lower()
CASHFREE_API_VERSION = os.environ.get("CASHFREE_API_VERSION", "2026-01-01")
CASHFREE_API_BASE = os.environ.get(
    "CASHFREE_API_BASE",
    "https://api.cashfree.com/pg" if CASHFREE_ENVIRONMENT == "production" else "https://sandbox.cashfree.com/pg",
).rstrip("/")
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
CASHFREE_WEBHOOK_URL = os.environ.get("CASHFREE_WEBHOOK_URL", "")
PAYMENT_MODE = "cashfree" if (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) else "mock"


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
    return {"mode": PAYMENT_MODE, "environment": CASHFREE_ENVIRONMENT}


def _cashfree_headers() -> dict[str, str]:
    return {
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
        "x-api-version": CASHFREE_API_VERSION,
        "accept": "application/json",
        "content-type": "application/json",
    }


async def _cashfree_request(method: str, path: str, **kwargs):
    request_headers = {**_cashfree_headers(), **kwargs.pop("headers", {})}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(method, f"{CASHFREE_API_BASE}{path}", headers=request_headers, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Cashfree payment service is unavailable") from exc
    if response.is_error:
        raise HTTPException(status_code=502, detail="Cashfree payment service rejected the request")
    return response.json()


def _amount_matches(left, right) -> bool:
    try:
        return Decimal(str(left)).quantize(Decimal("0.01")) == Decimal(str(right)).quantize(Decimal("0.01"))
    except Exception:
        return False


def _cashfree_signature_is_valid(raw_body: bytes, timestamp: str, signature: str) -> bool:
    if not CASHFREE_SECRET_KEY or not timestamp or not signature:
        return False
    signed = timestamp.encode() + raw_body
    expected = base64.b64encode(hmac.new(CASHFREE_SECRET_KEY.encode(), signed, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected, signature)


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

    cashfree_order = None
    if PAYMENT_MODE == "cashfree":
        cashfree_payload = {
            "order_id": order_number,
            "order_amount": grand_total,
            "order_currency": settings["currency"],
            "customer_details": {
                "customer_id": order_id.replace("-", "")[:50],
                "customer_name": payload.customer.name,
                "customer_email": payload.customer.email,
                "customer_phone": payload.customer.mobile,
            },
            "order_meta": {"return_url": f"{FRONTEND_BASE_URL}/payment-return/{order_number}?order_id={order_number}"},
        }
        if CASHFREE_WEBHOOK_URL:
            cashfree_payload["order_meta"]["notify_url"] = CASHFREE_WEBHOOK_URL
        cashfree_order = await _cashfree_request(
            "POST", "/orders", json=cashfree_payload, headers={**_cashfree_headers(), "x-idempotency-key": order_id}
        )
        if not cashfree_order.get("payment_session_id") or cashfree_order.get("order_id") != order_number:
            raise HTTPException(status_code=502, detail="Cashfree returned an invalid payment session")
        order["payment"].update({
            "provider": "cashfree",
            "cashfree_order_id": cashfree_order["order_id"],
            "cashfree_payment_session_id": cashfree_order["payment_session_id"],
        })

    await db.orders.insert_one(dict(order))
    order.pop("_id", None)
    return {
        "order": order,
        "payment_mode": PAYMENT_MODE,
        "payment_session_id": cashfree_order.get("payment_session_id") if cashfree_order else None,
        "cashfree_order_id": cashfree_order.get("order_id") if cashfree_order else None,
        "amount": int(round(grand_total * 100)),
    }


async def _finalize_paid(order: dict, payment_id: str, method: str = "cashfree"):
    """Decrement stock, record coupon usage, mark order paid. Idempotent."""
    if order.get("payment_status") == "PAID":
        return True
    claim = await db.orders.update_one(
        {"id": order["id"], "payment_status": {"$ne": "PAID"}, "payment.finalizing": {"$ne": True}},
        {"$set": {"payment.finalizing": True}},
    )
    if claim.matched_count != 1:
        return False
    decremented = []
    for it in order["items"]:
        collection = db.combos if it.get("combo") else db.products
        query = {"id": it["product_id"], "stock": {"$gte": it["qty"]}}
        update = {"$inc": {"stock": -it["qty"], "sold_count": it["qty"]}}
        result = await collection.update_one(query, update)
        if result.matched_count != 1:
            for previous_collection, previous_item in decremented:
                await previous_collection.update_one(
                    {"id": previous_item["product_id"]},
                    {"$inc": {"stock": previous_item["qty"], "sold_count": -previous_item["qty"]}},
                )
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {"payment_status": "FAILED"}, "$unset": {"payment.finalizing": ""}},
            )
            return False
        decremented.append((collection, it))
    if order.get("coupon_code"):
        await db.coupons.update_one({"code": order["coupon_code"]}, {"$inc": {"used_count": 1}})
        await db.coupon_usage.insert_one({
            "id": str(uuid.uuid4()), "code": order["coupon_code"],
            "email": order["customer"]["email"].lower(), "order_id": order["id"],
            "at": now_iso(),
        })
    payment_updates = {"payment.provider_payment_id": payment_id, "payment.method": method}
    if method == "cashfree":
        payment_updates["payment.cashfree_payment_id"] = payment_id
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"payment_status": "PAID", "order_status": "Paid",
                  **payment_updates,
                   "paid_at": now_iso()},
            "$unset": {"payment.finalizing": ""},
         "$push": {"status_history": {"status": "Payment Confirmed", "at": now_iso()}}},
    )
    fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    if fresh:
        await send_order_email("paid", fresh)
    return True


@router.post("/payments/verify")
async def verify_payment(payload: VerifyPaymentInput):
    order = await db.orders.find_one({"id": payload.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if PAYMENT_MODE == "cashfree":
        cf_order_id = order.get("payment", {}).get("cashfree_order_id")
        if not cf_order_id:
            raise HTTPException(status_code=400, detail="Cashfree order reference is missing")
        provider_order = await _cashfree_request("GET", f"/orders/{cf_order_id}")
        if (
            provider_order.get("order_id") != cf_order_id
            or not _amount_matches(provider_order.get("order_amount"), order["grand_total"])
            or provider_order.get("order_currency") != order["currency"]
        ):
            raise HTTPException(status_code=400, detail="Cashfree order validation failed")
        provider_status = provider_order.get("order_status")
        if provider_status == "PAID":
            await _finalize_paid(order, cf_order_id, "cashfree")
        elif provider_status in {"EXPIRED", "TERMINATED"}:
            await db.orders.update_one({"id": order["id"], "payment_status": {"$ne": "PAID"}}, {"$set": {"payment_status": "FAILED"}})
        updated = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        return {"status": updated["payment_status"].lower(), "order": updated}
    else:
        # Mock mode: accept and mark paid
        await _finalize_paid(order, f"mock_{uuid.uuid4().hex[:12]}", "mock")
    updated = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    return {"status": "success", "order": updated}


@router.post("/payments/cashfree/webhook")
async def cashfree_webhook(request: Request):
    body = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp", "")
    signature = request.headers.get("x-webhook-signature", "")
    if not _cashfree_signature_is_valid(body, timestamp, signature):
        raise HTTPException(status_code=400, detail="Invalid Cashfree webhook signature")
    try:
        payload = json.loads(body.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc
    event_id = request.headers.get("x-webhook-id") or hashlib.sha256(body).hexdigest()
    if await db.webhook_events.find_one({"event_id": event_id}):
        return {"status": "duplicate_ignored"}
    await db.webhook_events.insert_one({"event_id": event_id, "at": now_iso(), "event": payload.get("event")})
    event = payload.get("type", "")
    data = payload.get("data", {})
    provider_order = data.get("order", {})
    provider_payment = data.get("payment", {})
    cf_order_id = provider_order.get("order_id") or provider_payment.get("order_id")
    if cf_order_id:
        order = await db.orders.find_one({"payment.cashfree_order_id": cf_order_id})
        if order:
            payment_status = provider_payment.get("payment_status", "")
            if payment_status == "SUCCESS" or (event == "PAYMENT_SUCCESS_WEBHOOK" and not payment_status):
                if _amount_matches(provider_order.get("order_amount"), order["grand_total"]):
                    await _finalize_paid(order, provider_payment.get("cf_payment_id", cf_order_id), "cashfree")
            elif payment_status in {"FAILED", "USER_DROPPED", "CANCELLED", "VOID"}:
                await db.orders.update_one({"id": order["id"], "payment_status": {"$ne": "PAID"}}, {"$set": {"payment_status": "FAILED"}})
    return {"status": "processed"}


@router.post("/payments/webhook")
async def legacy_payment_webhook():
    raise HTTPException(status_code=410, detail="Razorpay webhooks are no longer supported")


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
