import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from types import ModuleType
from types import SimpleNamespace

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "viaura_analytics_tests")
os.environ.setdefault("JWT_SECRET", "viaura-analytics-test-secret")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.analytics_routes as analytics
from core import get_current_user


class AsyncCursor:
    def __init__(self, documents):
        self.documents = list(documents)

    def __aiter__(self):
        self.index = 0
        return self

    async def __anext__(self):
        if self.index >= len(self.documents):
            raise StopAsyncIteration
        value = self.documents[self.index]
        self.index += 1
        return value


class FakeCollection:
    def __init__(self, documents=()):
        self.documents = list(documents)
        self.inserted = []
        self.last_query = None

    async def find_one(self, query, projection=None):
        return next((doc for doc in self.documents if doc.get("id") == query.get("id")), None)

    async def insert_one(self, document):
        self.inserted.append(dict(document))

    def find(self, query, projection=None):
        self.last_query = query
        if query.get("payment_status") == "PAID":
            paid_at_range = query["$or"][0]["paid_at"]
            start, end = paid_at_range["$gte"], paid_at_range["$lt"]
            results = [doc for doc in self.documents if doc.get("payment_status") == "PAID" and start <= (doc.get("paid_at") or doc.get("created_at", "")) < end]
        else:
            time_range = query.get("timestamp", {})
            start, end = time_range.get("$gte"), time_range.get("$lt")
            results = [doc for doc in self.documents if start <= doc.get("timestamp") < end]
        return AsyncCursor(results)


def run(coro):
    return asyncio.run(coro)


def test_date_range_uses_india_local_midnight():
    start_day, end_day, start_utc, end_utc = analytics._date_range(
        datetime(2026, 9, 23).date(), datetime(2026, 9, 23).date()
    )
    assert start_day.isoformat() == end_day.isoformat() == "2026-09-23"
    assert start_utc.isoformat() == "2026-09-22T18:30:00+00:00"
    assert end_utc.isoformat() == "2026-09-23T18:30:00+00:00"


