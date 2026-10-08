"""Admin-managed sales records with historical product and cost snapshots."""
import csv
import io
import math
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from core import db, require_admin

router = APIRouter(prefix="/api/admin/sales", tags=["admin-sales"], dependencies=[Depends(require_admin)])
SOURCES = {"Website", "Referral", "Meesho"}
BUYING_PRICE_ERROR = (
    "Buying price is not configured for this product. Please update the product cost price "
    "before recording this sale."
)


class SaleLineInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    selling_price_per_unit: float = Field(ge=0, allow_inf_nan=False)
    line_id: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def integer_quantity(cls, value):
        if isinstance(value, bool) or not str(value).isdigit():
            raise ValueError("Quantity must be a positive integer")
        return int(value)

    @field_validator("product_id")
    @classmethod
    def valid_product_id(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Product is required")
        return value


class SaleInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    products: list[SaleLineInput] = Field(min_length=1)
    packing_charge: float = Field(default=10, ge=0, allow_inf_nan=False)
    platform_charges: float = Field(default=0, ge=0, allow_inf_nan=False)
    shipping_other_charges: float = Field(default=0, ge=0, allow_inf_nan=False)
    discount_adjustment: float = Field(default=0, ge=0, allow_inf_nan=False)
    selling_person_name: str = ""
    source: str
    sale_date: date
    order_reference: str = ""
    notes: str = ""
    # Legacy single-product request fields remain accepted for existing callers.
    product_id: str | None = None
    quantity: int | None = None
    selling_price_per_unit: float | None = None

    @model_validator(mode="before")
    @classmethod
    def support_legacy_single_product(cls, values):
        if isinstance(values, dict) and not values.get("products") and values.get("product_id"):
            values = dict(values)
            values["products"] = [{
                "product_id": values.get("product_id"),
                "quantity": values.get("quantity"),
                "selling_price_per_unit": values.get("selling_price_per_unit"),
            }]
        return values

    @model_validator(mode="after")
    def require_unique_products(self):
        ids = [line.product_id for line in self.products]
        if len(ids) != len(set(ids)):
            raise ValueError("A product can only be added once to a sale")
        return self

    @field_validator("source")
    @classmethod
    def valid_source(cls, value):
        value = value.strip()
        if value not in SOURCES:
            raise ValueError("Choose Website, Referral, or Meesho")
        return value


def _round(value):
    return round(float(value) + 1e-9, 2)


def _legacy_lines(record):
    """Read both the multi-line schema and historical single-line documents."""
    if record.get("products"):
        return record["products"]
    if record.get("product_id"):
        return [{
            "product_id": record["product_id"],
            "product_name": record.get("product_name", ""),
            "product_image": record.get("product_image", ""),
            "sku": record.get("sku", ""),
            "section": record.get("section", ""),
            "category": record.get("category", ""),
            "quantity": record.get("quantity", 0),
            "selling_price_per_unit": record.get("selling_price_per_unit", 0),
            "buying_price_per_unit": record.get("buying_price_per_unit", 0),
            "total_selling_amount": record.get("gross_selling_amount", 0),
            "total_buying_cost": record.get("total_buying_cost", 0),
        }]
    return []


def _filters(start_date=None, end_date=None, source=None, product=None, category=None, selling_person=None, search=None):
    clauses = []
    dates = {}
    if start_date:
        dates["$gte"] = start_date
    if end_date:
        dates["$lte"] = end_date
    if dates:
        clauses.append({"sale_date": dates})
    if source:
        clauses.append({"source": source})
    if product:
        clauses.append({"$or": [{"product_id": product}, {"products.product_id": product}]})
    if category:
        pattern = {"$regex": re.escape(category), "$options": "i"}
        clauses.append({"$or": [{"category": pattern}, {"products.category": pattern}]})
    if selling_person:
        clauses.append({"selling_person_name": {"$regex": re.escape(selling_person), "$options": "i"}})
    if search:
        pattern = {"$regex": re.escape(search), "$options": "i"}
        clauses.append({"$or": [
            {"product_name": pattern}, {"sku": pattern}, {"products.product_name": pattern},
            {"products.sku": pattern}, {"order_reference": pattern}, {"selling_person_name": pattern},
        ]})
    return {"$and": clauses} if clauses else {}


async def _records(query):
    return await db.sales_records.find(query, {"_id": 0}).sort([("sale_date", -1), ("created_at", -1)]).to_list(10000)


def _sale_totals(record, lines):
    gross_sales = _round(sum(float(line.get("total_selling_amount", 0)) for line in lines))
    buying_cost = _round(sum(float(line.get("total_buying_cost", 0)) for line in lines))
    gross_profit = _round(gross_sales - buying_cost)
    packing = _round(record.get("packing_charge", 0))
    platform = _round(record.get("platform_charges", 0))
    shipping = _round(record.get("shipping_other_charges", 0))
    discount = _round(record.get("discount_adjustment", 0))
    return {
        "gross_selling_amount": gross_sales,
        "total_buying_cost": buying_cost,
        "gross_profit": gross_profit,
        "packing_charge": packing,
        "platform_charges": platform,
        "shipping_other_charges": shipping,
        "discount_adjustment": discount,
        "total_charges": _round(packing + platform + shipping),
        "net_profit": _round(gross_profit - packing - platform - shipping - discount),
    }


def _filtered_lines(record, *, product=None, category=None, search=None):
    lines = _legacy_lines(record)
    if product:
        lines = [line for line in lines if line.get("product_id") == product]
    if category:
        needle = category.casefold()
        lines = [line for line in lines if needle in str(line.get("category", "")).casefold()]
    if search:
        needle = search.casefold()
        line_matches = [
            line for line in lines
            if needle in str(line.get("product_name", "")).casefold()
            or needle in str(line.get("sku", "")).casefold()
        ]
        record_match = needle in str(record.get("order_reference", "")).casefold() or needle in str(record.get("selling_person_name", "")).casefold()
        if line_matches:
            lines = line_matches
        elif not record_match:
            return []
    return lines


def _report(records, *, product=None, category=None, search=None):
    def blank():
        return {"orders": 0, "quantity": 0, "products_count": 0, "sales": 0, "buying_cost": 0,
                "gross_profit": 0, "packing_charges": 0, "platform_charges": 0,
                "shipping_other_charges": 0, "discounts": 0, "charges": 0, "net_profit": 0}

    overall, sources, products, source_products = blank(), {}, {}, {}
    for row in records:
        all_lines = _legacy_lines(row)
        lines = _filtered_lines(row, product=product, category=category, search=search)
        if not lines:
            continue
        totals = _sale_totals(row, lines)
        original_sales = sum(float(line.get("total_selling_amount", 0)) for line in all_lines)
        selected_sales = totals["gross_selling_amount"]
        share = selected_sales / original_sales if original_sales else 1
        for key in ("packing_charge", "platform_charges", "shipping_other_charges", "discount_adjustment"):
            totals[key] = _round(totals[key] * share)
        totals["total_charges"] = _round(totals["packing_charge"] + totals["platform_charges"] + totals["shipping_other_charges"])
        totals["net_profit"] = _round(totals["gross_profit"] - totals["total_charges"] - totals["discount_adjustment"])
        source = sources.setdefault(row["source"], blank())
        sale_quantity = sum(int(line.get("quantity", 0)) for line in lines)
        per_product = []
        for line in lines:
            key = line["product_id"]
            product_bucket = products.setdefault(key, {
                "product_id": key, "product_name": line.get("product_name", ""),
                "sku": line.get("sku", ""), **blank(),
            })
            source_bucket = source_products.setdefault(f'{row["source"]}:{key}', {
                "source": row["source"], "product_id": key, "product_name": line.get("product_name", ""), **blank(),
            })
            line_sales = float(line.get("total_selling_amount", 0))
            per_product.append((line, product_bucket, source_bucket, line_sales))

        for bucket in (overall, source):
            bucket["orders"] += 1
            bucket["quantity"] += sale_quantity
            bucket["products_count"] += len(lines)
            bucket["sales"] += totals["gross_selling_amount"]
            bucket["buying_cost"] += totals["total_buying_cost"]
            bucket["gross_profit"] += totals["gross_profit"]
            bucket["packing_charges"] += totals["packing_charge"]
            bucket["platform_charges"] += totals["platform_charges"]
            bucket["shipping_other_charges"] += totals["shipping_other_charges"]
            bucket["discounts"] += totals["discount_adjustment"]
            bucket["charges"] += totals["total_charges"] + totals["discount_adjustment"]
            bucket["net_profit"] += totals["net_profit"]

        sale_sales = totals["gross_selling_amount"]
        for line, product_bucket, source_bucket, line_sales in per_product:
            line_cost = float(line.get("total_buying_cost", 0))
            line_gross = line_sales - line_cost
            share = line_sales / sale_sales if sale_sales else 1 / len(lines)
            line_packing = totals["packing_charge"] * share
            line_platform = totals["platform_charges"] * share
            line_shipping = totals["shipping_other_charges"] * share
            line_discount = totals["discount_adjustment"] * share
            for bucket in (product_bucket, source_bucket):
                bucket["orders"] += 1
                bucket["quantity"] += int(line.get("quantity", 0))
                bucket["products_count"] += 1
                bucket["sales"] += line_sales
                bucket["buying_cost"] += line_cost
                bucket["gross_profit"] += line_gross
                bucket["packing_charges"] += line_packing
                bucket["platform_charges"] += line_platform
                bucket["shipping_other_charges"] += line_shipping
                bucket["discounts"] += line_discount
                bucket["charges"] += line_packing + line_platform + line_shipping + line_discount
                bucket["net_profit"] += line_gross - line_packing - line_platform - line_shipping - line_discount

    for bucket in [overall, *sources.values(), *products.values(), *source_products.values()]:
        for key in ("sales", "buying_cost", "gross_profit", "packing_charges", "platform_charges",
                    "shipping_other_charges", "discounts", "charges", "net_profit"):
            bucket[key] = _round(bucket[key])
    return {
        "overall": overall, "sources": sources, "products": list(products.values()),
        "source_products": list(source_products.values()),
    }


async def _product_snapshot(product_id, *, require_active=True):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found in catalogue")
    if require_active and product.get("active") is not True:
        raise HTTPException(422, "Only active catalogue products can be added to a sale")
    buying = product.get("buying_price")
    if isinstance(buying, bool) or not isinstance(buying, (int, float)) or not math.isfinite(buying) or buying < 0:
        raise HTTPException(422, BUYING_PRICE_ERROR)
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
    snapshot = {
        "product_id": product["id"], "product_name": product.get("name", ""), "product_image": image,
        "sku": product.get("sku") or "", "section": product.get("group") or "", "category": category,
    }
    return product, snapshot, _round(buying)


async def _stock_change(product_id, delta):
    if not delta:
        return
    if delta < 0:
        result = await db.products.update_one({"id": product_id, "stock": {"$gte": -delta}}, {"$inc": {"stock": delta}})
        if not result.modified_count:
            raise HTTPException(409, "Sale quantity exceeds available stock")
    else:
        await db.products.update_one({"id": product_id}, {"$inc": {"stock": delta}})


async def _adjust_inventory(record, direction):
    if not record.get("inventory_adjusted"):
        return
    lines = _legacy_lines(record)
    changed = []
    try:
        for line in lines:
            delta = int(line["quantity"]) * direction
            await _stock_change(line["product_id"], delta)
            changed.append((line["product_id"], delta))
    except Exception:
        for product_id, delta in reversed(changed):
            await _stock_change(product_id, -delta)
        raise


async def _build(payload, existing=None):
    existing_by_line = {
        line.get("line_id"): line for line in _legacy_lines(existing or {}) if line.get("line_id")
    }
    legacy_existing = _legacy_lines(existing or {})
    output_lines = []
    for line_input in payload.products:
        old = existing_by_line.get(line_input.line_id) if line_input.line_id else None
        if line_input.line_id and (not old or old["product_id"] != line_input.product_id):
            raise HTTPException(422, "Sale product line is invalid")
        if not old and existing and not existing.get("products") and legacy_existing:
            old = next((line for line in legacy_existing if line["product_id"] == line_input.product_id), None)
        if old:
            snapshot = {key: old.get(key, "") for key in (
                "product_id", "product_name", "product_image", "sku", "section", "category",
            )}
            buying = _round(old["buying_price_per_unit"])
            line_id = old.get("line_id") or str(uuid.uuid4())
        else:
            product, snapshot, buying = await _product_snapshot(line_input.product_id)
            line_id = str(uuid.uuid4())
        quantity = line_input.quantity
        selling = _round(line_input.selling_price_per_unit)
        sales = _round(selling * quantity)
        cost = _round(buying * quantity)
        output_lines.append({
            **snapshot, "line_id": line_id, "quantity": quantity,
            "selling_price_per_unit": selling, "buying_price_per_unit": buying,
            "total_selling_amount": sales, "total_buying_cost": cost,
        })
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "products": output_lines,
        "packing_charge": _round(payload.packing_charge),
        "platform_charges": _round(payload.platform_charges),
        "shipping_other_charges": _round(payload.shipping_other_charges),
        "discount_adjustment": _round(payload.discount_adjustment),
        "selling_person_name": payload.selling_person_name.strip(),
        "source": payload.source, "sale_date": payload.sale_date.isoformat(),
        "order_reference": payload.order_reference.strip(), "notes": payload.notes.strip(),
        "inventory_adjusted": payload.source in {"Meesho", "Referral"},
        "updated_at": now, "created_at": existing["created_at"] if existing else now,
    }
    record.update(_sale_totals(record, output_lines))
    # Preserve flat fields for old records/clients while new clients use products[].
    first = output_lines[0]
    for key in ("product_id", "product_name", "product_image", "sku", "section", "category",
                "selling_price_per_unit", "buying_price_per_unit"):
        record[key] = first[key]
    record["quantity"] = sum(line["quantity"] for line in output_lines)
    return record


