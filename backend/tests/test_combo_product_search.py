import asyncio
import uuid

asyncio.set_event_loop(asyncio.new_event_loop())

import pytest
from fastapi.testclient import TestClient

from server import app
from core import require_admin


def override_admin():
    return {"role": "admin"}


app.dependency_overrides[require_admin] = override_admin


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_combo_product_search_finds_older_products_and_selected_ids(client):
    suffix = uuid.uuid4().hex[:8]
    created_ids = []
    try:
        for index in range(31):
            response = client.post("/api/admin/products", json={
                "name": f"Combo Search Product {suffix} {index}",
                "group": "women",
                "category": "Bracelets",
                "mrp": 100,
                "selling_price": 80,
                "stock": 5,
            })
            assert response.status_code == 200, response.text
            created_ids.append(response.json()["id"])

        older_id = created_ids[0]
        search = client.get("/api/admin/products", params={"search": f"pRoDuCt {suffix} 0", "page": 1, "limit": 30})
        assert search.status_code == 200, search.text
        payload = search.json()
        assert payload["total"] == 1
        assert payload["items"][0]["id"] == older_id

        selected = client.get("/api/admin/products", params={"product_ids": older_id, "page": 1, "limit": 30})
        assert selected.status_code == 200, selected.text
        assert selected.json()["items"][0]["id"] == older_id
    finally:
        for product_id in created_ids:
            client.delete(f"/api/admin/products/{product_id}")
