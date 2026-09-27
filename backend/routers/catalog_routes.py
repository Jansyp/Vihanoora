"""Catalog routes: products, categories, combos, offers, reviews, search."""
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from core import db, enrich_product, enrich_combo, now_iso, effective_price, discount_percent
from models import ReviewInput

router = APIRouter(prefix="/api", tags=["catalog"])
PRODUCT_PAGE_SIZE = 12


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


async def _product_map(ids):
    docs = await db.products.find({"id": {"$in": ids}}).to_list(500)
    return {d["id"]: enrich_product(d) for d in docs}


def _sort_stage(sort: str):
    return {
        "default": [("created_at", -1)],
        "newest": [("created_at", -1)],
        "oldest": [("created_at", 1)],
        "price_asc": [("selling_price", 1)],
        "price_desc": [("selling_price", -1)],
        "best_selling": [("sold_count", -1)],
        "name_asc": [("name", 1)],
        "name_desc": [("name", -1)],
        "stock_low": [("stock", 1)],
        "stock_high": [("stock", -1)],
    }.get(sort)


def _discount_fields_stage(now: str):
    effective_price = {
        "$cond": [
            {"$and": [
                {"$ne": [{"$ifNull": ["$flash_price", None]}, None]},
                {"$lte": ["$flash_start", now]},
                {"$gte": ["$flash_end", now]},
                {"$lt": ["$flash_price", {"$ifNull": ["$mrp", 0]}]},
            ]},
            "$flash_price",
            {"$ifNull": ["$selling_price", {"$ifNull": ["$mrp", 0]}]},
        ]
    }
    return {
        "$addFields": {
            "_page_effective_price": effective_price,
            "_page_discount": {
                "$cond": [
                    {"$or": [
                        {"$lte": [{"$ifNull": ["$mrp", 0]}, 0]},
                        {"$gte": [effective_price, "$mrp"]},
                    ]},
                    0,
                    {"$round": [{"$multiply": [
                        {"$divide": [
                            {"$subtract": ["$mrp", effective_price]}, "$mrp"
                        ]},
                        100,
                    ]}, 0]},
                ]
            },
        }
    }


async def _product_page(query, page, limit, sort, min_discount=0, discount_only=False, sort_by_effective_price=False):
    page = max(int(page), 1)
    limit = min(max(int(limit), 1), PRODUCT_PAGE_SIZE)
    skip = (page - 1) * limit
    uses_computed_discount = bool(min_discount or discount_only or sort == "biggest_discount" or sort_by_effective_price)

    if uses_computed_discount:
        base_pipeline = [{"$match": query}, _discount_fields_stage(datetime.now(timezone.utc).isoformat())]
        if discount_only:
            base_pipeline.append({"$match": {"_page_discount": {"$gt": 0}}})
        if min_discount:
            base_pipeline.append({"$match": {"_page_discount": {"$gte": min_discount}}})

        stats = await db.products.aggregate(base_pipeline + [{"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "max_discount": {"$max": "$_page_discount"},
        }}]).to_list(1)
        total = stats[0]["total"] if stats else 0
        max_discount = stats[0]["max_discount"] if stats else 0

        if sort == "biggest_discount":
            sort_stage = {"_page_discount": -1}
        elif sort_by_effective_price and sort in ("price_asc", "price_desc"):
            sort_stage = {"_page_effective_price": 1 if sort == "price_asc" else -1}
        else:
            sort_stage = dict(_sort_stage(sort) or [("created_at", -1)])
        sort_stage = {"featured": -1, **sort_stage}

        docs = await db.products.aggregate(base_pipeline + [
            {"$sort": sort_stage},
            {"$skip": skip},
            {"$limit": limit},
        ]).to_list(limit)
    else:
        total = await db.products.count_documents(query)
        max_discount = 0
        sort_stage = [("featured", -1)] + (_sort_stage(sort) or [("created_at", -1)])
        docs = await db.products.find(query).sort(sort_stage).skip(skip).limit(limit).to_list(limit)

    items = []
    for doc in docs:
        doc.pop("_page_effective_price", None)
        doc.pop("_page_discount", None)
        items.append(enrich_product(doc))
    result = {"total": total, "page": page, "limit": limit, "items": items}
    if discount_only:
        result["max_discount"] = max_discount
    return result


