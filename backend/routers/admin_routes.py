"""Admin routes: dashboard, CRUD for products/categories/combos/coupons, orders, settings, banners."""
import re
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException

from core import db, require_admin, enrich_product, now_iso
from mailer import send_order_email
from models import (ProductInput, CategoryInput, ComboInput, CouponInput,
                    ShippingInput, OrderStatusInput, SettingsInput, BannerInput,
                    AnnouncementInput, WOMEN_PRODUCT_CATEGORIES, LEGACY_PRODUCT_CATEGORY)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

ORDER_FLOW = ["Payment Pending", "Paid", "Processing", "Packed", "Shipped",
              "Out for Delivery", "Delivered", "Cancelled", "Returned"]


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


# ---- Dashboard ----
@router.get("/dashboard")
async def dashboard():
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    paid = [o for o in all_orders if o["payment_status"] == "PAID"]
    today_orders = [o for o in all_orders if o["created_at"] >= today]
    today_sales = sum(o["grand_total"] for o in today_orders if o["payment_status"] == "PAID")
    total_revenue = sum(o["grand_total"] for o in paid)
    status_counts = {}
    for s in ORDER_FLOW:
        status_counts[s] = len([o for o in all_orders if o["order_status"] == s])
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    low_stock = [enrich_product(p) for p in products if int(p.get("stock", 0)) <= int(p.get("low_stock_threshold", 5))]
    top_sellers = sorted(products, key=lambda p: p.get("sold_count", 0), reverse=True)[:5]
    recent_orders = sorted(all_orders, key=lambda o: o["created_at"], reverse=True)[:8]
    recent_customers = await db.users.find({"role": "customer"}, {"_id": 0, "password_hash": 0}).sort([("created_at", -1)]).to_list(8)
    active_offers = len([p for p in products if enrich_product(dict(p))["discount_percent"] > 0])
    return {
        "today_orders": len(today_orders),
        "today_sales": round(today_sales, 2),
        "total_orders": len(all_orders),
        "total_revenue": round(total_revenue, 2),
        "pending_payments": len([o for o in all_orders if o["payment_status"] == "PENDING"]),
        "status_counts": status_counts,
        "recent_orders": recent_orders,
        "top_sellers": [enrich_product(p) for p in top_sellers],
        "low_stock": low_stock[:10],
        "recent_customers": recent_customers,
        "active_offers": active_offers,
        "total_products": len(products),
    }


# ---- Products ----
@router.get("/products")
async def admin_products():
    docs = await db.products.find({}).sort([("created_at", -1)]).to_list(5000)
    return [enrich_product(d) for d in docs]


async def _next_product_sku() -> str:
    counter = await db.counters.find_one_and_update(
        {"_id": "product_sku"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    sequence = counter.get("seq", 1) if counter else 1
    sku = f"VH-{sequence:06d}"
    while await db.products.find_one({"sku": sku}, {"_id": 1}):
        sequence += 1
        sku = f"VH-{sequence:06d}"
        await db.counters.update_one({"_id": "product_sku"}, {"$max": {"seq": sequence}}, upsert=True)
    return sku


def _normalize_product_category(data: dict):
    if data.get("group") == "women":
        category = data.get("category") or LEGACY_PRODUCT_CATEGORY
        if category not in WOMEN_PRODUCT_CATEGORIES and category != LEGACY_PRODUCT_CATEGORY:
            raise HTTPException(status_code=422, detail="Invalid Women's product category")
        data["category"] = category


@router.post("/products")
async def create_product(payload: ProductInput):
    data = payload.model_dump()
    _normalize_product_category(data)
    if payload.sku and await db.products.find_one({"sku": payload.sku}):
        raise HTTPException(status_code=400, detail="SKU already exists")
    data["sku"] = await _next_product_sku()
    data["slug"] = data.get("slug") or slugify(payload.name)
    if await db.products.find_one({"slug": data["slug"]}):
        data["slug"] = f"{data['slug']}-{uuid.uuid4().hex[:4]}"
    data["id"] = str(uuid.uuid4())
    data["sold_count"] = 0
    data["rating"] = 0
    data["review_count"] = 0
    data["created_at"] = now_iso()
    await db.products.insert_one(dict(data))
    return enrich_product(data)


@router.put("/products/{product_id}")
async def update_product(product_id: str, payload: ProductInput):
    data = payload.model_dump()
    _normalize_product_category(data)
    data["slug"] = data.get("slug") or slugify(payload.name)
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    data["sku"] = existing.get("sku") or await _next_product_sku()
    await db.products.update_one({"id": product_id}, {"$set": data})
    old_video = existing.get("product_video_url")
    if old_video and old_video != data.get("product_video_url") and old_video.startswith("/api/files/"):
        old_path = old_video.removeprefix("/api/files/")
        await db.files.update_one({"storage_path": old_path}, {"$set": {"is_deleted": True}})
    updated = await db.products.find_one({"id": product_id})
    return enrich_product(updated)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    await db.products.delete_one({"id": product_id})
    return {"deleted": True}


@router.patch("/products/{product_id}/stock")
async def adjust_stock(product_id: str, delta: int = 0, set_value: int | None = None):
    if set_value is not None:
        await db.products.update_one({"id": product_id}, {"$set": {"stock": set_value}})
    else:
        await db.products.update_one({"id": product_id}, {"$inc": {"stock": delta}})
    updated = await db.products.find_one({"id": product_id})
    return enrich_product(updated)


# ---- Categories ----
@router.post("/categories")
async def create_category(payload: CategoryInput):
    data = payload.model_dump()
    data["slug"] = data.get("slug") or slugify(payload.name)
    data["id"] = str(uuid.uuid4())
    await db.categories.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryInput):
    data = payload.model_dump()
    data["slug"] = data.get("slug") or slugify(payload.name)
    await db.categories.update_one({"id": category_id}, {"$set": data})
    return await db.categories.find_one({"id": category_id}, {"_id": 0})


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    await db.categories.delete_one({"id": category_id})
    return {"deleted": True}


# ---- Combos ----
@router.get("/combos")
async def admin_combos():
    return await db.combos.find({}, {"_id": 0}).to_list(500)


@router.post("/combos")
async def create_combo(payload: ComboInput):
    data = payload.model_dump()
    data["slug"] = data.get("slug") or slugify(payload.name)
    data["id"] = str(uuid.uuid4())
    data["sold_count"] = 0
    data["created_at"] = now_iso()
    await db.combos.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/combos/{combo_id}")
async def update_combo(combo_id: str, payload: ComboInput):
    data = payload.model_dump()
    data["slug"] = data.get("slug") or slugify(payload.name)
    await db.combos.update_one({"id": combo_id}, {"$set": data})
    return await db.combos.find_one({"id": combo_id}, {"_id": 0})


@router.delete("/combos/{combo_id}")
async def delete_combo(combo_id: str):
    await db.combos.delete_one({"id": combo_id})
    return {"deleted": True}


# ---- Coupons ----
@router.get("/coupons")
async def admin_coupons():
    return await db.coupons.find({}, {"_id": 0}).to_list(500)


@router.post("/coupons")
async def create_coupon(payload: CouponInput):
    data = payload.model_dump()
    data["code"] = data["code"].upper()
    if await db.coupons.find_one({"code": data["code"]}):
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    data["id"] = str(uuid.uuid4())
    data["used_count"] = 0
    data["created_at"] = now_iso()
    await db.coupons.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, payload: CouponInput):
    data = payload.model_dump()
    data["code"] = data["code"].upper()
    await db.coupons.update_one({"id": coupon_id}, {"$set": data})
    return await db.coupons.find_one({"id": coupon_id}, {"_id": 0})


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str):
    await db.coupons.delete_one({"id": coupon_id})
    return {"deleted": True}


