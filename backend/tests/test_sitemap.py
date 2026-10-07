import asyncio
import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

asyncio.set_event_loop(asyncio.new_event_loop())

import server


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, length=None):
        return self.documents


class Collection:
    def __init__(self, documents):
        self.documents = documents
        self.query = None
        self.projection = None

    def find(self, query, projection):
        self.query = query
        self.projection = projection
        return Cursor(self.documents)


def test_dynamic_public_sitemap_uses_active_slugs_and_valid_xml(monkeypatch):
    products = Collection([
        {"slug": "rose-gold-chain", "active": True},
        {"slug": "inactive-item", "active": False},
        {"slug": "../admin", "active": True},
        {"slug": "", "active": True},
    ])
    combos = Collection([
        {"slug": "gift-set", "active": True},
        {"slug": "draft-set", "active": False},
    ])
    monkeypatch.setattr(server.db, "products", products)
    monkeypatch.setattr(server.db, "combos", combos)

    response = TestClient(server.app).get("/sitemap.xml")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    root = ET.fromstring(response.content)
    locs = [node.text for node in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert "https://vihaanora.com/product/rose-gold-chain" in locs
    assert "https://vihaanora.com/combo/gift-set" in locs
    assert all(url.startswith("https://vihaanora.com/") for url in locs)
    assert not any("localhost" in url or "www.vihaanora.com" in url for url in locs)
    assert not any(part in url for url in locs for part in ("/admin", "/login", "/account", "/cart", "/checkout", "/search", "/api/"))
    assert not any(url.endswith(("inactive-item", "draft-set")) or "../" in url for url in locs)
    assert products.query == {"active": True}
    assert combos.query == {"active": True}


def test_public_robots_file_declares_dynamic_sitemap():
    from pathlib import Path

    robots = (Path(__file__).parents[2] / "frontend" / "public" / "robots.txt").read_text(encoding="utf-8")
    assert "User-agent: *" in robots
    assert "Allow: /" in robots
    assert "Sitemap: https://vihaanora.com/sitemap.xml" in robots