def test_ga4_data_api_reports_are_aggregated_and_mapped_without_user_dimensions(monkeypatch):
    reports = [
        {"metricHeaders": [{"name": name} for name in ["totalUsers", "sessions", "screenPageViews", "ecommercePurchases", "purchaseRevenue"]],
         "rows": [{"metricValues": [{"value": value} for value in ["81", "96", "243", "4", "3799.5"]]}]},
        {"dimensionHeaders": [{"name": "eventName"}], "metricHeaders": [{"name": "eventCount"}],
         "rows": [{"dimensionValues": [{"value": "view_item"}], "metricValues": [{"value": "32"}]},
                  {"dimensionValues": [{"value": "add_to_cart"}], "metricValues": [{"value": "9"}]},
                  {"dimensionValues": [{"value": "whatsapp_order_click"}], "metricValues": [{"value": "3"}]}]},
        {"dimensionHeaders": [{"name": name} for name in ["sessionSource", "sessionMedium", "sessionCampaignName"]],
         "metricHeaders": [{"name": "sessions"}], "rows": [{"dimensionValues": [{"value": "google"}, {"value": "organic"}, {"value": "fall"}], "metricValues": [{"value": "51"}]}]},
        {"dimensionHeaders": [{"name": "deviceCategory"}], "metricHeaders": [{"name": "sessions"}],
         "rows": [{"dimensionValues": [{"value": "mobile"}], "metricValues": [{"value": "65"}]}]},
        {"dimensionHeaders": [{"name": name} for name in ["itemId", "itemName", "itemCategory"]],
         "metricHeaders": [{"name": name} for name in ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"]],
         "rows": [{"dimensionValues": [{"value": "sku-1"}, {"value": "Pearl Bracelet"}, {"value": "Bracelets"}], "metricValues": [{"value": value} for value in ["20", "7", "2", "1500"]]}]},
        {"dimensionHeaders": [{"name": "date"}], "metricHeaders": [{"name": name} for name in ["totalUsers", "sessions", "screenPageViews", "ecommercePurchases", "purchaseRevenue"]],
         "rows": [{"dimensionValues": [{"value": "20261001"}], "metricValues": [{"value": value} for value in ["81", "96", "243", "4", "3799.5"]]}]},
    ]
    requested = []

    def fake_run(start, end, dimensions, metrics, dimension_filter=None):
        requested.append((start, end, dimensions, metrics, dimension_filter))
        return reports[len(requested) - 1]

    monkeypatch.setattr(analytics, "_ga4_run_report", fake_run)
    result = analytics._ga4_data_sync("2026-10-01", "2026-10-01")

    assert result["available"] is True
    assert result["property_id"] == "556716338"
    assert result["overview"] == {
        "users": 81, "sessions": 96, "page_views": 243, "product_views": 32,
        "add_to_cart": 9, "whatsapp_order_clicks": 3, "purchases": 4, "purchase_revenue": 3799.5,
    }
    assert requested[4][3] == ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"]
    assert result["top_products"][0] == {
        "product_id": "sku-1", "product_name": "Pearl Bracelet", "item_category": "Bracelets",
        "views": 20, "add_to_cart": 7, "purchases": 2, "revenue": 1500.0,
    }
    assert result["daily_activity"][0]["date"] == "2026-10-01"
    assert all("userId" not in dimensions and "userName" not in dimensions for _, _, dimensions, _, _ in requested)
    assert requested[1][4]["filter"]["fieldName"] == "eventName"


def test_ga4_request_uses_read_only_scope_and_target_property(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"rows": []}

    class FakeSession:
        def __init__(self, credentials):
            captured["credentials"] = credentials

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json, timeout):
            captured.update({"url": url, "body": json, "timeout": timeout})
            return FakeResponse()

    def fake_default(scopes):
        captured["scopes"] = scopes
        return "mock-credential", "viaura-510318"

    fake_google = ModuleType("google")
    fake_google.__path__ = []
    fake_auth = ModuleType("google.auth")
    fake_auth.default = fake_default
    fake_google.auth = fake_auth
    fake_transport = ModuleType("google.auth.transport")
    fake_transport.__path__ = []
    fake_transport_requests = ModuleType("google.auth.transport.requests")
    fake_transport_requests.AuthorizedSession = FakeSession
    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.auth", fake_auth)
    monkeypatch.setitem(sys.modules, "google.auth.transport", fake_transport)
    monkeypatch.setitem(sys.modules, "google.auth.transport.requests", fake_transport_requests)

    analytics._ga4_run_report("2026-10-01", "2026-10-01", [], ["sessions"])

    assert captured["scopes"] == [analytics.GA4_READONLY_SCOPE]
    assert captured["url"] == "https://analyticsdata.googleapis.com/v1beta/properties/556716338:runReport"
    assert captured["body"]["dateRanges"] == [{"startDate": "2026-10-01", "endDate": "2026-10-01"}]


def test_report_separates_order_intent_from_generic_whatsapp_and_uses_paid_orders(monkeypatch):
    product_id = "product-analytics-1"
    events = [
        {"event_name": "page_view", "timestamp": datetime(2026, 9, 22, 20, tzinfo=timezone.utc), "session_id": "s1", "source": "Instagram", "medium": "social", "campaign": "new_arrivals", "device": "mobile", "items": []},
        {"event_name": "view_item", "timestamp": datetime(2026, 9, 22, 20, 1, tzinfo=timezone.utc), "session_id": "s1", "device": "mobile", "items": [{"product_id": product_id, "product_name": "Pearl Bracelet", "item_category": "Bracelets", "quantity": 1, "combo": False}]},
        {"event_name": "add_to_cart", "timestamp": datetime(2026, 9, 22, 20, 2, tzinfo=timezone.utc), "session_id": "s1", "device": "mobile", "items": [{"product_id": product_id, "product_name": "Pearl Bracelet", "item_category": "Bracelets", "quantity": 2, "combo": False}]},
        {"event_name": "whatsapp_order_click", "timestamp": datetime(2026, 9, 22, 20, 3, tzinfo=timezone.utc), "session_id": "s1", "device": "mobile", "items": [{"product_id": product_id, "product_name": "Pearl Bracelet", "item_category": "Bracelets", "quantity": 2, "combo": False}]},
        {"event_name": "whatsapp_click", "timestamp": datetime(2026, 9, 22, 20, 4, tzinfo=timezone.utc), "session_id": "s1", "device": "mobile", "items": []},
    ]
    orders = [
        {"id": "paid-order", "payment_status": "PAID", "paid_at": "2026-09-23T02:00:00+00:00", "grand_total": 520,
         "items": [{"product_id": product_id, "name": "Pearl Bracelet", "unit_price": 250, "actual_item_revenue": 500, "qty": 2, "combo": False}],
         "customer": {"name": "Sensitive Name", "email": "secret@example.com", "phone": "9876543210"}},
        {"id": "pending-order", "payment_status": "PENDING", "created_at": "2026-09-23T02:00:00+00:00", "grand_total": 999, "items": []},
    ]
    event_collection = FakeCollection(events)
    order_collection = FakeCollection(orders)
    monkeypatch.setattr(analytics, "db", SimpleNamespace(analytics_events=event_collection, orders=order_collection))

    report = run(analytics._analytics_report(datetime(2026, 9, 23).date(), datetime(2026, 9, 23).date()))

    assert report["overview"] == {
        "visitors": 1, "product_views": 1, "add_to_cart": 1,
        "whatsapp_order_clicks": 1, "orders": 1, "revenue": 520.0,
    }
    assert report["top_products"] == [{
        "product_id": product_id, "product_name": "Pearl Bracelet", "item_category": "Bracelets", "combo": False,
        "views": 1, "add_to_cart": 1, "whatsapp_orders": 1, "orders": 1, "revenue": 500.0,
    }]
    assert report["traffic_sources"][0] == {"source": "Instagram", "medium": "social", "campaign": "new_arrivals", "sessions": 1}
    assert report["devices"] == [{"device": "Mobile", "sessions": 1}]
    assert report["daily_activity"][0]["orders"] == 1
    assert report["funnel"]["completed_orders"]["percent_of_visitors"] is None
    assert "secret@example.com" not in str(report)
    assert "9876543210" not in str(report)
    assert "Sensitive Name" not in str(report)


