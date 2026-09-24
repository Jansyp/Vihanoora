"""Emergent object storage helper for image uploads."""
import os
import logging
from pathlib import Path
import requests

logger = logging.getLogger("Viaura.storage")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "Viaura"
STORAGE_MODE = os.environ.get("STORAGE_MODE", "emergent").strip().lower()
LOCAL_STORAGE_DIR = Path(os.environ.get("LOCAL_STORAGE_DIR", Path(__file__).parent / "uploads"))

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
    "mp4": "video/mp4", "webm": "video/webm",
}

_storage_key = None


def _local_path(path: str) -> Path:
    """Resolve an object path safely inside the local upload directory."""
    root = LOCAL_STORAGE_DIR.resolve()
    target = (root / path).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Invalid storage path")
    return target


def init_storage(force: bool = False):
    global _storage_key
    if STORAGE_MODE == "local":
        LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        return "local"
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if STORAGE_MODE == "local":
        target = _local_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"path": path, "size": len(data)}

    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    if STORAGE_MODE == "local":
        target = _local_path(path)
        if not target.exists():
            namespace, separator, suffix = path.partition("/")
            legacy_namespaces = {"vihaanora": "javehouse", "viaura": "javehouse"}
            legacy_namespace = legacy_namespaces.get(namespace.lower())
            if separator and legacy_namespace:
                legacy_target = _local_path(f"{legacy_namespace}/{suffix}")
                if legacy_target.exists():
                    target = legacy_target
        return target.read_bytes(), MIME_TYPES.get(target.suffix.lstrip(".").lower(), "application/octet-stream")

    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
