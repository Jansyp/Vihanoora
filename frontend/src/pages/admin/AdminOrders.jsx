import { useEffect, useState } from "react";
import { X, Truck } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const STATUSES = ["Payment Pending", "Paid", "Processing", "Packed", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"];
const COURIERS = ["Professional Couriers", "Blue Dart", "DTDC", "India Post", "Other"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [labelFormat, setLabelFormat] = useState("a4");
  const [ship, setShip] = useState({ courier: "Professional Couriers", awb: "", tracking_url: "", shipping_date: "", expected_delivery: "" });

  const load = () => api.get(`/admin/orders${filter ? `?status=${encodeURIComponent(filter)}` : ""}`).then(({ data }) => setOrders(data));
  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (status) => {
    const { data } = await api.put(`/admin/orders/${sel.id}/status`, { order_status: status });
    setSel(data); load(); toast.success(`Status → ${status}`);
  };
  const saveShipping = async () => {
    if (!ship.awb) { toast.error("AWB / tracking number required"); return; }
    try {
      const { data } = await api.put(`/admin/orders/${sel.id}/shipping`, { order_id: sel.id, ...ship });
      setSel(data); load(); toast.success("Shipping saved · order marked Shipped");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openOrder = (o) => {
    setSel(o);
    setShip({ courier: o.shipping?.courier || "Professional Couriers", awb: o.shipping?.awb || "", tracking_url: o.shipping?.tracking_url || "", shipping_date: o.shipping?.shipping_date || "", expected_delivery: o.shipping?.expected_delivery || "" });
  };

  const hasDeliveryInfo = (order) => Boolean(order.customer?.name && order.customer?.address && order.customer?.city && order.customer?.state && order.customer?.pin);
  const packedOrders = orders.filter((order) => order.order_status === "Packed" && hasDeliveryInfo(order));
  const toggleSelected = (orderId) => setSelectedIds((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]);
  const printLabels = (ids) => {
    if (!ids.length) { toast.error("Select at least one packed order with delivery information."); return; }
    const allowed = new Set(packedOrders.map((order) => order.id));
    const invalid = ids.some((id) => !allowed.has(id));
    if (invalid) { toast.error("Shipping labels are available only for packed orders with complete delivery information."); return; }
    const query = new URLSearchParams({ order_ids: ids.join(","), format: labelFormat });
    window.open(`/admin/shipping-labels?${query.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-6">Orders ({orders.length})</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter("")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${!filter ? "bg-[var(--ink)] text-white" : "bg-white border border-[var(--line)]"}`}>All</button>
        {STATUSES.map((s) => <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === s ? "bg-[var(--ink)] text-white" : "bg-white border border-[var(--line)]"}`}>{s}</button>)}
      </div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={labelFormat} onChange={(e) => setLabelFormat(e.target.value)} className="px-3 py-2 rounded-xl bg-white border border-[var(--line)] text-sm">
          <option value="a4">A4 Shipping Label</option>
          <option value="thermal">4x6 inch Thermal Label</option>
        </select>
        <button onClick={() => printLabels(selectedIds)} className="px-4 py-2 rounded-xl bg-[var(--ink)] text-white text-sm font-medium">Print Selected Labels</button>
        <span className="text-xs text-[var(--ink-soft)]">Select packed orders with complete delivery details.</span>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--line)] overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-[var(--card-2)] text-left"><tr><th className="px-4 py-3"><input type="checkbox" aria-label="Select all printable packed orders" checked={packedOrders.length > 0 && packedOrders.every((order) => selectedIds.includes(order.id))} onChange={(e) => setSelectedIds(e.target.checked ? packedOrders.map((order) => order.id) : [])} /></th>{["Order", "Customer", "Total", "Payment", "Status", ""].map((h) => <th key={h} className="px-4 py-3 text-xs font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${o.order_number} shipping label`} checked={selectedIds.includes(o.id)} disabled={o.order_status !== "Packed" || !hasDeliveryInfo(o)} onChange={() => toggleSelected(o.id)} /></td>
                <td className="px-4 py-3 font-medium">{o.order_number}</td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">{o.customer.name}</td>
                <td className="px-4 py-3 font-semibold">{formatINR(o.grand_total)}</td>
                <td className="px-4 py-3"><span className={`text-xs font-semibold ${o.payment_status === "PAID" ? "text-[var(--sage-dark)]" : "text-[var(--amber)]"}`}>{o.payment_status}</span></td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-[var(--blush)] text-[var(--brand)]">{o.order_status}</span></td>
                <td className="px-4 py-3"><button data-testid={`view-order-${o.order_number}`} onClick={() => openOrder(o)} className="text-[var(--brand)] font-medium text-xs">Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <p className="p-6 text-center text-[var(--ink-soft)] text-sm">No orders.</p>}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSel(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <div><h2 className="font-serif text-2xl font-semibold">{sel.order_number}</h2><p className="text-xs text-[var(--ink-soft)]">{new Date(sel.created_at).toLocaleString()}</p></div>
              <button onClick={() => setSel(null)}><X size={22} /></button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-[var(--card-2)] rounded-2xl p-4 text-sm">
                <p className="font-semibold mb-1">Customer</p>
                <p>{sel.customer.name}</p><p className="text-[var(--ink-soft)]">{sel.customer.mobile}</p><p className="text-[var(--ink-soft)]">{sel.customer.email}</p>
                <p className="text-[var(--ink-soft)] mt-1">{sel.customer.address}, {sel.customer.city}, {sel.customer.state} - {sel.customer.pin}</p>
              </div>
              <div className="bg-[var(--card-2)] rounded-2xl p-4 text-sm">
                <p className="font-semibold mb-1">Payment</p>
                <p>Status: <b>{sel.payment_status}</b></p>
                <p className="text-[var(--ink-soft)]">Method: {sel.payment?.method || "—"}</p>
                <p className="text-[var(--ink-soft)]">Total: {formatINR(sel.grand_total)}</p>
                {sel.coupon_code && <p className="text-[var(--ink-soft)]">Coupon: {sel.coupon_code} (-{formatINR(sel.coupon_discount)})</p>}
              </div>
            </div>

            <div className="mb-4">
              <p className="font-semibold text-sm mb-2">Items</p>
              {sel.items.map((i, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 border-b border-[var(--line)] last:border-0 text-sm">
                  <img src={i.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  <span className="flex-1"><span className="block">{i.name} × {i.qty}</span>{i.variant && <span className="block text-xs text-[var(--ink-soft)]">Colour: {i.variant}</span>}</span>
                  <span className="font-medium">{formatINR(i.unit_price * i.qty)}</span>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <p className="font-semibold text-sm mb-2">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} data-testid={`set-status-${s.replace(/\s/g, "-")}`} onClick={() => updateStatus(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${sel.order_status === s ? "bg-[var(--brand)] text-white" : "bg-[var(--card-2)]"}`}>{s}</button>
                ))}
              </div>
            </div>

            <div className="bg-[var(--card-2)] rounded-2xl p-4">
              <p className="font-semibold text-sm mb-3 flex items-center gap-2"><Truck size={16} /> Shipping Details</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold">Courier</label>
                  <select value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white outline-none text-sm">
                    {COURIERS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <SF label="AWB / Tracking No." v={ship.awb} on={(x) => setShip({ ...ship, awb: x })} testid="ship-awb" />
                <div className="sm:col-span-2"><SF label="Tracking URL" v={ship.tracking_url} on={(x) => setShip({ ...ship, tracking_url: x })} /></div>
                <SF label="Shipping Date" v={ship.shipping_date} on={(x) => setShip({ ...ship, shipping_date: x })} type="date" />
                <SF label="Expected Delivery" v={ship.expected_delivery} on={(x) => setShip({ ...ship, expected_delivery: x })} type="date" />
              </div>
              <div className="flex gap-2 mt-4">
                {sel.order_status === "Packed" && hasDeliveryInfo(sel) && <button onClick={() => printLabels([sel.id])} className="flex-1 py-3 rounded-full bg-white border border-[var(--ink)] text-[var(--ink)] font-medium text-sm">Print Shipping Label</button>}
                <button data-testid="save-shipping-btn" onClick={saveShipping} className="flex-1 py-3 rounded-full bg-[var(--ink)] text-white font-medium text-sm">Save & Mark Shipped</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SF({ label, v, on, type = "text", testid }) {
  return <div><label className="text-xs font-semibold">{label}</label><input data-testid={testid} type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white outline-none text-sm" /></div>;
}
