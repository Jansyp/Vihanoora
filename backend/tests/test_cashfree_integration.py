import asyncio
import base64
import hashlib
import hmac
import json
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cashfree_test")
os.environ.setdefault("JWT_SECRET", "cashfree-unit-test-jwt")

import routers.commerce_routes as commerce
from models import VerifyPaymentInput


class FakeCollection:
    def __init__(self, document=None):
        self.document = document
        self.update_calls = []

    async def find_one(self, query, projection=None):
        if self.document is None:
            return None
        if "id" in query and query["id"] != self.document.get("id"):
            return None
        if "payment.cashfree_order_id" in query and query["payment.cashfree_order_id"] != self.document.get("payment", {}).get("cashfree_order_id"):
            return None
        return dict(self.document)

    async def update_one(self, query, update):
        self.update_calls.append((query, update))
        sets = update.get("$set", {})
        self.document.update(sets)
        return SimpleNamespace(matched_count=1, modified_count=1)


class FakeWebhookEvents:
    def __init__(self):
        self.ids = set()

    async def find_one(self, query):
        return {"event_id": query["event_id"]} if query["event_id"] in self.ids else None

    async def insert_one(self, document):
        self.ids.add(document["event_id"])


def run(coro):
    return asyncio.run(coro)


def make_order(amount=150.0, status="PENDING"):
    return {
        "id": "internal-order",
        "grand_total": amount,
        "currency": "INR",
        "payment_status": status,
        "payment": {"cashfree_order_id": "JH202600001"},
        "items": [],
        "customer": {"email": "buyer@example.com"},
        "coupon_code": None,
    }


def test_cashfree_amount_matching_uses_decimal_precision():
    assert commerce._amount_matches("150.00", 150)
    assert not commerce._amount_matches("150.01", 150)


def test_frontend_amount_is_not_used_for_provider_verification(monkeypatch):
    orders = FakeCollection(make_order(150.0))
    monkeypatch.setattr(commerce, "PAYMENT_MODE", "cashfree")
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce, "_cashfree_request", AsyncMock(return_value={
        "order_id": "JH202600001", "order_amount": 149.99, "order_currency": "INR", "order_status": "PAID"
    }))
    with pytest.raises(HTTPException) as error:
        run(commerce.verify_payment(VerifyPaymentInput(order_id="internal-order")))
    assert error.value.status_code == 400


def test_successful_payment_verification_finalizes_order(monkeypatch):
    order = make_order()
    orders = FakeCollection(order)
    finalize = AsyncMock()
    monkeypatch.setattr(commerce, "PAYMENT_MODE", "cashfree")
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce, "_cashfree_request", AsyncMock(return_value={
        "order_id": "JH202600001", "order_amount": 150, "order_currency": "INR", "order_status": "PAID"
    }))
    monkeypatch.setattr(commerce, "_finalize_paid", finalize)
    result = run(commerce.verify_payment(VerifyPaymentInput(order_id="internal-order")))
    finalize.assert_awaited_once_with(order, "JH202600001", "cashfree")
    assert result["status"] == "pending"


def test_failed_payment_is_not_paid(monkeypatch):
    orders = FakeCollection(make_order())
    monkeypatch.setattr(commerce, "PAYMENT_MODE", "cashfree")
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce, "_cashfree_request", AsyncMock(return_value={
        "order_id": "JH202600001", "order_amount": 150, "order_currency": "INR", "order_status": "EXPIRED"
    }))
    result = run(commerce.verify_payment(VerifyPaymentInput(order_id="internal-order")))
    assert result["status"] == "failed"
    assert orders.document["payment_status"] == "FAILED"


def test_pending_payment_remains_pending(monkeypatch):
    orders = FakeCollection(make_order())
    monkeypatch.setattr(commerce, "PAYMENT_MODE", "cashfree")
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce, "_cashfree_request", AsyncMock(return_value={
        "order_id": "JH202600001", "order_amount": 150, "order_currency": "INR", "order_status": "ACTIVE"
    }))
    result = run(commerce.verify_payment(VerifyPaymentInput(order_id="internal-order")))
    assert result["status"] == "pending"
    assert orders.document["payment_status"] == "PENDING"


def test_invalid_provider_order_is_rejected(monkeypatch):
    monkeypatch.setattr(commerce, "PAYMENT_MODE", "cashfree")
    monkeypatch.setattr(commerce.db, "orders", FakeCollection(make_order()))
    monkeypatch.setattr(commerce, "_cashfree_request", AsyncMock(return_value={
        "order_id": "other-order", "order_amount": 150, "order_currency": "INR", "order_status": "PAID"
    }))
    with pytest.raises(HTTPException) as error:
        run(commerce.verify_payment(VerifyPaymentInput(order_id="internal-order")))
    assert error.value.status_code == 400


