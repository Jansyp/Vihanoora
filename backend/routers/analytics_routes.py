"""First-party, PII-minimized analytics collection and admin reporting."""
import asyncio
import logging
import os
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
import requests

from core import db, require_admin

router = APIRouter(tags=["analytics"])
logger = logging.getLogger("Viaura.analytics")
INDIA_TZ = timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")
GA4_PROPERTY_ID = os.environ.get("GA4_PROPERTY_ID", "556716338")
GA4_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
EVENT_NAMES = {
    "page_view", "view_item_list", "select_item", "view_item", "add_to_cart",
    "remove_from_cart", "view_cart", "begin_checkout", "add_shipping_info",
    "add_payment_info", "newsletter_signup", "search", "whatsapp_click",
    "whatsapp_order_click", "payment_started", "payment_success", "payment_failed", "purchase",
}
PII_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\d{8,}")


class EventItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=1000)


class AnalyticsEventInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    event_name: str = Field(min_length=1, max_length=40)
    session_id: str = Field(min_length=1, max_length=64)
    items: list[EventItem] = Field(default_factory=list, max_length=40)
    source: str | None = Field(default=None, max_length=100)
    medium: str | None = Field(default=None, max_length=100)
    campaign: str | None = Field(default=None, max_length=100)
    device: Literal["mobile", "desktop", "tablet", "unknown"] = "unknown"


def _clean_label(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = " ".join(value.strip().split())
    if not cleaned or PII_PATTERN.search(cleaned):
        return None
    return cleaned[:100]


def _date_range(start_date: date | None, end_date: date | None):
    end_day = end_date or datetime.now(INDIA_TZ).date()
    start_day = start_date or end_day - timedelta(days=6)
    if start_day > end_day:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    if (end_day - start_day).days > 365:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days")
    start_local = datetime.combine(start_day, time.min, tzinfo=INDIA_TZ)
    end_local = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=INDIA_TZ)
    return start_day, end_day, start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


