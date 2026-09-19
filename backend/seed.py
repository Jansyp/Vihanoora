"""Seed database with categories, products, combos, coupons, banners, settings, admin."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from core import db, hash_password, now_iso
from models import LEGACY_PRODUCT_CATEGORY, WOMEN_PRODUCT_CATEGORIES

IMG = {
    "bracelet": [
        "https://images.unsplash.com/photo-1637808248242-57a6265593ed?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1676120963306-8969fa6a810e?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1629890731335-52295b8be1d9?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1638768892257-8aec93a524e5?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
    ],
    "jewellery": [
        "https://images.unsplash.com/photo-1689367436442-76c859315008?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1626122509259-ea8e0a136ada?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
    ],
    "hair": [
        "https://images.unsplash.com/photo-1788079962199-485109cc9cd0?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1601938219471-fb3393955f15?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1649479747361-7f862d1d29a9?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1672699323645-75ace776093e?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1671262591369-8ac7b5f40812?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
    ],
    "toys": [
        "https://images.unsplash.com/photo-1663850697007-f053e16d46aa?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1655087751207-1020c89f7eee?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1545558014-8692077e9b5c?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1618842676088-c4d48a6a7c9d?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
    ],
    "gift": [
        "https://images.unsplash.com/photo-1592903297149-37fb25202dfa?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1610377507996-dcd4f0cfc125?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1497700003451-e1df943a194b?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1707944145479-12755f0434d8?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        "https://images.unsplash.com/photo-1778686568681-699398da3b65?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
    ],
}

CATEGORIES = [
    {"name": "Women", "slug": "women", "group": "women", "icon": "gem", "order": 1,
     "subcategories": [{"name": "Jewellery", "slug": "jewellery"}, {"name": "Bracelets", "slug": "bracelets"},
                       {"name": "Crystal Jewellery", "slug": "crystal-jewellery"}, {"name": "Hair Clips", "slug": "hair-clips"},
                       {"name": "Hair Bands", "slug": "hair-bands"}, {"name": "Scrunchies", "slug": "scrunchies"},
                       {"name": "Other Accessories", "slug": "other-accessories"}]},
    {"name": "Kids", "slug": "kids", "group": "kids", "icon": "baby", "order": 2,
     "subcategories": [{"name": "Toys", "slug": "toys"}, {"name": "Educational/Fun Toys", "slug": "educational-toys"},
                       {"name": "Kids Accessories", "slug": "kids-accessories"}, {"name": "Trending Kids", "slug": "trending-kids"}]},
    {"name": "Gifts", "slug": "gifts", "group": "gifts", "icon": "gift", "order": 3,
     "subcategories": [{"name": "Birthday", "slug": "birthday"}, {"name": "Kids", "slug": "kids-gifts"},
                       {"name": "Women's", "slug": "womens-gifts"}, {"name": "Couple", "slug": "couple"},
                       {"name": "Return", "slug": "return"}, {"name": "Festival", "slug": "festival"},
                       {"name": "Hampers", "slug": "hampers"}]},
    {"name": "Combo Offers", "slug": "combo-offers", "group": "combo", "icon": "package", "order": 4,
     "subcategories": [{"name": "Women Combos", "slug": "women-combos"}, {"name": "Kids Combos", "slug": "kids-combos"},
                       {"name": "Gift Combos", "slug": "gift-combos"}, {"name": "Special Offers", "slug": "special-offers"}]},
]

# name, group, category, mrp, sell, stock, imgs, flags
P = [
    ("Pink Crystal Healing Bracelet", "women", "crystal-jewellery", 899, 499, 40, "bracelet", ["trending", "best_seller", "giftable"]),
    ("Rose Quartz Beaded Bracelet", "women", "bracelets", 699, 449, 25, "bracelet", ["trending", "new_arrival"]),
    ("Silver Heart Charm Bracelet", "women", "bracelets", 1199, 799, 15, "bracelet", ["best_seller", "giftable"]),
    ("Ocean Blue Crystal Bracelet", "women", "crystal-jewellery", 799, 799, 30, "bracelet", ["new_arrival"]),
    ("Dainty Gold Layered Necklace", "women", "jewellery", 1499, 899, 20, "jewellery", ["trending", "featured", "giftable"]),
    ("Minimalist Gold Studs", "women", "jewellery", 599, 349, 50, "jewellery", ["best_seller"]),
    ("Satin Flower Claw Clip", "women", "hair-clips", 399, 199, 60, "hair", ["trending", "new_arrival"]),
    ("Pastel Scrunchie Set (5 pc)", "women", "scrunchies", 499, 299, 45, "hair", ["best_seller", "giftable"]),
    ("Pearl Hair Band", "women", "hair-bands", 349, 249, 35, "hair", ["new_arrival"]),
    ("Velvet Bow Hair Clips (Pair)", "women", "hair-clips", 299, 149, 55, "hair", ["trending"]),
    ("Boho Charm Anklet", "women", "other-accessories", 449, 299, 28, "jewellery", ["new_arrival", "giftable"]),
    ("Silk Scrunchie Gift Box", "women", "scrunchies", 899, 549, 22, "hair", ["giftable", "featured"]),
    ("Dinosaur Push Toy", "kids", "toys", 999, 649, 18, "toys", ["trending", "best_seller"]),
    ("Rainbow Building Blocks", "kids", "educational-toys", 1299, 899, 24, "toys", ["best_seller", "giftable"]),
    ("Wooden Stacking Tower", "kids", "educational-toys", 799, 599, 30, "toys", ["new_arrival"]),
    ("Colorful Sensory Play Set", "kids", "toys", 1499, 999, 12, "toys", ["trending", "featured", "giftable"]),
    ("Soft Plush Sock Monkey", "kids", "trending-kids", 699, 449, 33, "toys", ["trending", "giftable"]),
    ("Kids Star Hair Clips Set", "kids", "kids-accessories", 299, 179, 40, "hair", ["new_arrival"]),
    ("Birthday Surprise Hamper", "gifts", "birthday", 1999, 1299, 14, "gift", ["featured", "giftable", "best_seller"]),
    ("Self-Care Pamper Box", "gifts", "womens-gifts", 2499, 1699, 10, "gift", ["trending", "giftable", "featured"]),
    ("Couple Keepsake Gift Set", "gifts", "couple", 1799, 1199, 16, "gift", ["giftable", "new_arrival"]),
    ("Mini Return Gift Box", "gifts", "return", 399, 249, 80, "gift", ["best_seller"]),
    ("Festive Joy Hamper", "gifts", "festival", 2999, 1999, 8, "gift", ["featured", "giftable", "trending"]),
    ("Rustic Wooden Keepsake Box", "gifts", "hampers", 1299, 1299, 20, "gift", ["new_arrival"]),
]

BANNERS = [
    {"title": "Trending Finds. Thoughtful Gifts.", "subtitle": "Little Things. Beautiful Moments.",
     "image": IMG["gift"][3], "cta_text": "Shop Now", "cta_link": "/trending", "active": True, "order": 1},
    {"title": "Up to 50% Off in the Offer Zone", "subtitle": "Instagram-loved picks at little prices",
     "image": IMG["bracelet"][0], "cta_text": "Grab Deals", "cta_link": "/offer-zone", "active": True, "order": 2},
]

COUPONS = [
    {"code": "WELCOME10", "type": "percentage", "value": 10, "min_order": 499, "max_discount": 150,
     "total_usage_limit": 1000, "per_customer_limit": 1, "active": True},
    {"code": "GIFT100", "type": "flat", "value": 100, "min_order": 999, "max_discount": None,
     "total_usage_limit": 500, "per_customer_limit": 2, "active": True},
    {"code": "FESTIVE20", "type": "percentage", "value": 20, "min_order": 1499, "max_discount": 400,
     "total_usage_limit": 300, "per_customer_limit": 1, "active": True},
]

SEED_WOMEN_CATEGORY_MAP = {
    "crystal-jewellery": "Necklaces",
    "bracelets": "Bracelets",
    "jewellery": "Earrings",
    "hair-clips": "Hair Accessories",
    "scrunchies": "Hair Accessories",
    "hair-bands": "Hair Accessories",
}


async def seed():
    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vihaanora.com")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "JAVE Admin", "email": admin_email,
            "password_hash": hash_password(admin_pw), "role": "admin", "picture": "",
            "auth_provider": "password", "created_at": now_iso(),
        })
    else:
        from core import verify_password
        if existing.get("password_hash") and not verify_password(admin_pw, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
        if existing.get("role") != "admin":
            await db.users.update_one({"email": admin_email}, {"$set": {"role": "admin"}})

    await db.products.update_many(
        {"group": "women", "category": {"$nin": [*WOMEN_PRODUCT_CATEGORIES, LEGACY_PRODUCT_CATEGORY]}},
        {"$set": {"category": LEGACY_PRODUCT_CATEGORY}},
    )

    catalog_marker = await db.seed_meta.find_one({"key": "default_catalog_initialized"})
    if catalog_marker:
        return

    if await db.products.count_documents({}) > 0:
        await db.seed_meta.insert_one({"key": "default_catalog_initialized", "created_at": now_iso()})
        return

    # Categories: keep existing records and only add any missing default category set.
    existing_category_slugs = {c["slug"] async for c in db.categories.find({}, {"slug": 1})}
    for c in CATEGORIES:
        if c["slug"] not in existing_category_slugs:
            await db.categories.insert_one({"id": str(uuid.uuid4()), **c})

    # Products: repair partial seed state without deleting other customer/admin entries.
    all_ids = {}
    flash_end = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    flash_start = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    for i, (name, group, cat, mrp, sell, stock, imgkey, flags) in enumerate(P):
        slug = name.lower().replace("'", "").replace("(", "").replace(")", "").replace(".", "")
        slug = "-".join(slug.split())
        imgs = IMG[imgkey]
        img_pick = [imgs[i % len(imgs)], imgs[(i + 1) % len(imgs)]]
        sku = f"JH-{group[:2].upper()}-{i+1:03d}"
        doc = {
            "id": str(uuid.uuid4()), "name": name, "slug": slug, "sku": sku,
            "description": f"{name} — a beautifully curated piece from Vihaanora. Perfect for gifting or treating yourself.",
            "details": "Premium quality, thoughtfully packaged. Handpicked to match Instagram-trending aesthetics.",
            "material": "Skin-friendly, high-grade materials.",
            "group": group, "category": SEED_WOMEN_CATEGORY_MAP.get(cat, cat) if group == "women" else cat,
            "mrp": mrp, "selling_price": sell, "stock": stock,
            "low_stock_threshold": 5, "images": img_pick, "colors": ["Blush", "Sage", "Lavender"][: (i % 3) + 1],
            "weight": "80g", "dimensions": "10 x 8 x 4 cm",
            "trending": "trending" in flags, "best_seller": "best_seller" in flags,
            "new_arrival": "new_arrival" in flags, "featured": "featured" in flags,
            "giftable": "giftable" in flags, "offer": sell < mrp, "active": True,
            "model_3d": None, "sold_count": (i * 7) % 50, "rating": round(4 + (i % 10) / 10, 1),
            "review_count": (i * 3) % 40, "created_at": now_iso(),
        }
        # Add a couple of flash deals
        if i in (0, 12, 18):
            doc["flash_price"] = round(sell * 0.8)
            doc["flash_start"] = flash_start
            doc["flash_end"] = flash_end

        existing = await db.products.find_one({"$or": [{"sku": sku}, {"slug": slug}, {"name": name}]})
        if existing:
            current_id = existing.get("id") or str(uuid.uuid4())
            doc["id"] = current_id
            updates = {k: v for k, v in doc.items() if k not in {"id", "created_at"} and existing.get(k) != v}
            if updates:
                await db.products.update_one({"_id": existing["_id"]}, {"$set": updates})
            if existing.get("id") is None:
                await db.products.update_one({"_id": existing["_id"]}, {"$set": {"id": current_id}})
            all_ids[name] = current_id
            continue

        await db.products.insert_one(dict(doc))
        all_ids[name] = doc["id"]

    # Combos
    combos = [
        ("Hair Glam Combo", "women-combos", ["Satin Flower Claw Clip", "Pastel Scrunchie Set (5 pc)", "Pearl Hair Band"],
         "Everything you need for effortless, cute hair days.", IMG["hair"][0]),
        ("Crystal Charm Duo", "women-combos", ["Pink Crystal Healing Bracelet", "Boho Charm Anklet"],
         "A dreamy pair of crystal-charged accessories.", IMG["bracelet"][2]),
        ("Kids Playtime Combo", "kids-combos", ["Rainbow Building Blocks", "Wooden Stacking Tower"],
         "Hours of screen-free, educational fun.", IMG["toys"][1]),
        ("Ultimate Gift Hamper", "gift-combos", ["Self-Care Pamper Box", "Silk Scrunchie Gift Box"],
         "The show-stopping gift that says you care.", IMG["gift"][4]),
    ]
    for name, cat, items, desc, img in combos:
        pids = [all_ids[i] for i in items if i in all_ids]
        prods = await db.products.find({"id": {"$in": pids}}).to_list(20)
        original = sum(p["selling_price"] for p in prods)
        combo_price = round(original * 0.8)
        slug = "-".join(name.lower().split())
        await db.combos.insert_one({
            "id": str(uuid.uuid4()), "name": name, "slug": slug, "description": desc,
            "images": [img], "product_ids": pids, "category": cat,
            "original_price": original, "combo_price": combo_price, "stock": 15,
            "active": True, "start_date": None, "end_date": None,
            "sold_count": 5, "created_at": now_iso(),
        })

    # Coupons
    for c in COUPONS:
        await db.coupons.insert_one({"id": str(uuid.uuid4()), "used_count": 0, "created_at": now_iso(), **c})

    # Banners
    for b in BANNERS:
        await db.banners.insert_one({"id": str(uuid.uuid4()), **b})

    await db.seed_meta.insert_one({"key": "default_catalog_initialized", "created_at": now_iso()})