@router.get("/report")
async def sales_report(start_date: str | None = None, end_date: str | None = None, source: str | None = None,
                       product: str | None = None, category: str | None = None, selling_person: str | None = None,
                       search: str | None = None):
    return _report(
        await _records(_filters(start_date, end_date, source, product, category, selling_person, search)),
        product=product, category=category, search=search,
    )


@router.get("/export")
async def export_sales(start_date: str | None = None, end_date: str | None = None, source: str | None = None,
                       product: str | None = None, category: str | None = None, selling_person: str | None = None,
                       search: str | None = None):
    output = io.StringIO()
    fields = [
        "Sale ID", "Date", "Product", "SKU", "Quantity", "Source", "Selling Person",
        "Selling Price", "Buying Price", "Gross Sales", "Buying Cost", "Packing Charge",
        "Platform Charges", "Shipping/Other Charges", "Discount/Adjustment",
        "Gross Profit", "Net Profit", "Order Reference", "Notes",
    ]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for record in await _records(_filters(start_date, end_date, source, product, category, selling_person, search)):
        lines = _filtered_lines(record, product=product, category=category, search=search)
        if not lines:
            continue
        totals = _sale_totals(record, lines)
        original_sales = sum(float(line.get("total_selling_amount", 0)) for line in _legacy_lines(record))
        selected_sales = totals["gross_selling_amount"]
        share_of_sale = selected_sales / original_sales if original_sales else 1
        for key in ("packing_charge", "platform_charges", "shipping_other_charges", "discount_adjustment"):
            totals[key] = _round(totals[key] * share_of_sale)
        totals["total_charges"] = _round(totals["packing_charge"] + totals["platform_charges"] + totals["shipping_other_charges"])
        sale_gross = totals["gross_selling_amount"]
        for index, line in enumerate(lines):
            line_sales = float(line.get("total_selling_amount", 0))
            line_cost = float(line.get("total_buying_cost", 0))
            share = line_sales / sale_gross if sale_gross else 1 / max(len(lines), 1)
            line_gross = _round(line_sales - line_cost)
            line_net = _round(line_gross - (totals["total_charges"] + totals["discount_adjustment"]) * share)
            sale_level = index == 0
            writer.writerow({
                "Sale ID": record.get("sale_id", ""), "Date": record.get("sale_date", ""),
                "Product": line.get("product_name", ""), "SKU": line.get("sku", ""),
                "Quantity": line.get("quantity", 0), "Source": record.get("source", ""),
                "Selling Person": record.get("selling_person_name", ""),
                "Selling Price": line.get("selling_price_per_unit", 0),
                "Buying Price": line.get("buying_price_per_unit", 0),
                "Gross Sales": line_sales, "Buying Cost": line_cost,
                "Packing Charge": totals["packing_charge"] if sale_level else "",
                "Platform Charges": totals["platform_charges"] if sale_level else "",
                "Shipping/Other Charges": totals["shipping_other_charges"] if sale_level else "",
                "Discount/Adjustment": totals["discount_adjustment"] if sale_level else "",
                "Gross Profit": line_gross, "Net Profit": line_net,
                "Order Reference": record.get("order_reference", ""), "Notes": record.get("notes", ""),
            })
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=sales-records.csv"})


