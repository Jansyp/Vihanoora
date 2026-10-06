from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db
from seed import seed
from routers import auth_routes, catalog_routes, commerce_routes, admin_routes, upload_routes, analytics_routes, sales_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Viaura")

app = FastAPI(title="Viaura API")

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
