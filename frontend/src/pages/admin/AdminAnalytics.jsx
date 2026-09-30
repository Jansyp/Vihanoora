import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { formatINR } from "@/lib/api";

const INDIA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

function indiaToday() {
  const parts = Object.fromEntries(INDIA_DATE.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysBefore(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

const initialRange = () => {
  const end = indiaToday();
  return { start: daysBefore(end, 6), end };
};

const CARDS = [
  ["Visitors", "visitors", "Anonymous browser sessions with a page view"],
  ["Product Views", "product_views", "view_item events"],
  ["Add to Cart", "add_to_cart", "add_to_cart events"],
  ["WhatsApp Order Clicks", "whatsapp_order_clicks", "whatsapp_order_click events"],
  ["Completed Orders", "orders", "Paid order records"],
  ["Revenue", "revenue", "Revenue from paid order records"],
];

const FUNNEL = [
  ["Visitors", "visitors"],
  ["Product Views", "product_views"],
  ["Add to Cart", "add_to_cart"],
  ["WhatsApp Order Clicks", "whatsapp_order_clicks"],
  ["Completed Orders", "completed_orders"],
];

function MetricValue({ value, money = false }) {
  if (value == null || !Number.isFinite(Number(value))) return <span>No data</span>;
  return <span>{money ? formatINR(Number(value)) : Number(value).toLocaleString("en-IN")}</span>;
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-label="Loading analytics" aria-busy="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {CARDS.map(([label]) => <div key={label} className="h-28 rounded-2xl bg-white border border-[var(--line)] p-5"><div className="skeleton h-3 w-28 rounded" /><div className="skeleton h-8 w-20 rounded mt-4" /></div>)}
      </div>
      <div className="h-80 rounded-2xl bg-white border border-[var(--line)] p-5"><div className="skeleton h-full w-full rounded-xl" /></div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState(initialRange);
  const [preset, setPreset] = useState("7");
  const [customDraft, setCustomDraft] = useState(initialRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [sortBy, setSortBy] = useState("whatsapp_orders");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api.get("/admin/analytics", { params: { start_date: range.start, end_date: range.end } })
      .then(({ data: result }) => { if (active) setData(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, retryCount]);

  const setQuickRange = (days, value) => {
    const end = indiaToday();
    setPreset(value);
    setRange({ start: daysBefore(end, days - 1), end });
  };

  const products = useMemo(() => [...(data?.top_products || [])].sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0)), [data, sortBy]);
  const activityAvailable = Boolean(data?.availability?.website_events);
  const deviceTotal = (data?.devices || []).reduce((sum, device) => sum + device.sessions, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Analytics</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">Understand your VIAURA traffic, shopping activity and customer intent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Analytics date range">
          {[ ["Today", 1, "today"], ["7 Days", 7, "7"], ["30 Days", 30, "30"] ].map(([label, days, value]) => (
            <button key={value} type="button" onClick={() => setQuickRange(days, value)} aria-pressed={preset === value}
              className={`px-4 py-2 rounded-full text-sm border ${preset === value ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] hover:border-[var(--brand)]"}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => { setPreset("custom"); setCustomDraft(range); }} aria-pressed={preset === "custom"}
            className={`px-4 py-2 rounded-full text-sm border ${preset === "custom" ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] hover:border-[var(--brand)]"}`}>
            Custom
          </button>
        </div>
      </header>

      {preset === "custom" && (
        <div className="bg-white rounded-2xl border border-[var(--line)] p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="text-xs font-semibold text-[var(--ink-soft)]">Start date<input type="date" value={customDraft.start} max={customDraft.end} onChange={(event) => setCustomDraft((value) => ({ ...value, start: event.target.value }))} className="block mt-1 border border-[var(--line)] rounded-lg p-2 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs font-semibold text-[var(--ink-soft)]">End date<input type="date" value={customDraft.end} min={customDraft.start} max={indiaToday()} onChange={(event) => setCustomDraft((value) => ({ ...value, end: event.target.value }))} className="block mt-1 border border-[var(--line)] rounded-lg p-2 text-sm text-[var(--ink)]" /></label>
          <button type="button" onClick={() => setRange(customDraft)} disabled={!customDraft.start || !customDraft.end || customDraft.start > customDraft.end}
            className="px-4 py-2 rounded-lg bg-[var(--brand)] text-white text-sm disabled:opacity-50">Apply range</button>
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-2xl border border-[var(--line)] p-8 text-center" role="alert">
          <h2 className="font-semibold">Analytics data isn't available right now.</h2>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-[var(--ink)] text-white text-sm"><RefreshCw size={15} /> Retry</button>
        </div>
      ) : loading ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {CARDS.map(([label, key, caption]) => (
              <article key={key} className="bg-white rounded-2xl p-5 border border-[var(--line)] min-w-0">
                <p className="text-xs font-medium text-[var(--ink-soft)]">{label}</p>
                <p className="text-2xl font-bold mt-2 text-[var(--ink)]"><MetricValue value={data?.overview?.[key]} money={key === "revenue"} /></p>
                <p className="text-[11px] text-[var(--ink-soft)] mt-1">{caption}</p>
              </article>
            ))}
          </div>

          {!activityAvailable && Number(data?.overview?.orders || 0) === 0 && (
            <p className="bg-white rounded-xl border border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">Website event data is not available for this period yet. First-party analytics collection starts after this feature is deployed.</p>
          )}

          <section className="bg-white rounded-2xl p-5 border border-[var(--line)]">
            <h2 className="font-semibold text-lg">Customer Funnel</h2>
            <p className="text-xs text-[var(--ink-soft)] mt-1">Visitor rates use distinct anonymous sessions with the event divided by page-view sessions. Completed orders are database records and are not linked to visitor sessions.</p>
            <div className="mt-5 grid md:grid-cols-5 gap-3">
              {FUNNEL.map(([label, key], index) => {
                const step = data?.funnel?.[key] || {};
                return <div key={key} className="relative rounded-xl bg-[var(--card-2)] p-4 min-w-0">
                  <p className="text-xs text-[var(--ink-soft)]">{index + 1}. {label}</p>
                  <p className="text-xl font-bold mt-2"><MetricValue value={step.count} /></p>
                  {step.percent_of_visitors != null && index > 0 && <p className="text-[11px] text-[var(--ink-soft)] mt-1">{step.percent_of_visitors}% of visitor sessions</p>}
                </div>;
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-[var(--line)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div><h2 className="font-semibold text-lg">Daily Activity</h2><p className="text-xs text-[var(--ink-soft)]">India Standard Time · Events are first-party browser events; orders are paid database records.</p></div>
            </div>
            {data?.daily_activity?.length ? (
              <div className="w-full h-[300px]" role="img" aria-label="Daily visitors, product views, add to cart, WhatsApp order clicks, and paid orders">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily_activity} margin={{ top: 8, right: 10, left: -18, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee3df" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => value.slice(5)} minTickGap={18} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="visitors" name="Visitors (sessions)" stroke="#795548" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="product_views" name="Product views" stroke="#c16b62" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="add_to_cart" name="Add to cart" stroke="#82937a" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="whatsapp_order_clicks" name="WhatsApp order clicks" stroke="#25a35a" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="orders" name="Completed orders" stroke="#8270a4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-10 text-center text-sm text-[var(--ink-soft)]">No daily activity data for this period.</p>}
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl p-5 border border-[var(--line)] min-w-0">
              <h2 className="font-semibold text-lg">Traffic Sources</h2>
              <p className="text-xs text-[var(--ink-soft)] mt-1">Source, medium and campaign from first-party landing attribution.</p>
              {data?.traffic_sources?.length ? <div className="overflow-x-auto mt-4"><table className="w-full min-w-[480px] text-sm"><thead><tr className="text-left text-xs text-[var(--ink-soft)]"><th className="py-2">Source</th><th>Medium</th><th>Campaign</th><th className="text-right">Sessions</th></tr></thead><tbody>{data.traffic_sources.map((source, index) => <tr key={`${source.source}-${source.medium}-${source.campaign}-${index}`} className="border-t border-[var(--line)]"><td className="py-2">{source.source}</td><td>{source.medium || "—"}</td><td>{source.campaign || "—"}</td><td className="text-right">{source.sessions}</td></tr>)}</tbody></table></div> : <p className="py-8 text-sm text-[var(--ink-soft)]">No data</p>}
            </section>
            <section className="bg-white rounded-2xl p-5 border border-[var(--line)] min-w-0">
              <h2 className="font-semibold text-lg">Device</h2>
              <p className="text-xs text-[var(--ink-soft)] mt-1">Coarse device type from browser user-agent classification; no raw user-agent is stored.</p>
              {data?.devices?.length ? <div className="space-y-4 mt-5">{data.devices.map((device) => {
                const percent = deviceTotal ? Math.round(device.sessions / deviceTotal * 100) : 0;
                return <div key={device.device}><div className="flex justify-between text-sm"><span>{device.device}</span><span>{device.sessions} sessions · {percent}%</span></div><div className="h-2 bg-[var(--card-2)] rounded-full mt-1 overflow-hidden"><div className="h-full bg-[var(--brand)] rounded-full" style={{ width: `${percent}%` }} /></div></div>;
              })}</div> : <p className="py-8 text-sm text-[var(--ink-soft)]">No data</p>}
            </section>
          </div>

          <section className="bg-white rounded-2xl p-5 border border-[var(--line)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div><h2 className="font-semibold text-lg">Top Products</h2><p className="text-xs text-[var(--ink-soft)] mt-1">Views, cart actions and order intent are event counts; orders and revenue come from paid order records.</p></div>
              <label className="text-xs text-[var(--ink-soft)]">Sort by <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="ml-2 rounded-lg border border-[var(--line)] bg-white p-2 text-sm text-[var(--ink)]"><option value="whatsapp_orders">WhatsApp orders</option><option value="views">Views</option><option value="add_to_cart">Add to cart</option><option value="orders">Orders</option><option value="revenue">Revenue</option></select></label>
            </div>
            {products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="text-left text-xs text-[var(--ink-soft)]"><th className="py-2">Product</th><th>Views</th><th>Add to Cart</th><th>WhatsApp Orders</th><th>Orders</th><th className="text-right">Revenue</th></tr></thead><tbody>{products.map((product) => <tr key={`${product.combo}-${product.product_id}`} className="border-t border-[var(--line)]"><td className="py-3 pr-3">{product.product_name || "Unknown product"}{product.combo ? " (Combo)" : ""}</td><td>{product.views}</td><td>{product.add_to_cart}</td><td>{product.whatsapp_orders}</td><td>{product.orders}</td><td className="text-right">{formatINR(product.revenue)}</td></tr>)}</tbody></table></div> : <p className="py-8 text-sm text-[var(--ink-soft)]">No product data for this period.</p>}
          </section>

          <p className="text-[11px] text-[var(--ink-soft)]">Website event history begins when first-party collection is enabled. GA4 Data API is not connected. Completed orders and revenue use only actual paid VIAURA order records; a WhatsApp click is never counted as a sale.</p>
        </>
      )}
    </div>
  );
}