@router.get("")
async def list_sales(start_date: str | None = None, end_date: str | None = None, source: str | None = None,
                     product: str | None = None, category: str | None = None, selling_person: str | None = None,
                     search: str | None = None):
    records = await _records(_filters(start_date, end_date, source, product, category, selling_person, search))
    for record in records:
        record["products"] = _legacy_lines(record)
        if "packing_charge" not in record:
            record["packing_charge"] = 0
    return records


@router.post("")
async def create_sale(payload: SaleInput):
    record = await _build(payload)
    record["sale_id"] = str(uuid.uuid4())
    await _adjust_inventory(record, -1)
    try:
        await db.sales_records.insert_one(record)
    except Exception:
        await _adjust_inventory(record, 1)
        raise
    record.pop("_id", None)
    return record


@router.get("/{sale_id}")
async def get_sale(sale_id: str):
    record = await db.sales_records.find_one({"sale_id": sale_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Sale record not found")
    record["products"] = _legacy_lines(record)
    return record


@router.put("/{sale_id}")
async def update_sale(sale_id: str, payload: SaleInput):
    existing = await db.sales_records.find_one({"sale_id": sale_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Sale record not found")
    record = await _build(payload, existing)
    record["sale_id"] = sale_id
    await _adjust_inventory(existing, 1)
    new_inventory_applied = False
    try:
        await _adjust_inventory(record, -1)
        new_inventory_applied = True
        await db.sales_records.replace_one({"sale_id": sale_id}, record)
    except Exception:
        if new_inventory_applied:
            await _adjust_inventory(record, 1)
        await _adjust_inventory(existing, -1)
        raise
    return record


@router.delete("/{sale_id}")
async def delete_sale(sale_id: str):
    record = await db.sales_records.find_one({"sale_id": sale_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Sale record not found")
    await _adjust_inventory(record, 1)
    await db.sales_records.delete_one({"sale_id": sale_id})
    return {"deleted": True}
