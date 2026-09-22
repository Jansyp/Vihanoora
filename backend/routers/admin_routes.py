"""Admin routes: dashboard, CRUD for products/categories/combos/coupons, orders, settings, banners."""
import re
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException

from core import db, require_admin, enrich_product, now_iso
from mailer import send_order_email
from models import (ProductInput, CategoryInput, ComboInput, CouponInput,
                    ShippingInput, OrderStatusInput, SettingsInput, BannerInput,
                    AnnouncementInput, LEGACY_PRODUCT_CATEGORY)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

ORDER_FLOW = ["Payment Pending", "Paid", "Processing", "Packed", "Shipped",
              "Out for Delivery", "Delivered", "Cancelled", "Returned"]


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def _subcategory_id(subcategory: dict) -> str:
    return str(subcategory.get("id") or subcategory.get("slug") or slugify(subcategory.get("name", "")))


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
async def admin_products(
    main_section: str | None = None,
    category: str | None = None,
    search: str | None = None,
    product_ids: str | None = None,
    sort: str = "newest",
    stock_status: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 50,
):
    query = {}
    group_value = main_section or None
    if group_value:
        query["group"] = group_value
    if category:
        query["category"] = category
    if status:
        status_value = status.lower()
        if status_value in {"active", "inactive"}:
            query["active"] = status_value == "active"
    if stock_status:
        status_value = stock_status.lower()
        if status_value == "in_stock":
            query["stock"] = {"$gt": 0}
        elif status_value == "low_stock":
            query["stock"] = {"$gt": 0, "$lte": 5}
        elif status_value == "out_of_stock":
            query["stock"] = {"$lte": 0}
    compound_filters = []
    if search:
        search_value = search.strip()
        if search_value:
            compound_filters.append({"$or": [
                {"name": {"$regex": re.escape(search_value), "$options": "i"}},
                {"id": {"$regex": re.escape(search_value), "$options": "i"}},
                {"sku": {"$regex": re.escape(search_value), "$options": "i"}},
            ]})
    if product_ids:
        ids = [item.strip() for item in product_ids.split(",") if item.strip()]
        if ids:
            compound_filters.append({"id": {"$in": ids}})
    if compound_filters:
        query["$and"] = compound_filters

    sort_map = {
        "newest": [("created_at", -1)],
        "oldest": [("created_at", 1)],
        "price_low": [("selling_price", 1)],
        "price_high": [("selling_price", -1)],
        "stock_low": [("stock", 1)],
        "stock_high": [("stock", -1)],
        "name_asc": [("name", 1)],
        "name_desc": [("name", -1)],
    }
    cursor = db.products.find(query)
    sort_stage = sort_map.get(sort, [("created_at", -1)])
    cursor = cursor.sort(sort_stage)
    total = await db.products.count_documents(query)
    skip = (page - 1) * limit
    docs = await cursor.skip(skip).limit(limit).to_list(length=limit)
    items = [enrich_product(d) for d in docs]
    payload = {"items": items, "total": total, "page": page, "limit": limit, "pages": max(1, (total + limit - 1) // limit) if total else 1}
    if not any([main_section, category, search, product_ids, status, stock_status, sort not in {"newest", ""}]) and page == 1 and limit == 50:
        return items
    return payload


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


async def _normalize_product_category(data: dict):
    category_ref = (data.get("category_id") or data.get("category") or "").strip()
    if not category_ref or category_ref == LEGACY_PRODUCT_CATEGORY:
        data["category"] = category_ref or LEGACY_PRODUCT_CATEGORY
        data["category_id"] = None
        return

    group = data.get("group")
    group_doc = await db.categories.find_one({"group": group})
    matches = []
    if group_doc:
        reference = category_ref.lower()
        for sub in group_doc.get("subcategories", []):
            if not isinstance(sub, dict) or sub.get("active", True) is False:
                continue
            sub_id = _subcategory_id(sub)
            sub_slug = sub.get("slug") or slugify(sub.get("name", ""))
            if reference in {sub_id.lower(), sub_slug.lower(), str(sub.get("name", "")).strip().lower()}:
                matches.append((sub, sub_id))
    if not matches:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category '{category_ref}' for section '{group}'. Choose an active category from Category Management.",
        )
    sub, sub_id = matches[0]
    data["category"] = sub.get("name")
    data["category_id"] = sub_id


@router.post("/products")
async def create_product(payload: ProductInput):
    data = payload.model_dump()
    await _normalize_product_category(data)
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
    await _normalize_product_category(data)
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
async def _ensure_group_category(group: str):
    group_doc = await db.categories.find_one({"group": group})
    if group_doc:
        return group_doc
    group_name = {"women": "Women", "kids": "Kids", "gifts": "Gifts"}.get(group, group.replace("-", " ").title())
    doc = {
        "id": str(uuid.uuid4()),
        "name": group_name,
        "slug": group,
        "group": group,
        "icon": "",
        "order": {"women": 1, "kids": 2, "gifts": 3}.get(group, 99),
        "active": True,
        "subcategories": [],
    }
    await db.categories.insert_one(doc)
    return doc


async def _get_category_group_and_subcategory(category_id: str):
    docs = await db.categories.find({}).to_list(200)
    for doc in docs:
        for sub in doc.get("subcategories", []):
            if _subcategory_id(sub) == str(category_id):
                return doc, sub
    return None, None


async def _validate_category_name(group: str, name: str, ignore_id: str | None = None):
    group_doc = await _ensure_group_category(group)
    normalized_name = (name or "").strip()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Category name is required")
    for sub in group_doc.get("subcategories", []):
        if str(sub.get("id")) == str(ignore_id):
            continue
        if sub.get("name", "").strip().lower() == normalized_name.lower():
            raise HTTPException(status_code=400, detail="Category name already exists in this section")
        if (sub.get("slug") or slugify(sub.get("name", ""))) == slugify(normalized_name):
            raise HTTPException(status_code=400, detail="Category slug already exists in this section")
    return normalized_name


@router.get("/categories")
async def admin_list_categories():
    docs = await db.categories.find({}, {"_id": 0}).sort([("order", 1)]).to_list(200)
    result = []
    for doc in docs:
        buckets = []
        changed = False
        for sub in doc.get("subcategories", []):
            if not isinstance(sub, dict):
                continue
            sub = dict(sub)
            normalized_id = _subcategory_id(sub)
            normalized_slug = sub.get("slug") or slugify(sub.get("name", ""))
            if sub.get("id") != normalized_id or sub.get("slug") != normalized_slug or "active" not in sub:
                changed = True
            sub["id"] = normalized_id
            sub["slug"] = normalized_slug
            sub.setdefault("active", True)
            sub["product_count"] = await db.products.count_documents({"group": doc.get("group"), "category": sub.get("name")})
            buckets.append(sub)
        doc = dict(doc)
        doc["subcategories"] = buckets
        if changed:
            await db.categories.update_one({"id": doc.get("id")}, {"$set": {"subcategories": [{k: v for k, v in sub.items() if k != "product_count"} for sub in buckets]}})
        result.append(doc)
    return result


@router.post("/categories")
async def create_category(payload: CategoryInput):
    name = await _validate_category_name(payload.group, payload.name)
    group_doc = await _ensure_group_category(payload.group)
    new_sub = {
        "id": str(uuid.uuid4()),
        "name": name,
        "slug": payload.slug or slugify(name),
        "active": bool(payload.active),
    }
    existing = [s for s in group_doc.get("subcategories", []) if str(s.get("name", "")).lower() == name.lower()]
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists in this section")
    group_doc.setdefault("subcategories", [])
    group_doc["subcategories"].append(new_sub)
    await db.categories.update_one({"id": group_doc["id"]}, {"$set": {"subcategories": group_doc["subcategories"]}}, upsert=True)
    return {"id": new_sub["id"], "name": new_sub["name"], "slug": new_sub["slug"], "group": payload.group, "active": new_sub["active"]}


@router.put("/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryInput):
    group_doc, existing_sub = await _get_category_group_and_subcategory(category_id)
    if not group_doc or not existing_sub:
        raise HTTPException(status_code=404, detail="Category not found")
    group_value = payload.group or group_doc.get("group")
    name = await _validate_category_name(group_value, payload.name, ignore_id=category_id)
    old_name = existing_sub.get("name")
    old_slug = existing_sub.get("slug")
    existing_sub.setdefault("id", _subcategory_id(existing_sub))
    existing_sub["name"] = name
    existing_sub["slug"] = payload.slug or slugify(name)
    existing_sub["active"] = bool(payload.active)
    if old_name and old_name != name:
        await db.products.update_many({"group": group_doc.get("group"), "category": old_name}, {"$set": {"category": name}})
        await db.products.update_many({"group": group_doc.get("group"), "category": old_slug}, {"$set": {"category": name}})
    await db.categories.update_one({"id": group_doc["id"]}, {"$set": {"subcategories": group_doc.get("subcategories", [])}})
    return {"id": existing_sub["id"], "name": name, "slug": existing_sub["slug"], "group": group_doc.get("group"), "active": existing_sub["active"]}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, reassign_to: str | None = None):
    group_doc, existing_sub = await _get_category_group_and_subcategory(category_id)
    if not group_doc or not existing_sub:
        raise HTTPException(status_code=404, detail="Category not found")
    group_name = group_doc.get("group")
    category_name = existing_sub.get("name")
    category_slug = existing_sub.get("slug") or slugify(category_name)
    matching_products = await db.products.count_documents({
        "group": group_name,
        "category": {"$in": [category_name, category_slug]},
    })
    if matching_products > 0 and not reassign_to:
        raise HTTPException(status_code=409, detail="Category has products assigned. Please reassign or disable it instead.")
    if matching_products > 0 and reassign_to:
        target = next((sub for sub in group_doc.get("subcategories", []) if str(sub.get("name")).lower() == str(reassign_to).lower() and str(sub.get("id")) != str(category_id)), None)
        if not target:
            raise HTTPException(status_code=400, detail="Reassignment target category was not found in the same section")
        await db.products.update_many(
            {"group": group_name, "category": {"$in": [category_name, category_slug]}},
            {"$set": {"category": target.get("name")}},
        )
    group_doc["subcategories"] = [sub for sub in group_doc.get("subcategories", []) if _subcategory_id(sub) != str(category_id)]
    await db.categories.update_one({"id": group_doc["id"]}, {"$set": {"subcategories": group_doc["subcategories"]}})
    return {"deleted": True, "id": category_id}


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
