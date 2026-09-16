"""Vihaanora backend API tests.

Covers: catalog, offer zone, combos, categories, settings,
cart validation, coupons, guest order + mock payment, tracking,
webhook idempotency, auth (register/login/me/logout), admin RBAC,
admin CRUD (products/coupons/combos/settings), admin order flow.
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vihaanora.com"
ADMIN_PASSWORD = "Admin@123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_session():
    sess = requests.Session()
    r = sess.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "admin"
    return sess


@pytest.fixture(scope="function")
def a_product():
    """Fetch a fresh seeded product each time to avoid parallel-worker session state issues."""
    r = requests.get(f"{API}/products", params={"limit": 50})
    assert r.status_code == 200
    items = r.json()["items"]
    # exclude any admin-test-created products which may be deleted mid-test
    items = [p for p in items if not p.get("name", "").startswith("TEST_")]
    # pick product with stock and discount, else first
    prod = next((p for p in items if p["stock"] > 5 and p["discount_percent"] > 0), None)
    if prod is None:
        prod = next((p for p in items if p["stock"] > 5), items[0])
    # sanity check it exists
    check = requests.get(f"{API}/products/{prod['id']}")
    assert check.status_code == 200, f"picked product {prod['id']} not resolvable"
    return prod


# ---------------- Catalog ----------------
class TestCatalog:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200

    def test_list_products_filters(self, s):
        r = s.get(f"{API}/products", params={"group": "women", "limit": 50})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        for p in data["items"]:
            assert p["group"] == "women"
            assert "effective_price" in p and "discount_percent" in p and "stock_state" in p

    def test_min_discount_filter(self, s):
        r = s.get(f"{API}/products", params={"min_discount": 20, "limit": 50})
        assert r.status_code == 200
        for p in r.json()["items"]:
            assert p["discount_percent"] >= 20

    def test_sort_price_asc(self, s):
        r = s.get(f"{API}/products", params={"sort": "price_asc", "limit": 10})
        prices = [p["selling_price"] for p in r.json()["items"]]
        assert prices == sorted(prices)

    def test_product_detail(self, s, a_product):
        r = s.get(f"{API}/products/{a_product['slug']}")
        assert r.status_code == 200
        data = r.json()
        assert data["product"]["id"] == a_product["id"]
        assert "related" in data and "frequently_bought" in data and "reviews" in data

    def test_add_review_recomputes_rating(self, s, a_product):
        pid = a_product["id"]
        body = {"product_id": pid, "name": "TEST_Reviewer", "rating": 5, "comment": "TEST review"}
        r = s.post(f"{API}/products/{pid}/reviews", json=body)
        assert r.status_code == 200, r.text
        # verify persisted on product detail
        r2 = s.get(f"{API}/products/{pid}")
        assert r2.status_code == 200
        prod = r2.json()["product"]
        assert prod["review_count"] >= 1
        assert 1 <= prod["rating"] <= 5

    def test_offer_zone(self, s):
        r = s.get(f"{API}/offer-zone", params={"min_discount": 10})
        assert r.status_code == 200
        data = r.json()
        assert data["max_discount"] >= 10
        for p in data["items"]:
            assert p["discount_percent"] >= 10

    def test_combos(self, s):
        r = s.get(f"{API}/combos")
        assert r.status_code == 200
        combos = r.json()
        assert len(combos) >= 1
        for c in combos:
            assert "discount_percent" in c and "savings" in c
            assert c["savings"] >= 0
        # detail
        slug = combos[0]["slug"]
        r2 = s.get(f"{API}/combos/{slug}")
        assert r2.status_code == 200
        assert "products" in r2.json()

    def test_categories(self, s):
        r = s.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        groups = {c["group"] for c in cats}
        assert len(groups) >= 3

    def test_settings(self, s):
        r = s.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        # delivery_charge may be transiently mutated by admin settings test in parallel
        assert data["delivery_charge"] in (50, 60, 75)
        assert "free_shipping_threshold" in data


# ---------------- Cart & Coupon ----------------
class TestCart:
    def test_validate_basic(self, s, a_product):
        body = {"items": [{"product_id": a_product["id"], "qty": 1}]}
        r = s.post(f"{API}/cart/validate", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subtotal"] > 0
        # delivery charge rule
        threshold = 999
        if d["subtotal"] >= threshold:
            assert d["delivery_charge"] == 0
        else:
            assert d["delivery_charge"] == 50
        assert d["grand_total"] == round(d["subtotal"] + d["delivery_charge"] - d["coupon_discount"], 2)

    def test_coupon_welcome10_valid(self, s):
        # need subtotal >= 499. Grab high-price product
        r = s.get(f"{API}/products", params={"sort": "price_desc", "limit": 1})
        prod = r.json()["items"][0]
        body = {"items": [{"product_id": prod["id"], "qty": 1}],
                "coupon_code": "WELCOME10", "email": "test_cart@example.com"}
        r2 = s.post(f"{API}/cart/validate", json=body)
        assert r2.status_code == 200
        d = r2.json()
        if d["subtotal"] >= 499:
            assert d["coupon_code"] == "WELCOME10"
            assert d["coupon_discount"] > 0
            assert d["coupon_discount"] <= 150  # max cap
            assert d["coupon_error"] is None

    def test_coupon_invalid(self, s, a_product):
        body = {"items": [{"product_id": a_product["id"], "qty": 1}],
                "coupon_code": "BOGUSXYZ"}
        r = s.post(f"{API}/cart/validate", json=body)
        assert r.status_code == 200
        d = r.json()
        assert d["coupon_error"] is not None
        assert d["coupon_discount"] == 0

    def test_coupon_min_order_not_met(self, s):
        # cheapest product
        r = s.get(f"{API}/products", params={"sort": "price_asc", "limit": 1})
        prod = r.json()["items"][0]
        body = {"items": [{"product_id": prod["id"], "qty": 1}],
                "coupon_code": "FESTIVE20"}  # min 1499
        r2 = s.post(f"{API}/cart/validate", json=body)
        assert r2.status_code == 200
        d = r2.json()
        if d["subtotal"] < 1499:
            assert d["coupon_error"] is not None
            assert "Minimum" in d["coupon_error"] or "minimum" in d["coupon_error"].lower()


# ---------------- Guest order + mock payment ----------------
class TestOrderFlow:
    def test_guest_order_and_verify(self, s, a_product):
        body = {
            "items": [{"product_id": a_product["id"], "qty": 1}],
            "customer": {
                "name": "TEST Buyer",
                "mobile": "9999999999",
                "email": "test_buyer@example.com",
                "address": "1 Test St",
                "city": "Mumbai",
                "state": "MH",
                "pin": "400001",
            },
        }
        r = s.post(f"{API}/orders", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["payment_mode"] == "mock"
        order = d["order"]
        assert order["order_number"].startswith("JH2026")
        assert order["payment_status"] == "PENDING"
        assert order["order_status"] == "Payment Pending"
        # get stock before verify
        pre = s.get(f"{API}/products/{a_product['id']}").json()["product"]
        pre_stock = pre["stock"]
        # verify (mock)
        r2 = s.post(f"{API}/payments/verify", json={"order_id": order["id"]})
        assert r2.status_code == 200, r2.text
        upd = r2.json()["order"]
        assert upd["payment_status"] == "PAID"
        assert upd["order_status"] == "Paid"
        # stock decremented
        post = s.get(f"{API}/products/{a_product['id']}").json()["product"]
        assert post["stock"] == pre_stock - 1
        # track order - correct email
        r3 = s.get(f"{API}/orders/track", params={"order_number": order["order_number"],
                                                   "contact": "test_buyer@example.com"})
        assert r3.status_code == 200
        # track order - mobile also works
        r4 = s.get(f"{API}/orders/track", params={"order_number": order["order_number"],
                                                   "contact": "9999999999"})
        assert r4.status_code == 200
        # track - wrong contact
        r5 = s.get(f"{API}/orders/track", params={"order_number": order["order_number"],
                                                   "contact": "wrong@nope.com"})
        assert r5.status_code == 403
        # save order id for other tests
        pytest.shared_order = order

    def test_out_of_stock_protection(self, s, a_product):
        body = {
            "items": [{"product_id": a_product["id"], "qty": 99999}],
            "customer": {
                "name": "TEST OOS", "mobile": "9000000000", "email": "oos@x.com",
                "address": "x", "city": "x", "state": "x", "pin": "111111",
            },
        }
        r = s.post(f"{API}/orders", json=body)
        assert r.status_code == 400

    def test_webhook_idempotency(self, s):
        # Since RAZORPAY_WEBHOOK_SECRET is unset, signature check is skipped
        event_id = f"evt_test_{uuid.uuid4().hex[:8]}"
        payload = {"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_x", "order_id": "rp_none"}}}}
        headers = {"X-Razorpay-Event-Id": event_id, "Content-Type": "application/json"}
        r1 = s.post(f"{API}/payments/webhook", json=payload, headers=headers)
        assert r1.status_code == 200
        assert r1.json()["status"] in ("processed", "duplicate_ignored")
        r2 = s.post(f"{API}/payments/webhook", json=payload, headers=headers)
        assert r2.status_code == 200
        assert r2.json()["status"] == "duplicate_ignored"


# ---------------- Auth ----------------
class TestAuth:
    def test_register_login_me_logout(self):
        sess = requests.Session()
        email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
        r = sess.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "password": "pass1234"})
        assert r.status_code == 200, r.text
        # me via cookie
        r2 = sess.get(f"{API}/auth/me")
        assert r2.status_code == 200
        assert r2.json()["email"] == email
        # logout clears cookie
        r3 = sess.post(f"{API}/auth/logout")
        assert r3.status_code == 200
        r4 = sess.get(f"{API}/auth/me")
        assert r4.status_code == 401
        # login again
        r5 = sess.post(f"{API}/auth/login", json={"email": email, "password": "pass1234"})
        assert r5.status_code == 200
        r6 = sess.get(f"{API}/auth/me")
        assert r6.status_code == 200

    def test_admin_login(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_admin_rbac_rejects_anon(self):
        r = requests.get(f"{API}/admin/dashboard")
        assert r.status_code in (401, 403)
        r2 = requests.get(f"{API}/admin/products")
        assert r2.status_code in (401, 403)

    def test_admin_rbac_rejects_customer(self):
        sess = requests.Session()
        email = f"test_cust_{uuid.uuid4().hex[:8]}@example.com"
        sess.post(f"{API}/auth/register", json={"name": "C", "email": email, "password": "pass1234"})
        r = sess.get(f"{API}/admin/dashboard")
        assert r.status_code == 403


# ---------------- Admin CRUD ----------------
class TestAdmin:
    def test_dashboard(self, admin_session):
        r = admin_session.get(f"{API}/admin/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ("total_products", "total_orders", "total_revenue", "status_counts",
                  "low_stock", "top_sellers"):
            assert k in d

    def test_product_crud_and_stock(self, admin_session):
        sku = f"TEST-SKU-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "name": "TEST_Product",
            "sku": sku,
            "description": "test",
            "group": "gifts",
            "mrp": 500,
            "selling_price": 400,
            "stock": 10,
            "images": ["https://example.com/x.jpg"],
        }
        r = admin_session.post(f"{API}/admin/products", json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # dup SKU rejected
        r_dup = admin_session.post(f"{API}/admin/products", json=payload)
        assert r_dup.status_code == 400
        # update
        payload["selling_price"] = 350
        r_u = admin_session.put(f"{API}/admin/products/{pid}", json=payload)
        assert r_u.status_code == 200
        assert r_u.json()["selling_price"] == 350
        # adjust stock
        r_s = admin_session.patch(f"{API}/admin/products/{pid}/stock", params={"set_value": 25})
        assert r_s.status_code == 200
        assert r_s.json()["stock"] == 25
        # delete
        r_d = admin_session.delete(f"{API}/admin/products/{pid}")
        assert r_d.status_code == 200

    def test_admin_orders_list_and_flow(self, admin_session):
        # get orders list
        r = admin_session.get(f"{API}/admin/orders")
        assert r.status_code == 200
        orders = r.json()
        assert len(orders) >= 1
        paid = [o for o in orders if o["payment_status"] == "PAID"]
        assert paid, "expected at least one paid order from previous test"
        oid = paid[0]["id"]
        # transition status
        r2 = admin_session.put(f"{API}/admin/orders/{oid}/status",
                               json={"order_status": "Processing"})
        assert r2.status_code == 200
        assert r2.json()["order_status"] == "Processing"
        # add shipping (auto Shipped)
        r3 = admin_session.put(f"{API}/admin/orders/{oid}/shipping",
                               json={"order_id": oid, "courier": "Bluedart",
                                     "awb": "AWB123456", "tracking_url": "https://t/AWB"})
        assert r3.status_code == 200, r3.text
        upd = r3.json()
        assert upd["order_status"] == "Shipped"
        assert upd["shipping"]["awb"] == "AWB123456"

    def test_admin_coupon_crud(self, admin_session):
        code = f"TESTCPN{uuid.uuid4().hex[:4].upper()}"
        payload = {"code": code, "type": "percentage", "value": 15, "min_order": 200}
        r = admin_session.post(f"{API}/admin/coupons", json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        r_u = admin_session.put(f"{API}/admin/coupons/{cid}",
                                json={**payload, "value": 20})
        assert r_u.status_code == 200
        assert r_u.json()["value"] == 20
        admin_session.delete(f"{API}/admin/coupons/{cid}")

    def test_admin_combo_crud(self, admin_session):
        r = admin_session.post(f"{API}/admin/combos", json={
            "name": "TEST_Combo", "description": "x", "product_ids": [],
            "original_price": 500, "combo_price": 400, "stock": 10, "active": True,
        })
        assert r.status_code == 200
        cid = r.json()["id"]
        admin_session.delete(f"{API}/admin/combos/{cid}")

    def test_admin_settings_update_reflects_public(self, admin_session, s):
        original = s.get(f"{API}/settings").json()["delivery_charge"]
        new_val = 75 if original != 75 else 60
        r = admin_session.put(f"{API}/admin/settings", json={"delivery_charge": new_val})
        assert r.status_code == 200
        pub = s.get(f"{API}/settings").json()
        assert pub["delivery_charge"] == new_val
        # revert
        admin_session.put(f"{API}/admin/settings", json={"delivery_charge": original})
