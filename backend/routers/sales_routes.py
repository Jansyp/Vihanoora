"""Admin managed sales records. Sales are snapshots and never alter catalogue prices."""
import csv
import io
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from core import db, require_admin

router = APIRouter(prefix="/api/admin/sales", tags=["admin-sales"], dependencies=[Depends(require_admin)])
SOURCES = {"Website", "Referral", "Meesho"}


class SaleInput(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    selling_price_per_unit: float = Field(ge=0, allow_inf_nan=False)
    buying_price_per_unit: float = Field(ge=0, allow_inf_nan=False)
    platform_charges: float = Field(default=0, ge=0, allow_inf_nan=False)
    shipping_other_charges: float = Field(default=0, ge=0, allow_inf_nan=False)
    discount_adjustment: float = Field(default=0, ge=0, allow_inf_nan=False)
    selling_person_name: str = ""
    source: str
    sale_date: date
    order_reference: str = ""
    notes: str = ""

    @field_validator("quantity", mode="before")
    @classmethod
    def integer_quantity(cls, value):
        if isinstance(value, bool) or not str(value).isdigit():
            raise ValueError("Quantity must be a positive integer")
        return int(value)

    @field_validator("source")
    @classmethod
    def valid_source(cls, value):
        value = value.strip()
        if value not in SOURCES:
            raise ValueError("Choose Website, Referral, or Meesho")
        return value

    @field_validator("product_id")
    @classmethod
    def valid_product_id(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Product is required")
        return value


def _round(value):
    return round(float(value) + 1e-9, 2)


def _filters(start_date=None, end_date=None, source=None, product=None, category=None, selling_person=None, search=None):
    query = {}
    if start_date:
        query.setdefault("sale_date", {})["$gte"] = start_date
    if end_date:
        query.setdefault("sale_date", {})["$lte"] = end_date
    if source:
        query["source"] = source
    if product:
        query["product_id"] = product
    if category:
        query["category"] = {"$regex": re.escape(category), "$options": "i"}
    if selling_person:
        query["selling_person_name"] = {"$regex": re.escape(selling_person), "$options": "i"}
    if search:
        pattern = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{key: pattern} for key in ("product_name", "sku", "order_reference", "selling_person_name")]
    return query


async def _records(query):
    return await db.sales_records.find(query, {"_id": 0}).sort([("sale_date", -1), ("created_at", -1)]).to_list(10000)


def _report(records):
    def blank():
        return {"orders": 0, "quantity": 0, "sales": 0, "buying_cost": 0, "gross_profit": 0,
                "charges": 0, "net_profit": 0}
    overall, sources, products, source_products = blank(), {}, {}, {}
    for row in records:
        src = sources.setdefault(row["source"], blank())
        key = row["product_id"]
        prod = products.setdefault(key, {"product_id": key, "product_name": row["product_name"], "sku": row.get("sku", ""), **blank()})
        sp = source_products.setdefault(f'{row["source"]}:{key}', {"source": row["source"], "product_id": key, "product_name": row["product_name"], **blank()})
        for bucket in (overall, src, prod, sp):
            bucket["orders"] += 1
            bucket["quantity"] += row["quantity"]
            bucket["sales"] += row["gross_selling_amount"]
            bucket["buying_cost"] += row["total_buying_cost"]
            bucket["gross_profit"] += row["gross_profit"]
            bucket["charges"] += row["platform_charges"] + row["shipping_other_charges"] + row["discount_adjustment"]
            bucket["net_profit"] += row["net_profit"]
    for bucket in [overall, *sources.values(), *products.values(), *source_products.values()]:
        for key in ("sales", "buying_cost", "gross_profit", "charges", "net_profit"):
            bucket[key] = _round(bucket[key])
    return {"overall": overall, "sources": sources, "products": list(products.values()), "source_products": list(source_products.values())}


async def _product_snapshot(product_id):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found in catalogue")
    images = product.get("images") or []
    image = images[0] if images else product.get("image", "")
    category = product.get("category_name") or product.get("category") or ""
    if category:
        groups = await db.categories.find({"group": product.get("group")}, {"_id": 0}).to_list(100)
        for group in groups:
            match = next((item for item in group.get("subcategories", []) if category in {item.get("id"), item.get("slug"), item.get("name")}), None)
            if match:
                category = match.get("name") or category
                break
    return product, {"product_id": product["id"], "product_name": product.get("name", ""), "product_image": image,
                     "sku": product.get("sku") or "", "section": product.get("group") or "",
                     "category": category}


async def _stock_change(product_id, delta):
    if not delta:
        return
    # delta < 0 consumes stock. Website sales deliberately never call this helper.
    if delta < 0:
        result = await db.products.update_one({"id": product_id, "stock": {"$gte": -delta}}, {"$inc": {"stock": delta}})
        if not result.modified_count:
            raise HTTPException(409, "Sale quantity exceeds available stock")
    else:
        await db.products.update_one({"id": product_id}, {"$inc": {"stock": delta}})


def _inventory_delta(record):
    return -record["quantity"] if record.get("inventory_adjusted") else 0


def _financials(payload):
    sales = _round(payload.selling_price_per_unit * payload.quantity)
    cost = _round(payload.buying_price_per_unit * payload.quantity)
    gross = _round(sales - cost)
    return {"gross_selling_amount": sales, "total_buying_cost": cost, "gross_profit": gross,
            "net_profit": _round(gross - payload.platform_charges - payload.shipping_other_charges - payload.discount_adjustment)}


async def _build(payload, existing=None):
    _, snapshot = await _product_snapshot(payload.product_id)
    adjusted = payload.source in {"Meesho", "Referral"}
    now = datetime.now(timezone.utc).isoformat()
    return {**snapshot, "quantity": payload.quantity, "selling_price_per_unit": _round(payload.selling_price_per_unit),
            "buying_price_per_unit": _round(payload.buying_price_per_unit), **_financials(payload),
            "platform_charges": _round(payload.platform_charges),
            "shipping_other_charges": _round(payload.shipping_other_charges), "discount_adjustment": _round(payload.discount_adjustment),
            "selling_person_name": payload.selling_person_name,
            "source": payload.source, "sale_date": payload.sale_date.isoformat(), "order_reference": payload.order_reference,
            "notes": payload.notes, "inventory_adjusted": adjusted, "updated_at": now,
            "created_at": existing["created_at"] if existing else now}


@router.get("/report")
async def sales_report(start_date: str | None = None, end_date: str | None = None, source: str | None = None,
                       product: str | None = None, category: str | None = None, selling_person: str | None = None,
                       search: str | None = None):
    return _report(await _records(_filters(start_date, end_date, source, product, category, selling_person, search)))


@router.get("/export")
async def export_sales(start_date: str | None = None, end_date: str | None = None, source: str | None = None,
                       product: str | None = None, category: str | None = None, selling_person: str | None = None,
                       search: str | None = None):
    output = io.StringIO()
    fields = ["sale_date", "product_name", "sku", "quantity", "source", "selling_person_name", "selling_price_per_unit",
              "buying_price_per_unit", "gross_selling_amount", "total_buying_cost", "platform_charges",
              "shipping_other_charges", "gross_profit", "net_profit", "order_reference", "notes"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for row in await _records(_filters(start_date, end_date, source, product, category, selling_person, search)):
        writer.writerow({field: row.get(field, "") for field in fields})
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=sales-records.csv"})


@router.get("")
async def list_sales(start_date: str | None = None, end_date: str | None = None, source: str | None = None,
                     product: str | None = None, category: str | None = None, selling_person: str | None = None,
                     search: str | None = None):
    return await _records(_filters(start_date, end_date, source, product, category, selling_person, search))


@router.post("")
async def create_sale(payload: SaleInput):
    _, snapshot = await _product_snapshot(payload.product_id)
    record = await _build(payload)
    record["sale_id"] = str(uuid.uuid4())
    # Consume external/manual sale inventory. Website order inventory is managed by checkout.
    if record["inventory_adjusted"]:
        await _stock_change(record["product_id"], -record["quantity"])
    try:
        await db.sales_records.insert_one(record)
    except Exception:
        if record["inventory_adjusted"]:
            await _stock_change(record["product_id"], record["quantity"])
        raise
    record.pop("_id", None)
    return record


@router.get("/{sale_id}")
async def get_sale(sale_id: str):
    record = await db.sales_records.find_one({"sale_id": sale_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Sale record not found")
    return record


@router.put("/{sale_id}")
async def update_sale(sale_id: str, payload: SaleInput):
    existing = await db.sales_records.find_one({"sale_id": sale_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Sale record not found")
    record = await _build(payload, existing)
    record["sale_id"] = sale_id
    old_delta, new_delta = _inventory_delta(existing), (-record["quantity"] if record["inventory_adjusted"] else 0)
    await _stock_change(existing["product_id"], -old_delta)
    try:
        await _stock_change(record["product_id"], new_delta)
        await db.sales_records.replace_one({"sale_id": sale_id}, record)
    except Exception:
        if new_delta:
            await _stock_change(record["product_id"], -new_delta)
        if old_delta:
            await _stock_change(existing["product_id"], old_delta)
        raise
    return record


@router.delete("/{sale_id}")
async def delete_sale(sale_id: str):
    record = await db.sales_records.find_one({"sale_id": sale_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Sale record not found")
    await _stock_change(record["product_id"], -_inventory_delta(record))
    await db.sales_records.delete_one({"sale_id": sale_id})
    return {"deleted": True}
