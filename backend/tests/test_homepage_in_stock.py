import asyncio
import os

# Lazy Motor client: nothing here connects to a real database.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "unit_test_unused")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")

asyncio.set_event_loop(asyncio.new_event_loop())

import pytest

from routers import admin_routes, catalog_routes


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def captured(monkeypatch):
    calls = []

    async def fake_page(query, page, limit, sort, min_discount=0, **kwargs):
        calls.append({"query": dict(query), "limit": limit, "kwargs": kwargs})
        return {"total": 0, "page": page, "limit": limit, "items": []}

    monkeypatch.setattr(catalog_routes, "_product_page", fake_page)
    return calls


@pytest.mark.parametrize("flag", ["trending", "best_seller", "featured", "new_arrival", "giftable"])
def test_homepage_collection_queries_require_positive_stock(captured, flag):
    run(catalog_routes.list_products(**{flag: True}, stock_status="in_stock", limit=12))
    query = captured[0]["query"]
    assert query[flag] is True
    assert query["stock"] == {"$gt": 0}  # zero and negative stock never match
    assert captured[0]["limit"] == 12  # filtered in the query, so the page is still filled


def test_offer_zone_in_stock_only(captured):
    run(catalog_routes.offer_zone(in_stock_only=True, limit=12))
    assert captured[0]["query"] == {"active": True, "stock": {"$gt": 0}}
    assert captured[0]["kwargs"]["discount_only"] is True


def test_default_catalogue_and_offer_zone_unchanged(captured):
    run(catalog_routes.list_products())
    run(catalog_routes.offer_zone())
    assert "stock" not in captured[0]["query"]
    assert captured[1]["query"] == {"active": True}


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_):
        return self

    def skip(self, *_):
        return self

    def limit(self, *_):
        return self

    async def to_list(self, length=None):
        return list(self.docs)


class _FakeProducts:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []
        self.writes = 0

    def find(self, query, *_):
        self.queries.append(query)
        return _FakeCursor(self.docs)

    async def count_documents(self, query):
        return len(self.docs)

    async def update_one(self, *_, **__):
        self.writes += 1


def test_admin_listing_still_includes_out_of_stock_and_does_not_write(monkeypatch):
    docs = [
        {"id": "a", "name": "A", "stock": 4, "mrp": 100, "selling_price": 80},
        {"id": "b", "name": "B", "stock": 0, "mrp": 100, "selling_price": 80},
        {"id": "c", "name": "C", "stock": -2, "mrp": 100, "selling_price": 80},
    ]
    fake = _FakeProducts(docs)
    monkeypatch.setattr(admin_routes.db, "products", fake, raising=False)
    items = run(admin_routes.admin_products(search="x"))["items"]
    assert [p["id"] for p in items] == ["a", "b", "c"]
    assert [p["stock"] for p in items] == [4, 0, -2]
    assert "stock" not in fake.queries[0]
    assert fake.writes == 0
