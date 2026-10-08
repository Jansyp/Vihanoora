import asyncio
import csv
import io
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "viaura_sales_tests")
os.environ.setdefault("JWT_SECRET", "viaura-sales-test-secret")

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from routers import sales_routes
from routers.sales_routes import SaleInput, _build, _report


def make_sale(products=None, **overrides):
    values = {
        "products": products if products is not None else [{"product_id": "p1", "quantity": 2, "selling_price_per_unit": 249}],
        "source": "Meesho",
        "sale_date": "2026-10-06",
    }
    values.update(overrides)
    return SaleInput(**values)


def run(coro):
    return asyncio.run(coro)


def test_one_and_multiple_product_inputs_accept_actual_selling_prices_and_ignore_buying_override():
    one = make_sale(buying_price_per_unit=999)
    multi = make_sale([
        {"product_id": "p1", "quantity": 2, "selling_price_per_unit": 40, "buying_price_per_unit": 999},
        {"product_id": "p2", "quantity": 1, "selling_price_per_unit": 150, "buying_price_per_unit": 0},
    ])
    assert one.products[0].selling_price_per_unit == 249
    assert len(multi.products) == 2
    assert not hasattr(multi.products[0], "buying_price_per_unit")


def test_legacy_single_product_request_is_still_accepted():
    sale = SaleInput(
        product_id="p1", quantity=2, selling_price_per_unit=249,
        buying_price_per_unit=100, source="Website", sale_date="2026-10-06",
    )
    assert [(line.product_id, line.quantity) for line in sale.products] == [("p1", 2)]
    assert sale.packing_charge == 10


