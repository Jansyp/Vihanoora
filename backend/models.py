"""Pydantic request/response models."""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid

LEGACY_PRODUCT_CATEGORY = "Uncategorized"


def gen_id() -> str:
    return str(uuid.uuid4())


# ---- Auth ----
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionInput(BaseModel):
    session_id: str


# ---- Products ----
class ProductInput(BaseModel):
    name: str
    slug: Optional[str] = None
    sku: Optional[str] = None
    description: str = ""
    details: str = ""
    material: str = ""
    group: str  # women / kids / gifts
    category: str = ""  # category ID; legacy names/slugs are accepted during migration
    category_id: Optional[str] = None
    mrp: float
    selling_price: float
    stock: int = 0
    low_stock_threshold: int = 5
    images: List[str] = []
    product_video_url: Optional[str] = None
    product_video_filename: Optional[str] = None
    colors: List[str] = []
    color_images: Dict[str, List[str]] = {}
    weight: str = ""
    dimensions: str = ""
    trending: bool = False
    best_seller: bool = False
    new_arrival: bool = False
    featured: bool = False
    giftable: bool = False
    active: bool = True
    model_3d: Optional[str] = None
    flash_price: Optional[float] = None
    flash_start: Optional[str] = None
    flash_end: Optional[str] = None


class CategoryInput(BaseModel):
    name: str
    slug: Optional[str] = None
    group: str
    icon: str = ""
    order: int = 0
    active: bool = True
    subcategories: List[Dict[str, Any]] = []


class ComboInput(BaseModel):
    name: str
    slug: Optional[str] = None
    description: str = ""
    images: List[str] = []
    product_ids: List[str] = []
    original_price: float
    combo_price: float
    stock: int = 0
    active: bool = True
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CouponInput(BaseModel):
    code: str
    type: str  # percentage / flat
    value: float
    min_order: float = 0
    max_discount: Optional[float] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    total_usage_limit: Optional[int] = None
    per_customer_limit: Optional[int] = None
    active: bool = True


class CartItemIn(BaseModel):
    product_id: str
    qty: int = 1
    variant: Optional[str] = None
    combo: bool = False


class ValidateCartInput(BaseModel):
    items: List[CartItemIn]
    coupon_code: Optional[str] = None
    email: Optional[str] = None


class CustomerDetails(BaseModel):
    name: str
    mobile: str
    email: EmailStr
    address: str
    city: str
    state: str
    pin: str


class CreateOrderInput(BaseModel):
    items: List[CartItemIn]
    customer: CustomerDetails
    coupon_code: Optional[str] = None


class VerifyPaymentInput(BaseModel):
    order_id: str


class ShippingInput(BaseModel):
    order_id: str
    courier: str
    awb: str
    tracking_url: str = ""
    shipping_date: Optional[str] = None
    expected_delivery: Optional[str] = None


class OrderStatusInput(BaseModel):
    order_status: str


class TrackInput(BaseModel):
    order_number: str
    contact: str  # mobile or email


class ReviewInput(BaseModel):
    product_id: str
    name: str
    rating: int
    comment: str = ""


class AddressInput(BaseModel):
    name: str
    mobile: str
    address: str
    city: str
    state: str
    pin: str
    is_default: bool = False


class SettingsInput(BaseModel):
    store_name: Optional[str] = None
    tagline: Optional[str] = None
    logo: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram_url: Optional[str] = None
    delivery_charge: Optional[float] = None
    free_shipping_threshold: Optional[float] = None
    currency: Optional[str] = None
    gst_percent: Optional[float] = None
    sender_business_name: Optional[str] = None
    sender_name: Optional[str] = None
    sender_address: Optional[str] = None
    sender_city: Optional[str] = None
    sender_state: Optional[str] = None
    sender_pin: Optional[str] = None
    sender_country: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_email: Optional[str] = None
    announcement_bar_text: Optional[str] = None
    announcement_enabled: Optional[bool] = None
    home_sections: Optional[List[Dict[str, Any]]] = None


class AnnouncementInput(BaseModel):
    text: str
    active: bool = True
    start: Optional[str] = None
    end: Optional[str] = None
    order: int = 0


class BannerInput(BaseModel):
    title: str
    subtitle: str = ""
    image: str = ""
    cta_text: str = "Shop Now"
    cta_link: str = "/offer-zone"
    active: bool = True
    order: int = 0
