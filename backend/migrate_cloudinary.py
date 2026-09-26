import os
from pathlib import Path

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv


# Load your existing backend .env
load_dotenv()

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET")

if not all([
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
]):
    raise RuntimeError(
        "Cloudinary credentials are missing from backend/.env"
    )

cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
    secure=True,
)

PRODUCTS_DIR = Path(
    r"C:\Projects\Jave-house-shop\backend\uploads\Viaura\products"
)

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
}

files = sorted(
    [
        f
        for f in PRODUCTS_DIR.iterdir()
        if f.is_file()
        and f.suffix.lower() in IMAGE_EXTENSIONS
    ]
)

print(f"Found {len(files)} product images.")
print("-" * 60)

success = 0
failed = 0

for index, file_path in enumerate(files, start=1):
    relative_name = file_path.stem

    # Preserve the same logical path used by the existing API.
    # Example:
    # Viaura/products/abc123.png
    #
    # Cloudinary public_id does not include the extension.
    public_id = f"Viaura/products/{relative_name}"

    print(
        f"[{index}/{len(files)}] Uploading {file_path.name}..."
    )

    try:
        result = cloudinary.uploader.upload(
            str(file_path),
            public_id=public_id,
            resource_type="image",
            overwrite=True,
            invalidate=True,
        )

        print(
            f"    OK: {result.get('secure_url')}"
        )
        success += 1

    except Exception as exc:
        print(
            f"    FAILED: {file_path.name}"
        )
        print(
            f"    {exc}"
        )
        failed += 1

print("-" * 60)
print("Migration finished.")
print(f"Successful: {success}")
print(f"Failed:     {failed}")
print(f"Total:      {len(files)}")