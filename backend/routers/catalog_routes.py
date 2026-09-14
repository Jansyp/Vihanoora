"""Catalog routes: products, categories, combos, offers, reviews, search."""
import uuid
from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from core import db, enrich_product, enrich_combo, now_iso, effective_price, discount_percent
from models import ReviewInput

router = APIRouter(prefix="/api", tags=["catalog"])


async def _product_map(ids):
    docs = await db.products.find({"id": {"$in": ids}}).to_list(500)
    return {d["id"]: enrich_product(d) for d in docs}


def _sort_stage(sort: str):
    return {
        "newest": [("created_at", -1)],
        "price_asc": [("selling_price", 1)],
        "price_desc": [("selling_price", -1)],
        "best_selling": [("sold_count", -1)],
    }.get(sort)


@router.get("/products")
async def list_products(
    group: Optional[str] = None,
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
    limit: int = 20,
    include_inactive: bool = False,
):
    query = {}
    if not include_inactive:
        query["active"] = True
    if group:
        query["group"] = group
    if category:
        query["category"] = category
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
        ]
    if min_price is not None or max_price is not None:
        pr = {}
        if min_price is not None:
            pr["$gte"] = min_price
        if max_price is not None:
            pr["$lte"] = max_price
        query["selling_price"] = pr

    cursor = db.products.find(query)
    sort_stage = _sort_stage(sort)
    if sort_stage and sort not in ("biggest_discount",):
        cursor = cursor.sort(sort_stage)
    docs = await cursor.to_list(2000)
    items = [enrich_product(d) for d in docs]
    if min_discount:
        items = [p for p in items if p["discount_percent"] >= min_discount]
    if sort == "biggest_discount":
        items.sort(key=lambda p: p["discount_percent"], reverse=True)
    total = len(items)
    start = (page - 1) * limit
    return {"total": total, "page": page, "limit": limit, "items": items[start:start + limit]}


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
async def list_categories():
    docs = await db.categories.find({}, {"_id": 0}).sort([("order", 1)]).to_list(100)
    return docs


@router.get("/banners")
async def list_banners():
    return await db.banners.find({"active": True}, {"_id": 0}).sort([("order", 1)]).to_list(20)


@router.get("/offer-zone")
async def offer_zone(min_discount: int = 0, sort: str = "biggest_discount", page: int = 1, limit: int = 20):
    docs = await db.products.find({"active": True}).to_list(2000)
    items = [enrich_product(d) for d in docs]
    items = [p for p in items if p["discount_percent"] > 0 and p["discount_percent"] >= min_discount]
    if sort == "biggest_discount":
        items.sort(key=lambda p: p["discount_percent"], reverse=True)
    elif sort == "price_asc":
        items.sort(key=lambda p: p["effective_price"])
    elif sort == "price_desc":
        items.sort(key=lambda p: p["effective_price"], reverse=True)
    elif sort == "newest":
        items.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    max_disc = max([p["discount_percent"] for p in items], default=0)
    total = len(items)
    start = (page - 1) * limit
    return {"total": total, "max_discount": max_disc, "items": items[start:start + limit]}


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