def signed_request(payload, event_id="cashfree-event-1", secret="unit-test-secret"):
    body = json.dumps(payload, separators=(",", ":")).encode()
    timestamp = "1710000000000"
    signature = base64.b64encode(hmac.new(secret.encode(), timestamp.encode() + body, hashlib.sha256).digest()).decode()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    request = Request({
        "type": "http", "method": "POST", "path": "/api/payments/cashfree/webhook",
        "headers": [(b"x-webhook-timestamp", timestamp.encode()),
                     (b"x-webhook-signature", signature.encode()),
                     (b"x-webhook-id", event_id.encode())],
        "query_string": b"",
        "client": ("127.0.0.1", 1),
        "server": ("testserver", 80),
        "scheme": "http",
    }, receive)
    return request


def success_payload(status="SUCCESS"):
    return {"type": "PAYMENT_SUCCESS_WEBHOOK", "data": {
        "order": {"order_id": "JH202600001", "order_amount": 150},
        "payment": {"order_id": "JH202600001", "cf_payment_id": "cf-pay-1", "payment_status": status},
    }}


def test_webhook_signature_verification(monkeypatch):
    monkeypatch.setattr(commerce, "CASHFREE_SECRET_KEY", "unit-test-secret")
    assert commerce._cashfree_signature_is_valid(b"body", "1710000000000", base64.b64encode(hmac.new(
        b"unit-test-secret", b"1710000000000body", hashlib.sha256
    ).digest()).decode())
    assert not commerce._cashfree_signature_is_valid(b"body", "1710000000000", "bad")


def test_webhook_success_updates_payment_once(monkeypatch):
    orders = FakeCollection(make_order())
    events = FakeWebhookEvents()
    monkeypatch.setattr(commerce, "CASHFREE_SECRET_KEY", "unit-test-secret")
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce.db, "webhook_events", events)
    finalize = AsyncMock()
    monkeypatch.setattr(commerce, "_finalize_paid", finalize)
    result = run(commerce.cashfree_webhook(signed_request(success_payload())))
    assert result["status"] == "processed"
    finalize.assert_awaited_once_with(orders.document, "cf-pay-1", "cashfree")


def test_duplicate_webhook_is_ignored(monkeypatch):
    events = FakeWebhookEvents()
    monkeypatch.setattr(commerce, "CASHFREE_SECRET_KEY", "unit-test-secret")
    monkeypatch.setattr(commerce.db, "webhook_events", events)
    monkeypatch.setattr(commerce.db, "orders", FakeCollection(make_order()))
    monkeypatch.setattr(commerce, "_finalize_paid", AsyncMock())
    request = signed_request(success_payload(), event_id="duplicate-event")
    assert run(commerce.cashfree_webhook(request))["status"] == "processed"
    duplicate = signed_request(success_payload(), event_id="duplicate-event")
    assert run(commerce.cashfree_webhook(duplicate))["status"] == "duplicate_ignored"


def test_invalid_webhook_signature_is_rejected(monkeypatch):
    monkeypatch.setattr(commerce, "CASHFREE_SECRET_KEY", "unit-test-secret")
    request = signed_request(success_payload())
    request.scope["headers"] = [(b"x-webhook-timestamp", b"1710000000000"), (b"x-webhook-signature", b"invalid")]
    with pytest.raises(HTTPException) as error:
        run(commerce.cashfree_webhook(request))
    assert error.value.status_code == 400


def test_failed_webhook_does_not_finalize_order(monkeypatch):
    orders = FakeCollection(make_order())
    events = FakeWebhookEvents()
    monkeypatch.setattr(commerce, "CASHFREE_SECRET_KEY", "unit-test-secret")
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce.db, "webhook_events", events)
    finalize = AsyncMock()
    monkeypatch.setattr(commerce, "_finalize_paid", finalize)
    result = run(commerce.cashfree_webhook(signed_request(success_payload("FAILED"), event_id="failed-event")))
    assert result["status"] == "processed"
    finalize.assert_not_awaited()
    assert orders.document["payment_status"] == "FAILED"


def test_cashfree_payment_reference_is_written(monkeypatch):
    orders = FakeCollection(make_order())
    monkeypatch.setattr(commerce.db, "orders", orders)
    monkeypatch.setattr(commerce.db, "products", FakeCollection())
    monkeypatch.setattr(commerce.db, "combos", FakeCollection())
    monkeypatch.setattr(commerce.db, "coupons", FakeCollection())
    monkeypatch.setattr(commerce.db, "coupon_usage", FakeCollection())
    monkeypatch.setattr(commerce, "send_order_email", AsyncMock())
    run(commerce._finalize_paid(orders.document, "cf-pay-1", "cashfree"))
    update = orders.update_calls[-1][1]["$set"]
    assert update["payment.cashfree_payment_id"] == "cf-pay-1"
    assert update["payment.method"] == "cashfree"
