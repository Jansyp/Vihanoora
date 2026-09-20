"""Image and product video upload (admin) + public file serving."""
import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Response

from core import db, require_admin, now_iso
from storage import put_object, get_object, APP_NAME, MIME_TYPES

router = APIRouter(prefix="/api", tags=["files"])


@router.post("/admin/upload", dependencies=[Depends(require_admin)])
async def upload_image(file: UploadFile = File(...)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png").lower()
    image_exts = {"jpg", "jpeg", "png", "webp", "gif"}
    video_exts = {"mp4", "webm"}
    if ext not in image_exts | video_exts:
        raise HTTPException(status_code=400, detail="Only image files (jpg, png, webp, gif) or videos (mp4, webm) allowed")
    content_type = MIME_TYPES[ext]
    data = await file.read()
    max_size = 50 * 1024 * 1024 if ext in video_exts else 8 * 1024 * 1024
    if len(data) > max_size:
        limit = "50MB" if ext in video_exts else "8MB"
        kind = "Video" if ext in video_exts else "Image"
        raise HTTPException(status_code=400, detail=f"{kind} too large (max {limit})")
    path = f"{APP_NAME}/products/{uuid.uuid4().hex}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    stored = result["path"]
    await db.files.insert_one({
        "id": str(uuid.uuid4()), "storage_path": stored, "original_filename": file.filename,
        "content_type": content_type, "size": result.get("size", len(data)),
        "is_deleted": False, "created_at": now_iso(),
    })
    return {"url": f"/api/files/{stored}", "path": stored, "original_filename": file.filename,
        "content_type": content_type, "size": result.get("size", len(data)),
        "kind": "video" if ext in video_exts else "image"}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    ct = record.get("content_type") if record else "image/jpeg"
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=ct or content_type,
                    headers={"Cache-Control": "public, max-age=31536000"})