def test_duplicate_product_lines_are_rejected():
    with pytest.raises(ValidationError, match="only be added once"):
        make_sale([
            {"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20},
            {"product_id": "p1", "quantity": 2, "selling_price_per_unit": 30},
        ])


@pytest.mark.parametrize("products,overrides", [
    ([], {}),
    ([{"product_id": "", "quantity": 1, "selling_price_per_unit": 20}], {}),
    ([{"product_id": "p1", "quantity": 0, "selling_price_per_unit": 20}], {}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": -1}], {}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20}], {"packing_charge": -1}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20}], {"platform_charges": -1}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20}], {"shipping_other_charges": -1}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20}], {"discount_adjustment": -1}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20}], {"source": "Unknown"}),
    ([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 20}], {"sale_date": "not-a-date"}),
])
def test_invalid_sale_input_is_rejected(products, overrides):
    with pytest.raises(ValidationError):
        make_sale(products, **overrides)


def _catalogue(monkeypatch, costs, active=None):
    active = active or {product_id: True for product_id in costs}

    async def find_one(query, projection):
        product_id = query["id"]
        if product_id not in costs:
            return None
        return {
            "id": product_id, "name": f"Product {product_id}", "sku": f"SKU-{product_id}",
            "group": "women", "category": "Jewellery", "images": [f"/{product_id}.png"],
            "active": active[product_id], "buying_price": costs[product_id],
        }

    class Categories:
        def find(self, *args, **kwargs):
            return self

        async def to_list(self, length):
            return []

    monkeypatch.setattr(sales_routes, "db", SimpleNamespace(
        products=SimpleNamespace(find_one=AsyncMock(side_effect=find_one)),
        categories=Categories(),
    ))


def test_backend_uses_catalogue_cost_and_calculates_multi_product_totals(monkeypatch):
    _catalogue(monkeypatch, {"p1": 16, "p2": 60, "p3": 80})
    sale = make_sale([
        {"product_id": "p1", "quantity": 1, "selling_price_per_unit": 40, "buying_price_per_unit": 999},
        {"product_id": "p2", "quantity": 2, "selling_price_per_unit": 150, "buying_price_per_unit": 0},
        {"product_id": "p3", "quantity": 1, "selling_price_per_unit": 199},
    ], packing_charge=10, platform_charges=0, shipping_other_charges=10)

    record = run(_build(sale))

    assert [line["buying_price_per_unit"] for line in record["products"]] == [16, 60, 80]
    assert [line["total_selling_amount"] for line in record["products"]] == [40, 300, 199]
    assert [line["total_buying_cost"] for line in record["products"]] == [16, 120, 80]
    assert record["gross_selling_amount"] == 539
    assert record["total_buying_cost"] == 216
    assert record["gross_profit"] == 323
    assert record["packing_charge"] == 10
    assert record["net_profit"] == 303


def test_missing_buying_price_and_inactive_products_prevent_sale(monkeypatch):
    _catalogue(monkeypatch, {"p1": None})
    with pytest.raises(HTTPException) as missing:
        run(_build(make_sale()))
    assert "Buying price is not configured" in missing.value.detail

    _catalogue(monkeypatch, {"p1": 10}, {"p1": False})
    with pytest.raises(HTTPException) as inactive:
        run(_build(make_sale()))
    assert "Only active" in inactive.value.detail


def test_historical_buying_price_is_preserved_when_editing_existing_line(monkeypatch):
    _catalogue(monkeypatch, {"p1": 18, "p2": 60})
    existing = {
        "sale_id": "sale-1", "source": "Meesho", "created_at": "old",
        "products": [{
            "line_id": "line-old", "product_id": "p1", "product_name": "Historic name",
            "product_image": "/old.png", "sku": "old-sku", "section": "women", "category": "Old category",
            "quantity": 1, "selling_price_per_unit": 40, "buying_price_per_unit": 16,
            "total_selling_amount": 40, "total_buying_cost": 16,
        }],
    }
    edited = make_sale([
        {"line_id": "line-old", "product_id": "p1", "quantity": 2, "selling_price_per_unit": 45,
         "buying_price_per_unit": 999},
    ], packing_charge=5)
    record = run(_build(edited, existing))
    assert record["products"][0]["buying_price_per_unit"] == 16
    assert record["products"][0]["total_buying_cost"] == 32
    assert record["products"][0]["product_name"] == "Historic name"
    assert record["created_at"] == "old"

    # Removing the existing line and re-adding the same product has no historical line id.
    readded = make_sale([{"product_id": "p1", "quantity": 1, "selling_price_per_unit": 45}])
    new_record = run(_build(readded, existing))
    assert new_record["products"][0]["buying_price_per_unit"] == 18


def test_report_counts_sale_once_and_aggregates_all_product_lines():
    record = {
        "sale_id": "sale-1", "source": "Meesho", "packing_charge": 10, "platform_charges": 0,
        "shipping_other_charges": 10, "discount_adjustment": 0,
        "products": [
            {"product_id": "p1", "product_name": "Clips", "sku": "S1", "quantity": 1,
             "total_selling_amount": 40, "total_buying_cost": 16},
            {"product_id": "p2", "product_name": "Bracelet", "sku": "S2", "quantity": 2,
             "total_selling_amount": 300, "total_buying_cost": 120},
        ],
        "gross_selling_amount": 340, "total_buying_cost": 136, "gross_profit": 204, "net_profit": 184,
    }
    report = _report([record])
    assert report["overall"]["orders"] == 1
    assert report["overall"]["products_count"] == 2
    assert report["overall"]["quantity"] == 3
    assert report["overall"]["sales"] == 340
    assert report["overall"]["buying_cost"] == 136
    assert report["overall"]["packing_charges"] == 10
    assert report["overall"]["charges"] == 20
    assert report["overall"]["net_profit"] == 184
    assert {p["product_id"]: p["quantity"] for p in report["products"]} == {"p1": 1, "p2": 2}
    assert round(sum(p["net_profit"] for p in report["products"]), 2) == 184
    product_report = _report([record], product="p2")
    assert product_report["overall"]["orders"] == 1
    assert product_report["overall"]["quantity"] == 2
    assert [p["product_id"] for p in product_report["products"]] == ["p2"]


def test_legacy_sales_are_reported_with_zero_historical_packing_charge():
    record = {"source": "Referral", "product_id": "p1", "product_name": "Bracelet", "sku": "S1",
              "quantity": 2, "gross_selling_amount": 498, "total_buying_cost": 200, "gross_profit": 298,
              "platform_charges": 30, "shipping_other_charges": 0, "discount_adjustment": 0, "net_profit": 268}
    report = _report([record])
    assert report["overall"]["orders"] == 1
    assert report["overall"]["quantity"] == 2
    assert report["overall"]["packing_charges"] == 0
    assert report["overall"]["net_profit"] == 268


def test_manual_external_sale_inventory_is_reversed_and_website_inventory_is_untouched(monkeypatch):
    stock = {"p1": 10, "p2": 8}

    class Products:
        async def update_one(self, query, update):
            product_id = query["id"]
            delta = update["$inc"]["stock"]
            if "stock" in query and stock[product_id] < query["stock"]["$gte"]:
                return SimpleNamespace(modified_count=0)
            stock[product_id] += delta
            return SimpleNamespace(modified_count=1)

    monkeypatch.setattr(sales_routes, "db", SimpleNamespace(products=Products()))
    record = {
        "inventory_adjusted": True,
        "products": [
            {"product_id": "p1", "quantity": 2},
            {"product_id": "p2", "quantity": 3},
        ],
    }
    run(sales_routes._adjust_inventory(record, -1))
    assert stock == {"p1": 8, "p2": 5}
    run(sales_routes._adjust_inventory(record, 1))
    assert stock == {"p1": 10, "p2": 8}

    website_sale = {**record, "inventory_adjusted": False}
    run(sales_routes._adjust_inventory(website_sale, -1))
    assert stock == {"p1": 10, "p2": 8}


def test_csv_exports_each_product_line_and_sale_level_charges_once(monkeypatch):
    sale = {
        "sale_id": "sale-1", "source": "Referral", "sale_date": "2026-10-06",
        "packing_charge": 10, "platform_charges": 5, "shipping_other_charges": 5,
        "discount_adjustment": 0, "gross_selling_amount": 190,
        "products": [
            {"product_id": "p1", "product_name": "Clips", "sku": "S1", "quantity": 1,
             "selling_price_per_unit": 40, "buying_price_per_unit": 16,
             "total_selling_amount": 40, "total_buying_cost": 16},
            {"product_id": "p2", "product_name": "Bracelet", "sku": "S2", "quantity": 1,
             "selling_price_per_unit": 150, "buying_price_per_unit": 60,
             "total_selling_amount": 150, "total_buying_cost": 60},
        ],
    }

    class Cursor:
        def sort(self, *args):
            return self

        async def to_list(self, length):
            return [sale]

    monkeypatch.setattr(sales_routes, "db", SimpleNamespace(
        sales_records=SimpleNamespace(find=lambda *args: Cursor()),
    ))
    response = run(sales_routes.export_sales())

    async def read_body():
        chunks = [chunk async for chunk in response.body_iterator]
        return "".join(chunk.decode() if isinstance(chunk, bytes) else chunk for chunk in chunks)

    rows = list(csv.DictReader(io.StringIO(run(read_body()))))
    assert len(rows) == 2
    assert [row["Product"] for row in rows] == ["Clips", "Bracelet"]
    assert [row["Sale ID"] for row in rows] == ["sale-1", "sale-1"]
    assert [row["Packing Charge"] for row in rows] == ["10.0", ""]
    assert sum(float(row["Net Profit"]) for row in rows) == pytest.approx(94)
