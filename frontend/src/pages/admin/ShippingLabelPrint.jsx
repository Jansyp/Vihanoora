import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import "./ShippingLabelPrint.css";

function formatOrderDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function AddressLines({ address }) {
  return <>{(address || "").split(/\r?\n/).filter(Boolean).map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</>;
}

function ShippingLabel({ label }) {
  const { customer, sender } = label;
  return (
    <article className="shipping-label-sheet">
      <header className="shipping-label-header">
        <div className="shipping-label-brand">VIAURA</div>
        <div className="shipping-label-title">SHIPPING LABEL</div>
      </header>
      <div className="shipping-label-rule" />
      <section className="shipping-label-section shipping-label-to">
        <h2>SHIP TO</h2>
        <div className="shipping-label-recipient">{customer.name}</div>
        <AddressLines address={customer.address} />
        <div>{customer.city}, {customer.state} - {customer.pin}</div>
        <div>{customer.country}</div>
        {customer.mobile && <div className="shipping-label-contact">Mobile: {customer.mobile}</div>}
      </section>
      <section className="shipping-label-meta">
        <div><strong>Order Number</strong><span>{label.order_number}</span></div>
        <div><strong>Order Date</strong><span>{formatOrderDate(label.order_date)}</span></div>
      </section>
      <section className="shipping-label-section shipping-label-from">
        <h2>SHIP FROM</h2>
        <div className="shipping-label-recipient">{sender.business_name}</div>
        {sender.name && sender.name !== sender.business_name && <div>{sender.name}</div>}
        <AddressLines address={sender.address} />
        <div>{sender.city}, {sender.state} - {sender.pin}</div>
        <div>{sender.country}</div>
        {sender.phone && <div>Phone: {sender.phone}</div>}
        {sender.email && <div>Email: {sender.email}</div>}
      </section>
      {label.items?.length > 0 && <section className="shipping-label-items"><h2>CONTENTS</h2>{label.items.map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name} × {item.qty}</strong>{item.variant && <span> · Colour: {item.variant}</span>}</div>)}</section>}
      <footer className="shipping-label-footer">Handle with care</footer>
    </article>
  );
}

export default function ShippingLabelPrint() {
  const [params] = useSearchParams();
  const [labels, setLabels] = useState([]);
  const [error, setError] = useState("");
  const format = params.get("format") === "thermal" ? "thermal" : "a4";
  const orderIds = params.get("order_ids") || "";

  useEffect(() => {
    let active = true;
    api.get("/admin/shipping-labels", { params: { order_ids: orderIds } })
      .then(({ data }) => { if (active) setLabels(data.labels || []); })
      .catch((e) => { if (active) setError(formatApiError(e.response?.data?.detail)); });
    return () => { active = false; };
  }, [orderIds]);

  useEffect(() => {
    if (!labels.length) return undefined;
    document.body.classList.add("shipping-label-printing");
    const timer = window.setTimeout(() => window.print(), 300);
    return () => {
      window.clearTimeout(timer);
      document.body.classList.remove("shipping-label-printing");
    };
  }, [labels]);

  if (error) return <main className="shipping-label-error"><h1>Unable to print shipping label</h1><p>{error}</p></main>;
  if (!labels.length) return <main className="shipping-label-loading">Preparing shipping label...</main>;

  return <main className={`shipping-label-print ${format}`}><div className="shipping-label-screen-actions"><button onClick={() => window.print()}>Print Again</button></div>{labels.map((label) => <ShippingLabel key={label.order_number} label={label} />)}</main>;
}
