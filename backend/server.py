from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
import re
from xml.sax.saxutils import escape
from fastapi import FastAPI, Response
from starlette.middleware.cors import CORSMiddleware

from core import db
from seed import seed
from routers import auth_routes, catalog_routes, commerce_routes, admin_routes, upload_routes, analytics_routes, sales_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Viaura")

app = FastAPI(title="Viaura API")

SITEMAP_ORIGIN = "https://www.vihaanora.com"
PUBLIC_STOREFRONT_PATHS = (
    "/", "/women", "/kids", "/gifts", "/keychains", "/combo-offers",
    "/trending", "/offer-zone", "/page/about", "/page/contact",
    "/page/shipping", "/page/returns", "/page/faq", "/page/privacy", "/page/terms",
)
PUBLIC_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", re.IGNORECASE)


def _public_slug(value):
    return isinstance(value, str) and bool(PUBLIC_SLUG_RE.fullmatch(value))


def _sitemap_xml(product_docs, combo_docs=()):
    urls = {f"{SITEMAP_ORIGIN}{path}" for path in PUBLIC_STOREFRONT_PATHS}
    for doc in product_docs:
        slug = doc.get("slug") if doc.get("active") is True else None
        if _public_slug(slug):
            urls.add(f"{SITEMAP_ORIGIN}/product/{slug}")
    for doc in combo_docs:
        slug = doc.get("slug") if doc.get("active") is True else None
        if _public_slug(slug):
            urls.add(f"{SITEMAP_ORIGIN}/combo/{slug}")
    locs = "\n".join(f"  <url><loc>{escape(url)}</loc></url>" for url in sorted(urls))
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{locs}\n</urlset>\n'


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap():
    products = await db.products.find({"active": True}, {"_id": 0, "slug": 1, "active": 1}).to_list(None)
    combos = await db.combos.find({"active": True}, {"_id": 0, "slug": 1, "active": 1}).to_list(None)
    return Response(content=_sitemap_xml(products, combos), media_type="application/xml")

app.include_router(auth_routes.router)
app.include_router(catalog_routes.router)
app.include_router(commerce_routes.router)
app.include_router(admin_routes.router)
app.include_router(sales_routes.router)
app.include_router(analytics_routes.router)
app.include_router(upload_routes.router)


@app.get("/api/")
async def root():
    return {"message": "Viaura API", "status": "ok"}


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.products.create_index("slug")
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("group")
    await db.orders.create_index("order_number", unique=True)
    await db.newsletter_subscribers.create_index("email", unique=True)
    await db.combos.create_index("slug")
    await db.coupon_usage.create_index("order_id", unique=True, sparse=True)
    await db.orders.create_index("payment.cashfree_order_id", unique=True, sparse=True)
    await db.sales_records.create_index("sale_date")
    await db.sales_records.create_index("source")
    await db.sales_records.create_index("product_id")
    await db.sales_records.create_index("order_reference")
    await db.sales_records.create_index("selling_person_name")
    await db.analytics_events.create_index("timestamp")
    await db.analytics_events.create_index([("event_name", 1), ("timestamp", 1)])
    await db.analytics_events.create_index([("session_id", 1), ("timestamp", 1)])
    await db.analytics_events.create_index([("items.product_id", 1), ("timestamp", 1)])
    await seed()
    try:
        from storage import init_storage
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    logger.info("Viaura startup complete")


@app.on_event("shutdown")
async def shutdown():
    from core import client
    client.close()


origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
