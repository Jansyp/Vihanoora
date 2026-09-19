from pathlib import Path

from dotenv import load_dotenv
import pytest

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from core import db
from seed import seed


@pytest.mark.asyncio
async def test_seed_does_not_restore_deleted_catalog():
    product = {"id": "stale-1", "name": "TEST_CUSTOM_PRODUCT", "slug": "test-custom-product", "sku": "TEST-CUSTOM-001", "group": "women", "category": "bracelets", "mrp": 999, "selling_price": 799, "stock": 10, "active": True, "created_at": "2024-01-01T00:00:00+00:00"}
    await db.products.delete_many({"name": product["name"]})
    await db.products.insert_one(product)

    await seed()

    assert await db.products.count_documents({"name": product["name"]}) == 1
    assert await db.products.count_documents({"name": "Pink Crystal Healing Bracelet"}) == 0

    await db.products.delete_many({"name": product["name"]})
