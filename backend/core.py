"""Core: db connection, auth helpers, pricing utils, shared dependencies."""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient

# ---- Mongo ----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"


def cookie_security_settings() -> tuple[bool, str]:
    override = os.environ.get("COOKIE_SECURE")
    if override is not None:
        secure = override.lower() in {"1", "true", "yes", "on"}
        return secure, "none" if secure else "lax"

    env = os.environ.get("APP_ENV", "development").lower()
    if env in {"development", "local", "test"}:
        return False, "lax"
    return True, "none"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# ---- Password hashing ----
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---- JWT ----
def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token: str, refresh_token: str):
    secure, samesite = cookie_security_settings()
    response.set_cookie("access_token", access_token, httponly=True, secure=secure,
                        samesite=samesite, max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=secure,
                        samesite=samesite, max_age=604800, path="/")


async def _get_token(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token


async def _resolve_session_token(request: Request):
    """Emergent Google auth session token from cookie or Bearer header."""
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password_hash": 0})
    return user


async def get_current_user(request: Request) -> dict:
    token = await _get_token(request)
    if token:
        try:
            payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                if user:
                    return user
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass
    # Fallback: Emergent Google session token
    user = await _resolve_session_token(request)
    if user:
        return user
    raise HTTPException(status_code=401, detail="Not authenticated")


async def get_optional_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---- Pricing ----
def is_flash_active(product: dict) -> bool:
    fp = product.get("flash_price")
    fs = product.get("flash_start")
    fe = product.get("flash_end")
    if fp is None or fs is None or fe is None:
        return False
    now = datetime.now(timezone.utc).isoformat()
    return fs <= now <= fe and fp < product.get("mrp", 0)


def effective_price(product: dict) -> float:
    if is_flash_active(product):
        return float(product["flash_price"])
    return float(product.get("selling_price", product.get("mrp", 0)))


def discount_percent(mrp: float, price: float) -> int:
    if not mrp or price >= mrp:
        return 0
    return round((mrp - price) / mrp * 100)


def enrich_product(p: dict) -> dict:
    if not p:
        return p
    p.pop("_id", None)
    price = effective_price(p)
    mrp = float(p.get("mrp", 0))
    p["effective_price"] = price
    p["discount_percent"] = discount_percent(mrp, price)
    p["flash_active"] = is_flash_active(p)
    stock = int(p.get("stock", 0))
    if stock <= 0:
        p["stock_state"] = "Out of Stock"
    elif stock <= int(p.get("low_stock_threshold", 5)):
        p["stock_state"] = f"Only {stock} left"
    else:
        p["stock_state"] = "In Stock"
    return p


def enrich_combo(c: dict, product_map: dict) -> dict:
    if not c:
        return c
    c.pop("_id", None)
    original = float(c.get("original_price", 0))
    combo_price = float(c.get("combo_price", 0))
    c["discount_percent"] = discount_percent(original, combo_price)
    c["savings"] = round(original - combo_price)
    c["item_count"] = len(c.get("product_ids", []))
    return c


async def next_order_number() -> str:
    year = datetime.now(timezone.utc).year
    doc = await db.counters.find_one_and_update(
        {"_id": "order"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc and doc.get("seq") else 1
    return f"JH{year}{seq:05d}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
