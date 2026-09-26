import asyncio
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "variant_order_test")
os.environ.setdefault("JWT_SECRET", "variant-order-unit-test")

import routers.commerce_routes as commerce
from routers.admin_routes import _profit_report
from core import enrich_product
from models import CartItemIn, CreateOrderInput, ProductInput


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, length=None):
        return self.documents[:length] if length is not None else self.documents


class FakeProducts:
    def __init__(self, *products):
        self.products = {item["id"]: item for item in products}

    async def find_one(self, query):
        return self.products.get(query.get("id"))

    def find(self, query, projection=None):
        ids = query.get("id", {}).get("$in", [])
        return FakeCursor([self.products[product_id] for product_id in ids if product_id in self.products])


class FakeCombos:
    def __init__(self, combo):
        self.combo = combo

    async def find_one(self, query):
        return self.combo if query.get("id") == self.combo["id"] else None


class FakeOrders:
    async def insert_one(self, document):
        self.document = dict(document)


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


def test_buying_price_is_optional_nonnegative_and_private():
    assert ProductInput(name="test", group="women", mrp=300, selling_price=250, buying_price=0).buying_price == 0
    with pytest.raises(ValidationError):
        ProductInput(name="test", group="women", mrp=300, selling_price=250, buying_price=-1)

    public = enrich_product({"id": "product-1", "mrp": 300, "selling_price": 250, "buying_price": 100, "stock": 1})
    assert "buying_price" not in public
    public_order = commerce._public_order({
        "grand_total": 250, "gross_profit": 150, "items": [{
            "unit_price": 250, "buying_price_at_purchase": 100, "item_cost": 100,
            "item_gross_profit": 150, "combo_cost_components": [],
        }],
    })
    assert "gross_profit" not in public_order
    assert "buying_price_at_purchase" not in public_order["items"][0]
    assert "item_cost" not in public_order["items"][0]


def test_flash_price_and_product_cost_are_snapshotted_for_order_only(monkeypatch):
    sample = product()
    sample.update({
        "mrp": 300,
        "selling_price": 250,
        "buying_price": 100,
        "flash_price": 200,
        "flash_start": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        "flash_end": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    })
    monkeypatch.setattr(commerce.db, "products", FakeProducts(sample))
    cart_items, _, _ = run(commerce._price_items([CartItemIn(product_id="product-1", qty=1)]))
    order_items, _, _ = run(commerce._price_items([CartItemIn(product_id="product-1", qty=1)], include_cost_snapshots=True))

    assert cart_items[0]["unit_price"] == 200
    assert "buying_price_at_purchase" not in cart_items[0]
    assert order_items[0]["unit_price"] == 200
    assert order_items[0]["buying_price_at_purchase"] == 100
    assert commerce._snapshot_order_profit(order_items, 0)["gross_profit"] == 100

    sample["buying_price"] = 120
    assert order_items[0]["buying_price_at_purchase"] == 100
    next_order_items, _, _ = run(commerce._price_items([CartItemIn(product_id="product-1", qty=1)], include_cost_snapshots=True))
    assert next_order_items[0]["buying_price_at_purchase"] == 120


def test_coupon_allocation_and_quantity_are_included_in_gross_profit():
    items = [
        {"name": "Ring", "qty": 3, "mrp": 300, "unit_price": 250, "buying_price_at_purchase": 100},
        {"name": "Chain", "qty": 1, "mrp": 400, "unit_price": 350, "buying_price_at_purchase": 150},
    ]

    summary = commerce._snapshot_order_profit(items, 50)

    assert items[0]["item_revenue"] == 750
    assert items[0]["item_cost"] == 300
    assert items[0]["coupon_discount_allocated"] == 34.09
    assert items[1]["item_cost"] == 150
    assert round(sum(item["actual_item_revenue"] for item in items), 2) == 1050
    assert summary["product_cost_total"] == 450
    assert summary["gross_profit"] == 600


def test_combo_cost_snapshots_underlying_product_costs(monkeypatch):
    combo = {
        "id": "combo-1", "name": "Ring and Chain", "active": True, "stock": 10,
        "original_price": 590, "combo_price": 472, "product_ids": ["ring-1", "chain-1"],
        "images": ["combo.png"],
    }
    monkeypatch.setattr(commerce.db, "combos", FakeCombos(combo))
    monkeypatch.setattr(commerce.db, "products", FakeProducts(
        {"id": "ring-1", "name": "Ring", "buying_price": 100},
        {"id": "chain-1", "name": "Chain", "buying_price": 150},
    ))

    items, _, _ = run(commerce._price_items([CartItemIn(product_id="combo-1", qty=2, combo=True)], include_cost_snapshots=True))
    summary = commerce._snapshot_order_profit(items, 0)

    assert items[0]["buying_price_at_purchase"] == 250
    assert [component["buying_price_at_purchase"] for component in items[0]["combo_cost_components"]] == [100, 150]
    assert items[0]["item_cost"] == 500
    assert summary["gross_profit"] == 444


def test_order_creation_persists_cost_snapshot_but_redacts_customer_response(monkeypatch):
    sample = product()
    sample.update({"mrp": 300, "selling_price": 250, "buying_price": 100})
    orders = FakeOrders()
    monkeypatch.setattr(commerce.db, "products", FakeProducts(sample))
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce, "get_settings", AsyncMock(return_value={
        "currency": "INR", "free_shipping_threshold": 999, "delivery_charge": 50,
    }))
    monkeypatch.setattr(commerce, "next_order_number", AsyncMock(return_value="JH202600001"))
    monkeypatch.setattr(commerce, "PAYMENT_MODE", "mock")
    payload = CreateOrderInput(
        items=[CartItemIn(product_id="product-1", qty=3)],
        customer={"name": "Buyer", "mobile": "9999999999", "email": "buyer@example.com",
                  "address": "Street", "city": "Mumbai", "state": "MH", "pin": "400001"},
    )

    response = run(commerce.create_order(payload, None, None))
    stored = orders.document

    assert stored["items"][0]["buying_price_at_purchase"] == 100
    assert stored["items"][0]["item_revenue"] == 750
    assert stored["items"][0]["item_cost"] == 300
    assert stored["items"][0]["item_gross_profit"] == 450
    assert stored["gross_profit"] == 450
    assert "buying_price_at_purchase" not in response["order"]["items"][0]
    assert "gross_profit" not in response["order"]

    sample["buying_price"] = 120
    assert stored["items"][0]["buying_price_at_purchase"] == 100
    assert stored["items"][0]["item_gross_profit"] == 450


def test_legacy_orders_have_unavailable_profit_and_are_excluded_from_known_cost():
    report = _profit_report([
        {"id": "new", "payment_status": "PAID", "subtotal": 250, "coupon_discount": 0,
         "actual_revenue": 250, "items": [{"product_id": "new-product", "name": "New", "qty": 1,
             "unit_price": 250, "actual_item_revenue": 250, "item_cost": 100, "item_gross_profit": 150}]},
        {"id": "legacy", "payment_status": "PAID", "subtotal": 500, "coupon_discount": 0,
         "items": [{"product_id": "old-product", "name": "Old", "qty": 1, "unit_price": 500}]},
        {"id": "pending", "payment_status": "PENDING", "subtotal": 1000, "items": []},
    ])

    assert report["total_revenue"] == 750
    assert report["total_product_cost"] == 100
    assert report["gross_profit"] == 150
    assert report["cost_complete"] is False
    assert report["uncosted_item_count"] == 1
