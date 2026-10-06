import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "viaura_sales_tests")
os.environ.setdefault("JWT_SECRET", "viaura-sales-test-secret")

import pytest
from pydantic import ValidationError

from routers.sales_routes import SaleInput, _financials, _report


def payload(**overrides):
    values = {"product_id": "p1", "quantity": 2, "selling_price_per_unit": 249,
              "buying_price_per_unit": 100, "source": "Meesho", "sale_date": "2026-10-06"}
    values.update(overrides)
    return SaleInput(**values)


def test_sale_input_accepts_price_independent_of_catalogue_and_valid_sources():
    assert payload(selling_price_per_unit=249, source="Meesho").selling_price_per_unit == 249
    for source in ("Website", "Referral", "Meesho"):
        assert payload(source=source).source == source


def test_financial_calculations_use_quantity_and_actual_charges():
    calculated = _financials(payload(platform_charges=30))
    assert calculated == {"gross_selling_amount": 498, "total_buying_cost": 200,
                          "gross_profit": 298, "net_profit": 268}


@pytest.mark.parametrize("overrides", [
    {"product_id": ""}, {"quantity": 0}, {"quantity": -1}, {"quantity": 1.5},
    {"selling_price_per_unit": -1}, {"buying_price_per_unit": -1},
    {"platform_charges": -1}, {"shipping_other_charges": -1}, {"discount_adjustment": -1},
    {"source": "Unknown"}, {"sale_date": "not-a-date"},
])
def test_sale_input_rejects_invalid_values(overrides):
    with pytest.raises(ValidationError):
        payload(**overrides)


def test_report_aggregates_sales_sources_products_and_actual_charges():
    record = {"source": "Meesho", "product_id": "p1", "product_name": "Bracelet", "sku": "S1",
              "quantity": 2, "gross_selling_amount": 498, "total_buying_cost": 200, "gross_profit": 298,
              "platform_charges": 30, "shipping_other_charges": 0, "discount_adjustment": 0, "net_profit": 268}
    report = _report([record, {**record, "source": "Referral", "quantity": 1, "gross_selling_amount": 249,
                               "total_buying_cost": 100, "gross_profit": 149, "platform_charges": 0,
                               "net_profit": 149}])
    assert report["overall"]["sales"] == 747
    assert report["overall"]["quantity"] == 3
    assert report["overall"]["net_profit"] == 417
    assert report["sources"]["Meesho"]["charges"] == 30
    assert report["products"][0]["buying_cost"] == 300
    assert len(report["source_products"]) == 2
