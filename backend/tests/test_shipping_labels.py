import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "shipping_label_test")
os.environ.setdefault("JWT_SECRET", "shipping-label-unit-test")

from routers.admin_routes import _shipping_label_data


def test_shipping_label_uses_captured_customer_address_and_safe_fields():
    order = {
        "order_number": "JH202600123",
        "created_at": "2026-09-24T10:30:00+00:00",
        "customer": {
            "name": "A Customer With A Very Long Name",
            "address": "15/20 Chellaiah Apartment\nSadullah Street, T. Nagar\nNear a long landmark",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pin": "600017",
            "mobile": "9876543210",
            "password": "must-not-appear",
        },
        "grand_total": 536,
        "payment": {"cashfree_payment_id": "must-not-appear"},
    }
    settings = {
        "store_name": "VIAURA",
        "sender_business_name": "VIAURA",
        "sender_name": "VIAURA",
        "sender_address": "15/20 Chellaiah Apartment\nSadullah Street, T. Nagar",
        "sender_city": "Chennai",
        "sender_state": "Tamil Nadu",
        "sender_pin": "600017",
        "sender_country": "India",
        "sender_phone": "+917010177567",
        "sender_email": "hello@Viaura.com",
    }

    label = _shipping_label_data(order, settings)

    assert label["customer"]["address"].startswith("15/20 Chellaiah Apartment")
    assert label["customer"]["pin"] == "600017"
    assert label["sender"]["business_name"] == "VIAURA"
    assert "grand_total" not in label
    assert "payment" not in label
    assert "password" not in str(label)
    assert "cashfree_payment_id" not in str(label)


def test_shipping_label_defaults_optional_country():
    order = {
        "order_number": "JH202600124",
        "created_at": "2026-09-24T10:30:00+00:00",
        "customer": {"name": "Customer", "address": "Address", "city": "Chennai", "state": "Tamil Nadu", "pin": "600017"},
    }
    label = _shipping_label_data(order, {"sender_business_name": "VIAURA"})
    assert label["customer"]["country"] == "India"
    assert label["sender"]["country"] == "India"


def test_shipping_label_rejects_missing_delivery_information():
    order = {"order_number": "JH202600125", "customer": {"name": "Customer", "address": "", "city": "Chennai", "state": "Tamil Nadu", "pin": "600017"}}
    with pytest.raises(HTTPException) as error:
        _shipping_label_data(order, {})
    assert error.value.status_code == 400