class GA4ReportError(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _ga4_authorized_session():
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
    except ImportError:
        raise GA4ReportError("auth_library_unavailable") from None
    credentials, _ = google.auth.default(scopes=[GA4_READONLY_SCOPE])
    return AuthorizedSession(credentials)


def _ga4_run_report(start_date: str, end_date: str, dimensions: list[str], metrics: list[str], dimension_filter: dict | None = None):
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport"
    request_body = {
        "dateRanges": [{"startDate": start_date, "endDate": end_date}],
        "dimensions": [{"name": name} for name in dimensions],
        "metrics": [{"name": name} for name in metrics],
        "limit": 400,
        "currencyCode": "INR",
    }
    if dimension_filter:
        request_body["dimensionFilter"] = dimension_filter
    try:
        with _ga4_authorized_session() as session:
            response = session.post(url, json=request_body, timeout=20)
        response.raise_for_status()
        return response.json()
    except GA4ReportError:
        raise
    except requests.HTTPError as exc:
        status = getattr(exc.response, "status_code", None)
        reason = "access_denied" if status == 403 else "authentication_failed" if status == 401 else "api_unavailable"
        raise GA4ReportError(reason) from None
    except requests.RequestException:
        raise GA4ReportError("api_unavailable") from None


def _response_rows(report: dict):
    dimension_names = [header.get("name") for header in report.get("dimensionHeaders", [])]
    metric_names = [header.get("name") for header in report.get("metricHeaders", [])]
    result = []
    for row in report.get("rows", []):
        dimensions = {name: value.get("value", "") for name, value in zip(dimension_names, row.get("dimensionValues", []))}
        metrics = {name: value.get("value", "0") for name, value in zip(metric_names, row.get("metricValues", []))}
        result.append({**dimensions, **metrics})
    return result


def _number(value, integer=False):
    try:
        parsed = float(value)
        return int(parsed) if integer else parsed
    except (TypeError, ValueError):
        return 0 if integer else 0.0


def _ga4_data_sync(start_date: str, end_date: str):
    ecommerce_events = {
        "inListFilter": {"values": ["view_item", "add_to_cart", "whatsapp_order_click"]}
    }
    event_filter = {"filter": {"fieldName": "eventName", **ecommerce_events}}
    overview_report = _ga4_run_report(start_date, end_date, [], ["totalUsers", "sessions", "screenPageViews", "ecommercePurchases", "purchaseRevenue"])
    event_report = _ga4_run_report(start_date, end_date, ["eventName"], ["eventCount"], event_filter)
    source_report = _ga4_run_report(start_date, end_date, ["sessionSource", "sessionMedium", "sessionCampaignName"], ["sessions"])
    device_report = _ga4_run_report(start_date, end_date, ["deviceCategory"], ["sessions"])
    product_report = _ga4_run_report(start_date, end_date, ["itemId", "itemName", "itemCategory"], ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"])
    daily_report = _ga4_run_report(start_date, end_date, ["date"], ["totalUsers", "sessions", "screenPageViews", "ecommercePurchases", "purchaseRevenue"])

    overview_rows = _response_rows(overview_report)
    totals = overview_rows[0] if overview_rows else {}
    event_counts = {row.get("eventName"): _number(row.get("eventCount"), integer=True) for row in _response_rows(event_report)}
    traffic_sources = []
    for row in _response_rows(source_report):
        source = _clean_label(row.get("sessionSource"))
        medium = _clean_label(row.get("sessionMedium"))
        campaign = _clean_label(row.get("sessionCampaignName"))
        traffic_sources.append({"source": source or "(not set)", "medium": medium, "campaign": campaign, "sessions": _number(row.get("sessions"), integer=True)})
    devices = [
        {"device": _clean_label(row.get("deviceCategory")) or "(not set)", "sessions": _number(row.get("sessions"), integer=True)}
        for row in _response_rows(device_report)
    ]
    top_products = []
    for row in _response_rows(product_report):
        top_products.append({
            "product_id": _clean_label(row.get("itemId")),
            "product_name": _clean_label(row.get("itemName")) or "Unknown item",
            "item_category": _clean_label(row.get("itemCategory")),
            "views": _number(row.get("itemsViewed"), integer=True),
            "add_to_cart": _number(row.get("itemsAddedToCart"), integer=True),
            "purchases": _number(row.get("itemsPurchased"), integer=True),
            "revenue": _number(row.get("itemRevenue")),
        })
    top_products.sort(key=lambda item: (item["views"], item["add_to_cart"], item["purchases"]), reverse=True)
    daily_activity = []
    for row in _response_rows(daily_report):
        raw_date = row.get("date", "")
        formatted_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if len(raw_date) == 8 else raw_date
        daily_activity.append({
            "date": formatted_date,
            "visitors": _number(row.get("totalUsers"), integer=True),
            "sessions": _number(row.get("sessions"), integer=True),
            "page_views": _number(row.get("screenPageViews"), integer=True),
            "purchases": _number(row.get("ecommercePurchases"), integer=True),
            "revenue": _number(row.get("purchaseRevenue")),
        })
    return {
        "available": True,
        "property_id": GA4_PROPERTY_ID,
        "overview": {
            "users": _number(totals.get("totalUsers"), integer=True),
            "sessions": _number(totals.get("sessions"), integer=True),
            "page_views": _number(totals.get("screenPageViews"), integer=True),
            "product_views": event_counts.get("view_item", 0),
            "add_to_cart": event_counts.get("add_to_cart", 0),
            "whatsapp_order_clicks": event_counts.get("whatsapp_order_click", 0),
            "purchases": _number(totals.get("ecommercePurchases"), integer=True),
            "purchase_revenue": _number(totals.get("purchaseRevenue")),
        },
        "traffic_sources": traffic_sources,
        "devices": devices,
        "top_products": top_products,
        "daily_activity": daily_activity,
    }


async def _ga4_data(start_date: date, end_date: date):
    try:
        return await asyncio.to_thread(_ga4_data_sync, start_date.isoformat(), end_date.isoformat())
    except Exception as exc:
        if type(exc).__name__ == "DefaultCredentialsError":
            reason = "credentials_unavailable"
        elif isinstance(exc, GA4ReportError):
            reason = exc.reason
        else:
            # Keep analytics service failures from affecting the admin dashboard.
            logger.warning("GA4 Data API integration error (%s)", type(exc).__name__)
            reason = "api_unavailable"
        logger.warning("GA4 Data API report unavailable (%s)", reason)
    return {
        "available": False,
        "property_id": GA4_PROPERTY_ID,
        "unavailable_reason": reason,
        "overview": None,
        "traffic_sources": [],
        "devices": [],
        "top_products": [],
        "daily_activity": [],
    }


async def _read_cursor(cursor):
    documents = []
    async for document in cursor:
        documents.append(document)
    return documents


@router.post("/api/analytics/events", status_code=202)
async def collect_analytics_event(payload: AnalyticsEventInput):
    """Store only allowlisted, anonymous event data; never accept client names or messages."""
    if payload.event_name not in EVENT_NAMES:
        raise HTTPException(status_code=422, detail="Unsupported analytics event")
    try:
        session_id = str(uuid.UUID(payload.session_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail="Invalid anonymous session identifier")

    safe_items = []
    for item in payload.items:
        product = await db.products.find_one(
            {"id": item.item_id}, {"_id": 0, "id": 1, "name": 1, "category": 1, "group": 1}
        )
        combo = False
        if not product:
            product = await db.combos.find_one(
                {"id": item.item_id}, {"_id": 0, "id": 1, "name": 1}
            )
            combo = bool(product)
        if product:
            safe_items.append({
                "product_id": product["id"],
                "product_name": product.get("name", ""),
                "item_category": product.get("category") or product.get("group") or ("Combo Offers" if combo else None),
                "quantity": item.quantity,
                "combo": combo,
            })

    event = {
        "event_name": payload.event_name,
        "timestamp": datetime.now(timezone.utc),
        "session_id": session_id,
        "source": _clean_label(payload.source),
        "medium": _clean_label(payload.medium),
        "campaign": _clean_label(payload.campaign),
        "device": payload.device,
        "items": safe_items,
    }
    await db.analytics_events.insert_one(event)
    return Response(status_code=202)


async def _analytics_report(start_date: date | None, end_date: date | None):
    start_day, end_day, start_utc, end_utc = _date_range(start_date, end_date)
    event_cursor = db.analytics_events.find(
        {"timestamp": {"$gte": start_utc, "$lt": end_utc}},
        {"_id": 0, "event_name": 1, "timestamp": 1, "session_id": 1, "source": 1, "medium": 1, "campaign": 1, "device": 1, "items": 1},
    )
    events = await _read_cursor(event_cursor)

    start_iso = start_utc.isoformat()
    end_iso = end_utc.isoformat()
    order_query = {
        "payment_status": "PAID",
        "$or": [
            {"paid_at": {"$gte": start_iso, "$lt": end_iso}},
            {"paid_at": {"$exists": False}, "created_at": {"$gte": start_iso, "$lt": end_iso}},
        ],
    }
    order_cursor = db.orders.find(
        order_query,
        {"_id": 0, "id": 1, "payment_status": 1, "paid_at": 1, "created_at": 1, "grand_total": 1, "items": 1},
    )
    paid_orders = await _read_cursor(order_cursor)

    website_events_available = bool(events)
    page_events = [event for event in events if event.get("event_name") == "page_view"]
    page_views_available = bool(page_events)
    visitors = len({event.get("session_id") for event in page_events if event.get("session_id")}) if page_events else None
    counts = defaultdict(int)
    for event in events:
        counts[event.get("event_name")] += 1

    total_revenue = round(sum(float(order.get("grand_total", 0) or 0) for order in paid_orders), 2)
    overview = {
        "visitors": visitors,
        "product_views": counts["view_item"] if website_events_available else None,
        "add_to_cart": counts["add_to_cart"] if website_events_available else None,
        "whatsapp_order_clicks": counts["whatsapp_order_click"] if website_events_available else None,
        "orders": len(paid_orders),
        "revenue": total_revenue,
    }

    sessions_by_event = defaultdict(set)
    for event in events:
        if event.get("session_id"):
            sessions_by_event[event.get("event_name")].add(event["session_id"])
    def funnel_step(count, event_name=None, unit="events", comparable=True):
        sessions = len(sessions_by_event[event_name]) if event_name else None
        rate = round(sessions / visitors * 100, 1) if comparable and visitors and sessions is not None else (100.0 if event_name is None and visitors is not None else None)
        return {"count": count, "unit": unit, "sessions": sessions, "percent_of_visitors": rate}

    funnel = {
        "visitors": funnel_step(visitors, unit="sessions", comparable=False),
        "product_views": funnel_step(overview["product_views"], "view_item"),
        "add_to_cart": funnel_step(overview["add_to_cart"], "add_to_cart"),
        "whatsapp_order_clicks": funnel_step(overview["whatsapp_order_clicks"], "whatsapp_order_click"),
        # Paid orders are not tied to browser sessions; no misleading conversion rate is reported.
        "completed_orders": {"count": len(paid_orders), "unit": "paid orders", "sessions": None, "percent_of_visitors": None},
    }

    daily = {}
    day = start_day
    while day <= end_day:
        daily[day.isoformat()] = {
            "date": day.isoformat(),
            "visitors": 0 if page_views_available else None,
            "product_views": 0 if website_events_available else None,
            "add_to_cart": 0 if website_events_available else None,
            "whatsapp_order_clicks": 0 if website_events_available else None,
            "orders": 0,
            "revenue": 0.0,
            "_sessions": set(),
        }
        day += timedelta(days=1)
    for event in events:
        stamp = event["timestamp"]
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        day_key = stamp.astimezone(INDIA_TZ).date().isoformat()
        row = daily.get(day_key)
        if not row:
            continue
        name = event.get("event_name")
        metric = {"view_item": "product_views", "add_to_cart": "add_to_cart", "whatsapp_order_click": "whatsapp_order_clicks"}.get(name)
        if metric:
            row[metric] += 1
        if name == "page_view" and event.get("session_id"):
            row["_sessions"].add(event["session_id"])
    for order in paid_orders:
        order_time = order.get("paid_at") or order.get("created_at")
        try:
            stamp = datetime.fromisoformat(order_time.replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            row = daily.get(stamp.astimezone(INDIA_TZ).date().isoformat())
            if row:
                row["orders"] += 1
                row["revenue"] += float(order.get("grand_total", 0) or 0)
        except (AttributeError, ValueError):
            continue
    daily_activity = []
    for row in daily.values():
        row["visitors"] = len(row.pop("_sessions")) if page_views_available else None
        row["revenue"] = round(row["revenue"], 2)
        daily_activity.append(row)

    traffic_sessions = defaultdict(set)
    device_sessions = defaultdict(set)
    for event in page_events:
        session_id = event.get("session_id")
        if not session_id:
            continue
        source = event.get("source") or "Direct"
        medium = event.get("medium") or ("direct" if source == "Direct" else "referral")
        campaign = event.get("campaign") or ""
        traffic_sessions[(source, medium, campaign)].add(session_id)
        device_sessions[event.get("device") or "unknown"].add(session_id)
    traffic_sources = [
        {"source": source, "medium": medium, "campaign": campaign or None, "sessions": len(sessions)}
        for (source, medium, campaign), sessions in sorted(traffic_sessions.items(), key=lambda pair: len(pair[1]), reverse=True)
    ]
    devices = [{"device": device.title(), "sessions": len(sessions)} for device, sessions in sorted(device_sessions.items())]

    products = {}
    for event in events:
        metric = {"view_item": "views", "add_to_cart": "add_to_cart", "whatsapp_order_click": "whatsapp_orders"}.get(event.get("event_name"))
        if not metric:
            continue
        for item in event.get("items", []):
            key = (item.get("product_id"), bool(item.get("combo")))
            product = products.setdefault(key, {
                "product_id": key[0], "product_name": item.get("product_name") or "", "item_category": item.get("item_category"),
                "combo": key[1], "views": 0, "add_to_cart": 0, "whatsapp_orders": 0, "orders": 0, "revenue": 0.0,
                "_order_ids": set(),
            })
            product[metric] += 1
    for order in paid_orders:
        for item in order.get("items", []):
            product_id = item.get("product_id")
            if not product_id:
                continue
            key = (product_id, bool(item.get("combo")))
            product = products.setdefault(key, {
                "product_id": product_id, "product_name": item.get("name") or "", "item_category": None,
                "combo": key[1], "views": 0, "add_to_cart": 0, "whatsapp_orders": 0, "orders": 0, "revenue": 0.0,
                "_order_ids": set(),
            })
            product["product_name"] = product["product_name"] or item.get("name") or ""
            order_id = order.get("id")
            if order_id not in product["_order_ids"]:
                product["_order_ids"].add(order_id)
                product["orders"] += 1
            item_revenue = item.get("actual_item_revenue")
            if item_revenue is None:
                item_revenue = float(item.get("unit_price", 0) or 0) * int(item.get("qty", 0) or 0)
            product["revenue"] += float(item_revenue or 0)
    top_products = []
    for product in products.values():
        product.pop("_order_ids", None)
        product["revenue"] = round(product["revenue"], 2)
        top_products.append(product)
    top_products.sort(key=lambda product: (product["views"], product["add_to_cart"], product["whatsapp_orders"]), reverse=True)
    ga4_data = await _ga4_data(start_day, end_day)

    return {
        "range": {"start_date": start_day.isoformat(), "end_date": end_day.isoformat(), "timezone": "Asia/Kolkata"},
        "availability": {"website_events": website_events_available, "orders": True, "traffic_sources": bool(traffic_sources), "devices": bool(devices), "ga4": ga4_data["available"]},
        "overview": overview,
        "funnel": funnel,
        "traffic_sources": traffic_sources,
        "devices": devices,
        "top_products": top_products,
        "daily_activity": daily_activity,
        "ga4": ga4_data,
    }


@router.get("/api/admin/analytics", dependencies=[Depends(require_admin)])
async def admin_analytics(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
):
    return await _analytics_report(start_date, end_date)
