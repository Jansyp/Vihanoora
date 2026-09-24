import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "variant_order_test")
os.environ.setdefault("JWT_SECRET", "variant-order-unit-test")

import routers.commerce_routes as commerce
from models import CartItemIn


class FakeProducts:
    def __init__(self, product):
        self.product = product

    async def find_one(self, query):
        return self.product if query.get("id") == self.product["id"] else None


def run(coro):
    return asyncio.run(coro)


def product(colors=None):
    return {
        "id": "product-1", "name": "Enamel Flower Pearl Earrings", "active": True,
        "mrp": 80, "selling_price": 50, "stock": 10, "images": ["image.png"], "colors": colors or [],
    }


def test_selected_colour_is_snapshotted_in_order_line_item(monkeypatch):
    monkeypatch.setattr(commerce.db, "products", FakeProducts(product(["Pink", "Blue"])))
    items, _, _ = run(commerce._price_items([CartItemIn(product_id="product-1", qty=1, variant="Pink")]))
    assert items[0]["variant"] == "Pink"


def test_unknown_colour_is_rejected_at_order_pricing(monkeypatch):
    monkeypatch.setattr(commerce.db, "products", FakeProducts(product(["Pink", "Blue"])))
    with pytest.raises(HTTPException) as error:
        run(commerce._price_items([CartItemIn(product_id="product-1", qty=1, variant="Green")]))
    assert error.value.status_code == 400


def test_products_without_variants_remain_backward_compatible(monkeypatch):
    monkeypatch.setattr(commerce.db, "products", FakeProducts(product()))
    items, _, _ = run(commerce._price_items([CartItemIn(product_id="product-1", qty=1)]))
    assert items[0]["variant"] is None
