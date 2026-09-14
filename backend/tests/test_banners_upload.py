"""Tests for the new features: image upload + banner CRUD + public /banners."""
import io
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@javehouse.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    sess = requests.Session()
    r = sess.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return sess


def _tiny_png_bytes():
    # Minimal valid 1x1 PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
        "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )


# ---------- Upload ----------
class TestUpload:
    def test_upload_requires_admin(self):
        r = requests.post(f"{API}/admin/upload",
                          files={"file": ("t.png", _tiny_png_bytes(), "image/png")})
        assert r.status_code in (401, 403)

    def test_upload_and_serve(self, admin_session):
        r = admin_session.post(
            f"{API}/admin/upload",
            files={"file": ("t.png", _tiny_png_bytes(), "image/png")},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "path" in d
        assert d["url"].startswith("/api/files/")
        # serve back
        r2 = requests.get(f"{BASE_URL}{d['url']}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")
        assert len(r2.content) > 0
        pytest.shared_upload = d

    def test_upload_rejects_non_image(self, admin_session):
        r = admin_session.post(
            f"{API}/admin/upload",
            files={"file": ("t.txt", b"hello", "text/plain")},
        )
        assert r.status_code == 400

    def test_serve_missing_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/files/javehouse/products/does-not-exist-xyz.png")
        assert r.status_code == 404


# ---------- Public banners ----------
class TestPublicBanners:
    def test_public_banners_only_active(self):
        r = requests.get(f"{API}/banners")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for b in data:
            assert b["active"] is True
            assert "_id" not in b
            assert "title" in b and "cta_text" in b and "cta_link" in b


# ---------- Admin Banner CRUD ----------
class TestBannerCRUD:
    def test_create_update_toggle_delete(self, admin_session):
        title = f"TEST_Banner_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": title, "subtitle": "sub", "image": "",
            "cta_text": "Shop", "cta_link": "/trending", "active": True, "order": 99,
        }
        r = admin_session.post(f"{API}/admin/banners", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["title"] == title and b["active"] is True
        bid = b["id"]

        # appears in admin list
        r2 = admin_session.get(f"{API}/admin/banners")
        assert r2.status_code == 200
        assert any(x["id"] == bid for x in r2.json())

        # appears in public /banners (active)
        r3 = requests.get(f"{API}/banners")
        assert any(x["id"] == bid for x in r3.json())

        # update: hide
        payload_hidden = {**payload, "active": False, "subtitle": "hidden now"}
        r4 = admin_session.put(f"{API}/admin/banners/{bid}", json=payload_hidden)
        assert r4.status_code == 200
        assert r4.json()["active"] is False
        assert r4.json()["subtitle"] == "hidden now"

        # public should NOT include hidden
        r5 = requests.get(f"{API}/banners")
        assert not any(x["id"] == bid for x in r5.json())

        # delete
        r6 = admin_session.delete(f"{API}/admin/banners/{bid}")
        assert r6.status_code == 200
        r7 = admin_session.get(f"{API}/admin/banners")
        assert not any(x["id"] == bid for x in r7.json())

    def test_banner_requires_admin(self):
        r = requests.post(f"{API}/admin/banners", json={"title": "x"})
        assert r.status_code in (401, 403)
