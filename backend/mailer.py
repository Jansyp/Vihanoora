"""Transactional email via Resend, with console fallback when key not set."""
import os
import asyncio
import logging

logger = logging.getLogger("Viaura.mailer")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

BRAND = "#D9777F"


def _wrap(title: str, body_html: str) -> str:
    return f"""
<div style="background:#FAF7F2;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;border:1px solid #EAE4DC;">
      <tr><td style="background:{BRAND};padding:24px 32px;">
        <span style="font-size:24px;font-weight:bold;color:#fff;letter-spacing:1px;">Viaura</span>
        <div style="color:#fff;opacity:.85;font-size:12px;">Little Things. Beautiful Moments.</div>
      </td></tr>
      <tr><td style="padding:32px;color:#2A2421;">
        <h1 style="font-size:22px;margin:0 0 12px;">{title}</h1>
        {body_html}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#F5F0EB;color:#786F6A;font-size:12px;text-align:center;">
        Need help? Reply to this email or reach us on WhatsApp. © Viaura
      </td></tr>
    </table>
  </td></tr></table>
</div>"""


def _order_rows(order: dict) -> str:
    rows = ""
    for it in order.get("items", []):
        rows += f'<tr><td style="padding:6px 0;color:#786F6A;">{it["name"]} × {it["qty"]}</td><td style="padding:6px 0;text-align:right;">₹{int(it["unit_price"]*it["qty"])}</td></tr>'
    rows += f'<tr><td style="padding:10px 0 0;font-weight:bold;border-top:1px solid #EAE4DC;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;color:{BRAND};border-top:1px solid #EAE4DC;">₹{int(order["grand_total"])}</td></tr>'
    return f'<table width="100%" style="font-size:14px;margin:16px 0;">{rows}</table>'


def build_email(event: str, order: dict):
    name = order["customer"]["name"].split(" ")[0]
    num = order["order_number"]
    templates = {
        "paid": (f"Order Confirmed 🎉 ({num})",
                 f"<p>Hi {name}, thank you! Your payment was successful and your order is confirmed.</p>{_order_rows(order)}<p>We'll notify you when it ships.</p>"),
        "processing": (f"Your order is being prepared ({num})",
                       f"<p>Hi {name}, we're carefully packing your order with love.</p>{_order_rows(order)}"),
        "shipped": (f"Your order has shipped 🚚 ({num})",
                    f"<p>Hi {name}, great news — your order is on its way!</p>" +
                    (f'<p><b>{order.get("shipping",{}).get("courier","")}</b> · Tracking: {order.get("shipping",{}).get("awb","")}</p>' if order.get("shipping") else "") +
                    _order_rows(order)),
        "delivered": (f"Delivered! Hope you love it 💝 ({num})",
                      f"<p>Hi {name}, your order has been delivered. We'd love a review!</p>{_order_rows(order)}"),
        "cancelled": (f"Order cancelled ({num})",
                      f"<p>Hi {name}, your order has been cancelled. If this was a mistake, please contact us.</p>"),
    }
    return templates.get(event)


async def send_order_email(event: str, order: dict):
    built = build_email(event, order)
    if not built:
        return
    subject, body = built
    html = _wrap(subject, body)
    to = order["customer"]["email"]
    if not RESEND_API_KEY:
        logger.info(f"[EMAIL:console] to={to} subject='{subject}' (RESEND_API_KEY not set — email not sent)")
        return
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"[EMAIL:sent] to={to} subject='{subject}'")
    except Exception as e:
        logger.error(f"[EMAIL:error] {e}")
