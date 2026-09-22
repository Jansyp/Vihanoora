import asyncio
import uuid

asyncio.set_event_loop(asyncio.new_event_loop())

import pytest
from fastapi.testclient import TestClient

from server import app
from routers.admin_routes import _subcategory_id


def override_admin():
    return {"role": "admin"}


app.dependency_overrides.clear()
app.dependency_overrides[__import__('core').require_admin] = override_admin


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_admin_category_management_routes_exist_and_create_category(client):
    clean_name = f"Test Rings {uuid.uuid4().hex[:6]}"

    r = client.get("/api/admin/categories")
    assert r.status_code == 200, r.text

    r = client.post("/api/admin/categories", json={"name": clean_name, "group": "women", "active": True})
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["name"] == clean_name
    assert payload["group"] == "women"
    assert payload["slug"] == "test-rings-" + clean_name.split(" ")[-1].lower()

    r = client.get("/api/categories")
    assert r.status_code == 200, r.text
    data = r.json()
    assert any(item["group"] == "women" and any(sub["name"] == clean_name for sub in item["subcategories"]) for item in data)

    category_id = payload["id"]
    r = client.delete(f"/api/admin/categories/{category_id}")
    assert r.status_code == 200, r.text


def test_legacy_category_identifier_is_stable():
    assert _subcategory_id({"name": "Bracelets"}) == "bracelets"
    assert _subcategory_id({"name": "Bracelets", "slug": "legacy-bracelets"}) == "legacy-bracelets"
    assert _subcategory_id({"name": "Bracelets", "id": "stored-id"}) == "stored-id"


def test_legacy_categories_can_be_updated_and_disabled(client):
    legacy_names = ["Jewellery", "Crystal Jewellery", "Hair Clips", "Hair Bands", "Scrunchies", "Other Accessories"]

    listing = client.get("/api/admin/categories")
    assert listing.status_code == 200, listing.text
    women = next(group for group in listing.json() if group["group"] == "women")
    legacy = {item["name"]: item for item in women["subcategories"] if item["name"] in legacy_names}
    assert set(legacy) == set(legacy_names)
    second_listing = client.get("/api/admin/categories")
    second_women = next(group for group in second_listing.json() if group["group"] == "women")
    second_legacy = {item["name"]: item for item in second_women["subcategories"] if item["name"] in legacy_names}

    for name in legacy_names:
        category = legacy[name]
        assert category["id"] and category["id"] == second_legacy[name]["id"]
        update = client.put(
            f"/api/admin/categories/{category['id']}",
            json={"name": name, "group": "women", "slug": category["slug"], "active": False},
        )
        assert update.status_code == 200, f"{name}: {update.text}"
        assert update.json()["active"] is False

        restore = client.put(
            f"/api/admin/categories/{category['id']}",
            json={"name": name, "group": "women", "slug": category["slug"], "active": True},
        )
        assert restore.status_code == 200, f"{name}: {restore.text}"


def test_dynamic_category_is_valid_for_product_create_update_and_rejects_wrong_categories(client):
    suffix = uuid.uuid4().hex[:8]
    women_name = f"Dynamic Women {suffix}"
    second_name = f"Dynamic Women Second {suffix}"
    kids_name = f"Dynamic Kids {suffix}"
    created_categories = []
    product_id = None

    try:
        for name, group in [(women_name, "women"), (second_name, "women"), (kids_name, "kids")]:
            response = client.post("/api/admin/categories", json={"name": name, "group": group, "active": True})
            assert response.status_code == 200, response.text
            created_categories.append(response.json())

        women_category, second_category, kids_category = created_categories
        legacy_product = {
            "name": f"Legacy Category Product {suffix}", "group": "women", "category": "Jewellery",
            "mrp": 100, "selling_price": 90, "stock": 2,
        }
        legacy_response = client.post("/api/admin/products", json=legacy_product)
        assert legacy_response.status_code == 200, legacy_response.text
        legacy_product_id = legacy_response.json()["id"]
        assert legacy_response.json()["category"] == "Jewellery"
        assert legacy_response.json()["category_id"]
        assert client.delete(f"/api/admin/products/{legacy_product_id}").status_code == 200

        product = {
            "name": f"Dynamic Product {suffix}", "group": "women", "category": women_category["id"],
            "category_id": women_category["id"], "mrp": 100, "selling_price": 90, "stock": 2,
        }
        response = client.post("/api/admin/products", json=product)
        assert response.status_code == 200, response.text
        saved = response.json()
        product_id = saved["id"]
        assert saved["category"] == women_name
        assert saved["category_id"] == women_category["id"]

        response = client.put(f"/api/admin/products/{product_id}", json={**product, "category": second_category["id"], "category_id": second_category["id"]})
        assert response.status_code == 200, response.text
        assert response.json()["category"] == second_name

        blocked_delete = client.delete(f"/api/admin/categories/{second_category['id']}")
        assert blocked_delete.status_code == 409

        invalid = client.post("/api/admin/products", json={**product, "category": "does-not-exist", "category_id": "does-not-exist"})
        assert invalid.status_code == 422

        wrong_section = client.post("/api/admin/products", json={**product, "category": kids_category["id"], "category_id": kids_category["id"]})
        assert wrong_section.status_code == 422
    finally:
        if product_id:
            client.delete(f"/api/admin/products/{product_id}")
        for category in created_categories:
            client.delete(f"/api/admin/categories/{category['id']}")