def test_event_collection_stores_only_allowlisted_non_pii_fields(monkeypatch):
    event_collection = FakeCollection()
    product_collection = FakeCollection([{"id": "product-1", "name": "Real Bracelet", "category": "Bracelets", "group": "women"}])
    monkeypatch.setattr(analytics, "db", SimpleNamespace(analytics_events=event_collection, products=product_collection, combos=FakeCollection()))
    session_id = str(uuid.uuid4())
    payload = analytics.AnalyticsEventInput.model_validate({
        "event_name": "whatsapp_order_click", "session_id": session_id,
        "items": [{"item_id": "product-1", "quantity": 2, "item_name": "Injected PII Name"}],
        "source": "instagram", "medium": "social", "campaign": "launch",
        "email": "secret@example.com", "phone": "9876543210", "message": "private WhatsApp text",
    })

    response = run(analytics.collect_analytics_event(payload))

    stored = event_collection.inserted[0]
    assert response.status_code == 202
    assert stored["event_name"] == "whatsapp_order_click"
    assert stored["items"] == [{"product_id": "product-1", "product_name": "Real Bracelet", "item_category": "Bracelets", "quantity": 2, "combo": False}]
    assert not ({"email", "phone", "message", "customer", "transaction_id"} & stored.keys())
    assert "Injected PII Name" not in str(stored)


@pytest.mark.parametrize("role,expected", [(None, 401), ("customer", 403), ("admin", 200)])
def test_analytics_route_authentication_and_authorization(monkeypatch, role, expected):
    empty = FakeCollection()
    monkeypatch.setattr(analytics, "db", SimpleNamespace(analytics_events=empty, orders=empty))
    app = FastAPI()
    app.include_router(analytics.router)
    if role:
        async def user_override():
            return {"id": "test-user", "role": role}
        app.dependency_overrides[get_current_user] = user_override
    with TestClient(app) as client:
        response = client.get("/api/admin/analytics", params={"start_date": "2026-09-23", "end_date": "2026-09-23"})
    app.dependency_overrides.clear()
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["range"] == {"start_date": "2026-09-23", "end_date": "2026-09-23", "timezone": "Asia/Kolkata"}


def test_empty_report_marks_web_metrics_unavailable(monkeypatch):
    empty = FakeCollection()
    monkeypatch.setattr(analytics, "db", SimpleNamespace(analytics_events=empty, orders=empty))
    report = run(analytics._analytics_report(datetime(2026, 9, 23).date(), datetime(2026, 9, 23).date()))
    assert report["availability"]["website_events"] is False
    assert report["overview"]["visitors"] is None
    assert report["overview"]["product_views"] is None
    assert report["overview"]["orders"] == 0