@router.get("/products")
async def list_products(
    group: Optional[str] = None,
    main_section: Optional[str] = None,
    category: Optional[str] = None,
    trending: Optional[bool] = None,
    best_seller: Optional[bool] = None,
    new_arrival: Optional[bool] = None,
    featured: Optional[bool] = None,
    giftable: Optional[bool] = None,
    q: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_discount: Optional[int] = None,
    sort: str = "newest",
    page: int = 1,
    limit: int = PRODUCT_PAGE_SIZE,
    include_inactive: bool = False,
    stock_status: Optional[str] = None,
):
    query = {}
    if not include_inactive:
        query["active"] = True
    group_value = group or main_section
    if group_value:
        query["group"] = group_value
    if category:
        category_name = category.strip()
        if category_name:
            query["category"] = category_name
    for flag, val in [("trending", trending), ("best_seller", best_seller),
                      ("new_arrival", new_arrival), ("featured", featured), ("giftable", giftable)]:
        if val:
            query[flag] = True
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
            {"group": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
        ]
    if min_price is not None or max_price is not None:
        pr = {}
        if min_price is not None:
            pr["$gte"] = min_price
        if max_price is not None:
            pr["$lte"] = max_price
        query["selling_price"] = pr
    if stock_status:
        status = stock_status.lower()
        if status == "in_stock":
            query["stock"] = {"$gt": 0}
        elif status == "low_stock":
            query["stock"] = {"$gt": 0, "$lte": 5}
        elif status == "out_of_stock":
            query["stock"] = {"$lte": 0}

    return await _product_page(query, page, limit, sort, min_discount)


@router.get("/products/{id_or_slug}")
async def get_product(id_or_slug: str):
    doc = await db.products.find_one({"$or": [{"id": id_or_slug}, {"slug": id_or_slug}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    product = enrich_product(doc)
    related = await db.products.find(
        {"group": product["group"], "id": {"$ne": product["id"]}, "active": True}
    ).limit(8).to_list(8)
    reviews = await db.reviews.find({"product_id": product["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(50)
    return {
        "product": product,
        "related": [enrich_product(r) for r in related][:4],
        "frequently_bought": [enrich_product(r) for r in related][4:8],
        "reviews": reviews,
    }


@router.post("/products/{product_id}/reviews")
async def add_review(product_id: str, payload: ReviewInput):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    review = {"id": str(uuid.uuid4()), "product_id": product_id, "name": payload.name,
              "rating": max(1, min(5, payload.rating)), "comment": payload.comment,
              "created_at": now_iso()}
    await db.reviews.insert_one(dict(review))
    all_reviews = await db.reviews.find({"product_id": product_id}).to_list(1000)
    avg = round(sum(r["rating"] for r in all_reviews) / len(all_reviews), 1)
    await db.products.update_one({"id": product_id},
                                 {"$set": {"rating": avg, "review_count": len(all_reviews)}})
    review.pop("_id", None)
    return review


@router.get("/categories")
async def list_categories(include_inactive: bool = False):
    docs = await db.categories.find({}, {"_id": 0}).sort([("order", 1)]).to_list(100)
    result = []
    for doc in docs:
        group_active = doc.get("active", True)
        if not include_inactive and not group_active:
            continue
        subs = []
        for sub in doc.get("subcategories", []):
            if isinstance(sub, dict):
                active = sub.get("active", True)
                if include_inactive or active:
                    subs.append({
                        "id": sub.get("id") or str(sub.get("slug") or _slugify(sub.get("name", ""))),
                        "name": sub.get("name"),
                        "slug": sub.get("slug") or _slugify(sub.get("name", "")),
                        "active": active,
                    })
        if subs or include_inactive or group_active:
            normalized = {"id": doc.get("id"), "name": doc.get("name"), "slug": doc.get("slug"), "group": doc.get("group"), "icon": doc.get("icon", ""), "order": doc.get("order", 0), "active": group_active, "subcategories": subs}
            result.append(normalized)
    return result


@router.get("/banners")
async def list_banners():
    return await db.banners.find({"active": True}, {"_id": 0}).sort([("order", 1)]).to_list(20)


@router.get("/offer-zone")
async def offer_zone(min_discount: int = 0, sort: str = "biggest_discount", page: int = 1, limit: int = PRODUCT_PAGE_SIZE):
    return await _product_page(
        {"active": True}, page, limit, sort, min_discount,
        discount_only=True, sort_by_effective_price=True,
    )


@router.get("/combos")
async def list_combos(active_only: bool = True):
    query = {"active": True} if active_only else {}
    docs = await db.combos.find(query, {"_id": 0}).to_list(200)
    all_ids = [pid for c in docs for pid in c.get("product_ids", [])]
    pmap = await _product_map(list(set(all_ids)))
    result = []
    for c in docs:
        c = enrich_combo(c, pmap)
        c["products"] = [pmap[pid] for pid in c.get("product_ids", []) if pid in pmap]
        result.append(c)
    return result


@router.get("/combos/{id_or_slug}")
async def get_combo(id_or_slug: str):
    c = await db.combos.find_one({"$or": [{"id": id_or_slug}, {"slug": id_or_slug}]}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Combo not found")
    pmap = await _product_map(c.get("product_ids", []))
    c = enrich_combo(c, pmap)
    c["products"] = [pmap[pid] for pid in c.get("product_ids", []) if pid in pmap]
    return c
