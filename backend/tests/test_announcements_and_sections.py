"""Tests for Announcement CRUD, public window filtering, and Homepage Sections persistence."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = "admin@vihaanora.com"
ADMIN_PASS = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def cleanup_ids():
    ids = []
    yield ids
    # Best-effort cleanup done inside tests too


# ---------- Announcements ----------

def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def test_announcements_full_crud_and_window(admin_session, cleanup_ids):
    now = datetime.now(timezone.utc)

    # Active in-window
    r = admin_session.post(f"{BASE_URL}/api/admin/announcements", json={
        "text": "TEST_LIVE_active_now", "active": True,
        "start": _iso(now - timedelta(hours=1)),
        "end": _iso(now + timedelta(hours=2)),
        "order": 1,
    })
    assert r.status_code == 200, r.text
    live = r.json()
    assert live["text"] == "TEST_LIVE_active_now"
    assert "id" in live
    cleanup_ids.append(live["id"])

    # Future scheduled
    r = admin_session.post(f"{BASE_URL}/api/admin/announcements", json={
        "text": "TEST_SCHEDULED_future", "active": True,
        "start": _iso(now + timedelta(days=1)),
        "end": _iso(now + timedelta(days=2)),
        "order": 2,
    })
    assert r.status_code == 200
    sched = r.json()
    cleanup_ids.append(sched["id"])

    # Expired
    r = admin_session.post(f"{BASE_URL}/api/admin/announcements", json={
        "text": "TEST_EXPIRED_past", "active": True,
        "start": _iso(now - timedelta(days=2)),
        "end": _iso(now - timedelta(days=1)),
        "order": 3,
    })
    assert r.status_code == 200
    exp = r.json()
    cleanup_ids.append(exp["id"])

    # Admin list contains all three
    r = admin_session.get(f"{BASE_URL}/api/admin/announcements")
    assert r.status_code == 200
    admin_texts = {a["text"] for a in r.json()}
    assert {"TEST_LIVE_active_now", "TEST_SCHEDULED_future", "TEST_EXPIRED_past"}.issubset(admin_texts)

    # Public endpoint: only live one appears
    r = requests.get(f"{BASE_URL}/api/announcements", timeout=15)
    assert r.status_code == 200
    pub_texts = [a["text"] for a in r.json()]
    assert "TEST_LIVE_active_now" in pub_texts
    assert "TEST_SCHEDULED_future" not in pub_texts
    assert "TEST_EXPIRED_past" not in pub_texts

    # PUT update: deactivate live one
    r = admin_session.put(f"{BASE_URL}/api/admin/announcements/{live['id']}", json={
        "text": "TEST_LIVE_active_now", "active": False,
        "start": _iso(now - timedelta(hours=1)),
        "end": _iso(now + timedelta(hours=2)),
        "order": 1,
    })
    assert r.status_code == 200
    assert r.json()["active"] is False

    # Public should no longer contain it (may fall back to legacy or be empty of TEST_)
    r = requests.get(f"{BASE_URL}/api/announcements", timeout=15)
    assert r.status_code == 200
    pub_texts = [a["text"] for a in r.json()]
    assert "TEST_LIVE_active_now" not in pub_texts

    # DELETE all three
    for _id in [live["id"], sched["id"], exp["id"]]:
        r = admin_session.delete(f"{BASE_URL}/api/admin/announcements/{_id}")
        assert r.status_code == 200
        assert r.json().get("deleted") is True

    # Confirm not in admin list
    r = admin_session.get(f"{BASE_URL}/api/admin/announcements")
    remaining = {a["text"] for a in r.json()}
    assert "TEST_LIVE_active_now" not in remaining
    assert "TEST_SCHEDULED_future" not in remaining
    assert "TEST_EXPIRED_past" not in remaining


# ---------- Homepage Sections ----------

DEFAULT_SECTIONS = [
    {"key": "trending", "label": "Trending on Instagram", "enabled": True, "order": 1},
    {"key": "best_sellers", "label": "Best Sellers", "enabled": True, "order": 2},
    {"key": "offer_banner", "label": "Offer Zone Banner", "enabled": True, "order": 3},
    {"key": "new_arrivals", "label": "New Arrivals", "enabled": True, "order": 4},
    {"key": "gift_picks", "label": "Gift Picks", "enabled": True, "order": 5},
    {"key": "combos", "label": "Combo Offers", "enabled": True, "order": 6},
    {"key": "instagram", "label": "Instagram Gallery", "enabled": True, "order": 7},
    {"key": "reviews", "label": "Customer Reviews", "enabled": True, "order": 8},
    {"key": "newsletter", "label": "Newsletter", "enabled": True, "order": 9},
]


def test_home_sections_toggle_and_reorder_persistence(admin_session):
    # Read original
    r = requests.get(f"{BASE_URL}/api/settings", timeout=15)
    assert r.status_code == 200
    original = r.json().get("home_sections") or DEFAULT_SECTIONS

    # Build modified: disable gift_picks, bump combos to order 1
    modified = []
    for sec in DEFAULT_SECTIONS:
        s = dict(sec)
        if s["key"] == "gift_picks":
            s["enabled"] = False
        if s["key"] == "combos":
            s["order"] = 1
        modified.append(s)

    r = admin_session.put(f"{BASE_URL}/api/admin/settings", json={"home_sections": modified})
    assert r.status_code == 200, r.text

    # GET public settings and verify
    r = requests.get(f"{BASE_URL}/api/settings", timeout=15)
    assert r.status_code == 200
    hs = {s["key"]: s for s in r.json()["home_sections"]}
    assert hs["gift_picks"]["enabled"] is False
    assert hs["combos"]["order"] == 1
    assert hs["best_sellers"]["enabled"] is True

    # RESTORE to defaults (all enabled, original order)
    r = admin_session.put(f"{BASE_URL}/api/admin/settings", json={"home_sections": DEFAULT_SECTIONS})
    assert r.status_code == 200

    r = requests.get(f"{BASE_URL}/api/settings", timeout=15)
    hs = {s["key"]: s for s in r.json()["home_sections"]}
    for s in DEFAULT_SECTIONS:
        assert hs[s["key"]]["enabled"] is True
        assert hs[s["key"]]["order"] == s["order"]
