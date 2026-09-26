"""Viaura object storage helper for image uploads."""

import os
import logging
from pathlib import Path

import requests
import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url

logger = logging.getLogger("Viaura.storage")

STORAGE_BASE = (
    (os.environ.get("INTEGRATION_PROXY_URL") or "").strip()
    or "https://integrations.emergentagent.com"
)
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

APP_NAME = "Viaura"

STORAGE_MODE = os.environ.get("STORAGE_MODE", "emergent").strip().lower()

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET")

if (
    CLOUDINARY_CLOUD_NAME
    and CLOUDINARY_API_KEY
    and CLOUDINARY_API_SECRET
):
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )

LOCAL_STORAGE_DIR = Path(
    os.environ.get(
        "LOCAL_STORAGE_DIR",
        Path(__file__).parent / "uploads",
    )
)

MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
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
        LOCAL_STORAGE_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )
        return "local"

    if STORAGE_MODE == "cloudinary":
        if not (
            CLOUDINARY_CLOUD_NAME
            and CLOUDINARY_API_KEY
            and CLOUDINARY_API_SECRET
        ):
            raise RuntimeError(
                "Cloudinary credentials are not configured"
            )

        return "cloudinary"

    if _storage_key and not force:
        return _storage_key

    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": EMERGENT_KEY},
        timeout=30,
    )
    resp.raise_for_status()

    _storage_key = resp.json()["storage_key"]

    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Store an uploaded object."""

    # Local filesystem storage
    if STORAGE_MODE == "local":
        target = _local_path(path)
        target.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        target.write_bytes(data)

        return {
            "path": path,
            "size": len(data),
        }

    # Cloudinary storage
    if STORAGE_MODE == "cloudinary":
        init_storage()

        public_id = str(
            Path(path).with_suffix("")
        ).replace("\\", "/")

        resource_type = (
            "video"
            if content_type.startswith("video/")
            else "image"
        )

        result = cloudinary.uploader.upload(
            data,
            public_id=public_id,
            resource_type=resource_type,
            overwrite=True,
            invalidate=True,
        )

        return {
            "path": path,
            "size": len(data),
            "url": result.get("secure_url"),
        }

    # Existing Emergent object storage
    key = init_storage()

    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={
            "X-Storage-Key": key,
            "Content-Type": content_type,
        },
        data=data,
        timeout=120,
    )

    if resp.status_code == 404:
        key = init_storage(force=True)

        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={
                "X-Storage-Key": key,
                "Content-Type": content_type,
            },
            data=data,
            timeout=120,
        )

    resp.raise_for_status()

    return resp.json()


def get_object(path: str):
    """Retrieve an object from storage."""

    # Local filesystem storage
    if STORAGE_MODE == "local":
        target = _local_path(path)

        if not target.exists():
            namespace, separator, suffix = path.partition("/")

            legacy_namespaces = {
                "vihaanora": "javehouse",
                "viaura": "javehouse",
            }

            legacy_namespace = legacy_namespaces.get(
                namespace.lower()
            )

            if separator and legacy_namespace:
                legacy_target = _local_path(
                    f"{legacy_namespace}/{suffix}"
                )

                if legacy_target.exists():
                    target = legacy_target

        return (
            target.read_bytes(),
            MIME_TYPES.get(
                target.suffix.lstrip(".").lower(),
                "application/octet-stream",
            ),
        )

    # Cloudinary storage
    if STORAGE_MODE == "cloudinary":
        init_storage()

        extension = Path(path).suffix.lower()

        public_id = str(
            Path(path).with_suffix("")
        ).replace("\\", "/")

        resource_type = (
            "video"
            if extension in {".mp4", ".webm"}
            else "image"
        )

        url, _ = cloudinary_url(
            public_id,
            resource_type=resource_type,
            secure=True,
            format=(
                extension.lstrip(".")
                if extension
                else None
            ),
        )

        resp = requests.get(
            url,
            timeout=60,
        )
        resp.raise_for_status()

        return (
            resp.content,
            resp.headers.get(
                "Content-Type",
                "application/octet-stream",
            ),
        )

    # Existing Emergent object storage
    key = init_storage()

    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )

    if resp.status_code == 404:
        key = init_storage(force=True)

        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )

    resp.raise_for_status()

    return (
        resp.content,
        resp.headers.get(
            "Content-Type",
            "application/octet-stream",
        ),
    )