# ---- Orders ----
@router.get("/orders")
async def admin_orders(status: str | None = None, payment_status: str | None = None):
    query = {}
    if status:
        query["order_status"] = status
    if payment_status:
        query["payment_status"] = payment_status
    return await db.orders.find(query, {"_id": 0}).sort([("created_at", -1)]).to_list(1000)


@router.get("/orders/{order_id}")
async def admin_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: OrderStatusInput):
    if payload.order_status not in ORDER_FLOW:
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"order_status": payload.order_status},
         "$push": {"status_history": {"status": payload.order_status, "at": now_iso()}}},
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    _EMAIL_EVENTS = {"Processing": "processing", "Shipped": "shipped", "Delivered": "delivered", "Cancelled": "cancelled"}
    if payload.order_status in _EMAIL_EVENTS and updated:
        await send_order_email(_EMAIL_EVENTS[payload.order_status], updated)
    return updated


@router.put("/orders/{order_id}/shipping")
async def add_shipping(order_id: str, payload: ShippingInput):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    shipping = {"courier": payload.courier, "awb": payload.awb, "tracking_url": payload.tracking_url,
                "shipping_date": payload.shipping_date, "expected_delivery": payload.expected_delivery}
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"shipping": shipping, "order_status": "Shipped"},
         "$push": {"status_history": {"status": "Shipped", "at": now_iso()}}},
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if updated:
        await send_order_email("shipped", updated)
    return updated


# ---- Settings ----
@router.put("/settings")
async def update_settings(payload: SettingsInput):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.store_settings.update_one({"id": "singleton"}, {"$set": data}, upsert=True)
    return await db.store_settings.find_one({"id": "singleton"}, {"_id": 0})


# ---- Banners ----
@router.get("/banners")
async def admin_banners():
    return await db.banners.find({}, {"_id": 0}).sort([("order", 1)]).to_list(100)


@router.post("/banners")
async def create_banner(payload: BannerInput):
    data = payload.model_dump()
    data["id"] = str(uuid.uuid4())
    await db.banners.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/banners/{banner_id}")
async def update_banner(banner_id: str, payload: BannerInput):
    await db.banners.update_one({"id": banner_id}, {"$set": payload.model_dump()})
    return await db.banners.find_one({"id": banner_id}, {"_id": 0})


@router.delete("/banners/{banner_id}")
async def delete_banner(banner_id: str):
    await db.banners.delete_one({"id": banner_id})
    return {"deleted": True}


# ---- Announcements ----
@router.get("/announcements")
async def admin_announcements():
    return await db.announcements.find({}, {"_id": 0}).sort([("order", 1)]).to_list(100)


@router.post("/announcements")
async def create_announcement(payload: AnnouncementInput):
    data = payload.model_dump()
    data["id"] = str(uuid.uuid4())
    data["created_at"] = now_iso()
    await db.announcements.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, payload: AnnouncementInput):
    await db.announcements.update_one({"id": announcement_id}, {"$set": payload.model_dump()})
    return await db.announcements.find_one({"id": announcement_id}, {"_id": 0})


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str):
    await db.announcements.delete_one({"id": announcement_id})
    return {"deleted": True}
