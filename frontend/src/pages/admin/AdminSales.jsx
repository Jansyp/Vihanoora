import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Edit, LockKeyhole, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api, { assetUrl, formatApiError, formatINR } from "@/lib/api";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const newLine = () => ({ row_key: `${Date.now()}-${Math.random()}`, product_id: "", quantity: 1, selling_price_per_unit: "", buying_price_per_unit: null });
const EMPTY = { products: [newLine()], packing_charge: 10, platform_charges: 0, shipping_other_charges: 0, discount_adjustment: 0, selling_person_name: "", source: "Meesho", sale_date: today(), order_reference: "", notes: "" };
const card = "rounded-2xl border border-[var(--line)] bg-white p-5";
const field = "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]";
const sources = ["Website", "Meesho", "Referral"];
const money = (v) => Number(v || 0);

function Metric({ label, value, moneyValue = true }) {
  return <div className={card}><p className="text-xs text-[var(--ink-soft)]">{label}</p><p className="mt-2 text-xl font-semibold">{moneyValue ? formatINR(value) : Number(value || 0).toLocaleString("en-IN")}</p></div>;
}

function normalizedLines(record) {
  if (record.products?.length) return record.products.map((line) => ({ ...line, row_key: `${record.sale_id}-${line.line_id || line.product_id}` }));
  return record.product_id ? [{
    row_key: `${record.sale_id}-${record.product_id}`, product_id: record.product_id,
    product_name: record.product_name, product_image: record.product_image, sku: record.sku,
    section: record.section, category: record.category, quantity: record.quantity,
    selling_price_per_unit: record.selling_price_per_unit, buying_price_per_unit: record.buying_price_per_unit,
    total_selling_amount: record.gross_selling_amount, total_buying_cost: record.total_buying_cost,
  }] : [];
}

function AdminSales() {
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ start_date: "", end_date: "", source: "", product: "", category: "", selling_person: "", search: "" });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [productQueries, setProductQueries] = useState({});
  const [productResults, setProductResults] = useState({});
  const [saving, setSaving] = useState(false);
  const [productSort, setProductSort] = useState("net_profit");

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([api.get("/admin/sales", { params }), api.get("/admin/sales/report", { params })]);
      setRows(list.data || []);
      setReport(summary.data);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/admin/products", { params: { limit: 500, status: "active" } })
      .then(({ data }) => {
        const items = data.items || data;
        setProducts(items);
        setCategories([...new Set(items.map((p) => p.category_name || p.category).filter(Boolean))]);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const timers = Object.entries(productQueries).map(([rowKey, query]) => {
      if (!modal || !query.trim()) {
        setProductResults((prev) => ({ ...prev, [rowKey]: [] }));
        return null;
      }
      return setTimeout(() => {
        api.get("/admin/products", { params: { search: query, status: "active", limit: 20 } })
          .then(({ data }) => {
            const byText = data.items || data || [];
            const q = query.trim().toLowerCase();
            const byCategory = products.filter((p) => `${p.category_name || ""} ${p.category || ""} ${p.group || ""}`.toLowerCase().includes(q));
            setProductResults((prev) => ({
              ...prev,
              [rowKey]: [...new Map([...byText, ...byCategory].filter((p) => p.active !== false).map((p) => [p.id, p])).values()].slice(0, 30),
            }));
          })
          .catch(() => setProductResults((prev) => ({ ...prev, [rowKey]: [] })));
      }, 200);
    });
    return () => timers.forEach((timer) => timer && clearTimeout(timer));
  }, [productQueries, modal, products]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, products: [newLine()], sale_date: today() });
    setProductQueries({});
    setProductResults({});
    setModal(true);
  };
  const openEdit = (record) => {
    const lineItems = normalizedLines(record).map((line) => ({ ...line, row_key: line.row_key || newLine().row_key }));
    setEditing(record.sale_id);
    setForm({
      ...EMPTY, ...record, products: lineItems,
      packing_charge: record.packing_charge ?? 0,
    });
    setProductQueries({});
    setProductResults({});
    setModal(true);
  };
  const setLine = (rowKey, changes) => setForm((prev) => ({
    ...prev,
    products: prev.products.map((line) => line.row_key === rowKey ? { ...line, ...changes } : line),
  }));
  const chooseProduct = (rowKey, product) => {
    if (form.products.some((line) => line.row_key !== rowKey && line.product_id === product.id)) {
      toast.error("This product is already added to this sale.");
      setProductQueries((prev) => ({ ...prev, [rowKey]: "" }));
      setProductResults((prev) => ({ ...prev, [rowKey]: [] }));
      return;
    }
    const category = product.category_name || product.category || "";
    setLine(rowKey, {
      product_id: product.id, product_name: product.name, product_image: product.images?.[0] || product.image || "",
      sku: product.sku || "", section: product.group || "", category,
      buying_price_per_unit: product.buying_price,
      selling_price_per_unit: product.selling_price ?? product.mrp ?? "",
      line_id: undefined,
    });
    setProductQueries((prev) => ({ ...prev, [rowKey]: "" }));
    setProductResults((prev) => ({ ...prev, [rowKey]: [] }));
  };
  const save = async (event) => {
    event.preventDefault();
    const hasMissingCost = form.products.some((line) => line.product_id && (
      line.buying_price_per_unit == null || line.buying_price_per_unit === ""
      || !Number.isFinite(Number(line.buying_price_per_unit)) || Number(line.buying_price_per_unit) < 0
    ));
    if (!form.products.length || form.products.some((line) => !line.product_id)) {
      toast.error("Add at least one catalogue product before saving.");
      return;
    }
    if (hasMissingCost) {
      toast.error("Buying price is not configured for this product. Please update the product cost price before recording this sale.");
      return;
    }
    setSaving(true);
    const payload = {
      products: form.products.map((line) => ({
        product_id: line.product_id,
        quantity: Number(line.quantity),
        selling_price_per_unit: Number(line.selling_price_per_unit),
        ...(line.line_id ? { line_id: line.line_id } : {}),
      })),
      packing_charge: Number(form.packing_charge || 0),
      platform_charges: Number(form.platform_charges || 0),
      shipping_other_charges: Number(form.shipping_other_charges || 0),
      discount_adjustment: Number(form.discount_adjustment || 0),
      selling_person_name: form.selling_person_name,
      source: form.source,
      sale_date: form.sale_date,
      order_reference: form.order_reference,
      notes: form.notes,
    };
    try {
      if (editing) await api.put(`/admin/sales/${editing}`, payload);
      else await api.post("/admin/sales", payload);
      toast.success(editing ? "Sale updated" : "Sale recorded");
      setModal(false);
      load();
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (record) => {
    const names = normalizedLines(record).map((line) => line.product_name).filter(Boolean).join(", ");
    if (!window.confirm(`Delete the sale record for ${names || "these products"}?`)) return;
    try {
      await api.delete(`/admin/sales/${record.sale_id}`);
      toast.success("Sale deleted");
      load();
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };
  const exportCsv = async () => {
    try {
      const response = await api.get("/admin/sales/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sales-records.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };

  const totals = form.products.reduce((acc, line) => {
    const quantity = Number(line.quantity || 0);
    acc.sales += quantity * Number(line.selling_price_per_unit || 0);
    acc.cost += quantity * Number(line.buying_price_per_unit || 0);
    return acc;
  }, { sales: 0, cost: 0 });
  const grossProfit = totals.sales - totals.cost;
  const charges = money(form.packing_charge) + money(form.platform_charges) + money(form.shipping_other_charges);
  const netProfit = grossProfit - charges - money(form.discount_adjustment);
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const productRows = [...(report?.products || [])].sort((a, b) => productSort === "lowest"
    ? a.net_profit - b.net_profit
    : b[productSort] - a[productSort]).slice(0, 8);

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-serif text-3xl font-semibold">Sales Records</h1><p className="mt-1 text-sm text-[var(--ink-soft)]">Manual sales and profitability, separate from Paid Website Orders.</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm"><Download size={16}/> Export CSV</button>
        <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm text-white"><Plus size={17}/> Add Sale</button>
      </div>
    </header>

    <section>
      <h2 className="mb-3 text-lg font-semibold">Overall Sales Report <span className="text-xs font-normal text-[var(--ink-soft)]">(current filters)</span></h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          ["Total Sales", report?.overall?.sales], ["Orders / Sales", report?.overall?.orders, false],
          ["Quantity Sold", report?.overall?.quantity, false], ["Total Buying Cost", report?.overall?.buying_cost],
          ["Gross Profit", report?.overall?.gross_profit], ["Packing Charges", report?.overall?.packing_charges],
          ["Platform Charges", report?.overall?.platform_charges], ["Shipping / Other Charges", report?.overall?.shipping_other_charges],
          ["Discounts / Adjustments", report?.overall?.discounts], ["Net Profit", report?.overall?.net_profit],
        ].map(([label, value, moneyValue]) => <Metric key={label} label={label} value={value} moneyValue={moneyValue !== false}/>)}
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <div className={card}>
        <h2 className="mb-3 font-semibold">Source-wise Report</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-xs text-[var(--ink-soft)]"><tr>{["Source", "Orders", "Qty", "Sales", "Buying", "Gross profit", "Packing", "Platform", "Shipping", "Discount", "Net profit"].map((x) => <th key={x} className="py-2 pr-2">{x}</th>)}</tr></thead>
          <tbody>{sources.map((name) => {
            const r = report?.sources?.[name] || {};
            return <tr key={name} className="border-t border-[var(--line)]">
              <td className="py-2 pr-2 font-medium">{name}</td><td>{r.orders || 0}</td><td>{r.quantity || 0}</td>
              <td>{formatINR(r.sales)}</td><td>{formatINR(r.buying_cost)}</td><td>{formatINR(r.gross_profit)}</td>
              <td>{formatINR(r.packing_charges)}</td><td>{formatINR(r.platform_charges)}</td>
              <td>{formatINR(r.shipping_other_charges)}</td><td>{formatINR(r.discounts)}</td><td>{formatINR(r.net_profit)}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>
      <div className={card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Product-wise Profit</h2>
          <select aria-label="Sort product report" className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs" value={productSort} onChange={(e) => setProductSort(e.target.value)}>
            <option value="sales">Highest sales</option><option value="net_profit">Highest profit</option><option value="quantity">Highest quantity</option><option value="lowest">Lowest profit</option>
          </select>
        </div>
        {productRows.map((p) => <div key={p.product_id} className="flex justify-between border-t border-[var(--line)] py-2 text-sm">
          <span className="truncate pr-3">{p.product_name} <span className="text-[var(--ink-soft)]">· {p.quantity} sold · {formatINR(p.sales)} sales</span></span>
          <span className="font-medium">{formatINR(p.net_profit)}</span>
        </div>)}
        {!report?.products?.length && <p className="text-sm text-[var(--ink-soft)]">No sales recorded for these filters.</p>}
      </div>
      <div className={`${card} xl:col-span-2`}>
        <h2 className="mb-3 font-semibold">Source + Product Performance</h2>
        {report?.source_products?.length ? <div className="grid gap-4 md:grid-cols-3">{sources.map((source) => <div key={source}>
          <h3 className="mb-2 text-sm font-semibold">{source}</h3>
          {report.source_products.filter((r) => r.source === source).map((r) => <div key={r.product_id} className="flex justify-between gap-2 border-t border-[var(--line)] py-2 text-xs"><span>{r.product_name} · {r.quantity} sold</span><b>{formatINR(r.net_profit)}</b></div>)}
          {!report.source_products.some((r) => r.source === source) && <p className="text-xs text-[var(--ink-soft)]">No recorded sales.</p>}
        </div>)}</div> : <p className="text-sm text-[var(--ink-soft)]">No source and product sales to report.</p>}
      </div>
    </section>

    <section className={`${card} space-y-3`}>
      <h2 className="font-semibold">Filter Sales</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <label className="relative col-span-2"><Search size={16} className="absolute left-3 top-3 text-[var(--ink-soft)]"/><input className={`${field} pl-9`} placeholder="Product, SKU, order or person" value={filters.search} onChange={(e) => setFilter("search", e.target.value)}/></label>
        <input aria-label="From date" type="date" className={field} value={filters.start_date} onChange={(e) => setFilter("start_date", e.target.value)}/>
        <input aria-label="To date" type="date" className={field} value={filters.end_date} onChange={(e) => setFilter("end_date", e.target.value)}/>
        <select aria-label="Source filter" className={field} value={filters.source} onChange={(e) => setFilter("source", e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Product filter" className={field} value={filters.product} onChange={(e) => setFilter("product", e.target.value)}><option value="">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select aria-label="Category filter" className={field} value={filters.category} onChange={(e) => setFilter("category", e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        <input className={field} placeholder="Selling person" value={filters.selling_person} onChange={(e) => setFilter("selling_person", e.target.value)}/>
      </div>
    </section>

    <section className={card}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Manual Sales Records</h2><span className="text-xs text-[var(--ink-soft)]">{rows.length} records</span></div>
      {loading ? <p className="py-8 text-center text-sm text-[var(--ink-soft)]">Loading sales…</p> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm">
          <thead className="text-xs text-[var(--ink-soft)]"><tr>{["Date", "Products", "Qty", "Source", "Selling person", "Selling", "Buying", "Gross profit", "Net profit", ""].map((x) => <th key={x} className="pb-3 pr-3">{x}</th>)}</tr></thead>
          <tbody>{rows.map((r) => {
            const lines = normalizedLines(r);
            return <tr key={r.sale_id} className="border-t border-[var(--line)]">
              <td className="whitespace-nowrap py-3 pr-3">{r.sale_date}</td>
              <td className="min-w-40 py-3 pr-3"><span className="font-medium">{lines.map((line) => line.product_name).join(", ")}</span><span className="block text-xs text-[var(--ink-soft)]">{lines.length} product{lines.length === 1 ? "" : "s"}</span></td>
              <td>{lines.reduce((n, line) => n + Number(line.quantity || 0), 0)}</td><td>{r.source}</td>
              <td>{r.selling_person_name || "—"}</td><td>{formatINR(r.gross_selling_amount)}</td><td>{formatINR(r.total_buying_cost)}</td>
              <td>{formatINR(r.gross_profit)}</td><td className="font-semibold">{formatINR(r.net_profit)}</td>
              <td><div className="flex gap-1"><button title="Edit" onClick={() => openEdit(r)} className="rounded p-2 hover:bg-[var(--cream)]"><Edit size={15}/></button><button title="Delete" onClick={() => remove(r)} className="rounded p-2 text-red-600 hover:bg-red-50"><Trash2 size={15}/></button></div></td>
            </tr>;
          })}</tbody>
        </table></div>
        <div className="space-y-3 md:hidden">{rows.map((r) => {
          const lines = normalizedLines(r);
          return <article key={r.sale_id} className="rounded-xl border border-[var(--line)] p-4">
            <div className="flex justify-between gap-2"><div><p className="font-medium">{lines.map((line) => line.product_name).join(", ")}</p><p className="text-xs text-[var(--ink-soft)]">{r.sale_date} · {r.source} · Qty {lines.reduce((n, line) => n + Number(line.quantity || 0), 0)}</p></div>
              <div className="flex"><button aria-label="Edit sale" onClick={() => openEdit(r)} className="p-2"><Edit size={16}/></button><button aria-label="Delete sale" onClick={() => remove(r)} className="p-2 text-red-600"><Trash2 size={16}/></button></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-xs"><span>Selling {formatINR(r.gross_selling_amount)}</span><span>Buying {formatINR(r.total_buying_cost)}</span><span>Gross profit {formatINR(r.gross_profit)}</span><span className="font-semibold">Net profit {formatINR(r.net_profit)}</span></div>
            {r.selling_person_name && <p className="mt-2 text-xs text-[var(--ink-soft)]">Sold by {r.selling_person_name}</p>}
          </article>;
        })}{!rows.length && <p className="py-6 text-center text-sm text-[var(--ink-soft)]">No sales records found.</p>}</div>
      </>}
    </section>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
      <form onSubmit={save} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[var(--cream)] p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between"><div><h2 className="font-serif text-2xl font-semibold">{editing ? "Edit Sale" : "Add Sale"}</h2><p className="mt-1 text-xs text-[var(--ink-soft)]">Select an existing catalogue product or add another product. Buying costs are locked to the catalogue price.</p></div><button type="button" onClick={() => setModal(false)} className="p-2"><X size={20}/></button></div>

        <section className="space-y-4">
          <h3 className="border-b border-[var(--line)] pb-2 text-base font-semibold">Products in this Sale</h3>
          {form.products.map((line, index) => {
            const resultList = productResults[line.row_key] || [];
            const selected = products.find((p) => p.id === line.product_id);
            const image = line.product_image || selected?.images?.[0] || "";
            const category = line.category || selected?.category_name || selected?.category || "";
            const validCost = line.buying_price_per_unit != null && Number.isFinite(Number(line.buying_price_per_unit)) && Number(line.buying_price_per_unit) >= 0;
            return <div key={line.row_key} className="rounded-xl border border-[var(--line)] bg-white p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Product {index + 1}</p>
                {form.products.length > 1 && <button type="button" onClick={() => setForm((prev) => ({ ...prev, products: prev.products.filter((item) => item.row_key !== line.row_key) }))} className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"><X size={14} className="inline"/> Remove</button>}
              </div>
              <label className="relative block text-sm font-medium">Catalogue Product *
                <input autoComplete="off" required={!line.product_id} className={`${field} mt-1`} placeholder="Search by product name, SKU or category" value={line.product_id ? line.product_name || selected?.name || "" : productQueries[line.row_key] || ""}
                  onChange={(e) => { setProductQueries((prev) => ({ ...prev, [line.row_key]: e.target.value })); if (line.product_id) setLine(line.row_key, { product_id: "", product_name: "", product_image: "", sku: "", section: "", category: "", buying_price_per_unit: null, selling_price_per_unit: "", line_id: undefined }); }}/>
                {resultList.length > 0 && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--line)] bg-white shadow-xl">
                  {resultList.map((p) => <button type="button" key={p.id} onClick={() => chooseProduct(line.row_key, p)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[var(--cream)]">
                    <img src={assetUrl(p.images?.[0])} alt="" className="h-10 w-10 rounded-lg bg-[var(--cream)] object-cover"/>
                    <span><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-[var(--ink-soft)]">{p.sku || "No SKU"} · {p.category_name || p.category || p.group || ""}</span></span>
                  </button>)}
                </div>}
              </label>
              {line.product_id && <div className="mt-3 flex items-center gap-3 rounded-lg bg-[var(--cream)] p-2">
                {image && <img src={assetUrl(image)} alt="" className="h-12 w-12 rounded-lg bg-white object-cover"/>}
                <div><p className="font-medium">{line.product_name || selected?.name}</p><p className="text-xs text-[var(--ink-soft)]">SKU: {line.sku || "—"} · {line.section || selected?.group || "—"} / {category || "—"}</p></div>
              </div>}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium">Quantity *
                  <input required type="number" min="1" step="1" className={`${field} mt-1`} value={line.quantity} onChange={(e) => setLine(line.row_key, { quantity: e.target.value })}/>
                </label>
                <label className="text-sm font-medium">Selling Price / Unit *
                  <input required type="number" min="0" step="0.01" className={`${field} mt-1`} value={line.selling_price_per_unit} onChange={(e) => setLine(line.row_key, { selling_price_per_unit: e.target.value })}/>
                </label>
                <label className="text-sm font-medium">Buying Price / Unit
                  <span className="relative mt-1 block"><input aria-label={`Buying Price / Unit product ${index + 1}`} readOnly tabIndex={-1} type="text" className={`${field} cursor-not-allowed bg-gray-100 pr-9`} value={validCost ? formatINR(line.buying_price_per_unit) : ""} placeholder="Select product" />
                    <LockKeyhole size={15} className="absolute right-3 top-3 text-[var(--ink-soft)]"/></span>
                </label>
              </div>
              {line.product_id && !validCost && <p role="alert" className="mt-2 text-xs text-red-700">Buying price is not configured for this product. Please update the product cost price before recording this sale.</p>}
              {line.product_id && <p className="mt-2 text-xs text-[var(--ink-soft)]">Line total: {formatINR(Number(line.quantity || 0) * Number(line.selling_price_per_unit || 0))} · Buying cost: {formatINR(Number(line.quantity || 0) * Number(line.buying_price_per_unit || 0))}</p>}
            </div>;
          })}
          <button type="button" onClick={() => setForm((prev) => ({ ...prev, products: [...prev.products, newLine()] }))} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium"><Plus size={16}/> Add Another Product</button>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["packing_charge", "Packing Charge", 10],
            ["platform_charges", "Platform / Transaction Charges", 0],
            ["shipping_other_charges", "Shipping / Other Charges", 0],
            ["discount_adjustment", "Discount / Adjustment", 0],
          ].map(([key, label, defaultValue]) => <label key={key} className="text-sm font-medium">{label}
            <input type="number" min="0" step="0.01" className={`${field} mt-1`} value={form[key] ?? defaultValue} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}/>
          </label>)}
          <label className="text-sm font-medium">Source *
            <select required className={`${field} mt-1`} value={form.source} onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}>{sources.map((source) => <option key={source}>{source}</option>)}</select>
          </label>
          <label className="text-sm font-medium">Sale Date *
            <input required type="date" className={`${field} mt-1`} value={form.sale_date} onChange={(e) => setForm((prev) => ({ ...prev, sale_date: e.target.value }))}/>
          </label>
          <label className="text-sm font-medium">Selling Person
            <input className={`${field} mt-1`} value={form.selling_person_name} onChange={(e) => setForm((prev) => ({ ...prev, selling_person_name: e.target.value }))}/>
          </label>
          <label className="text-sm font-medium">Order / Sale Reference
            <input className={`${field} mt-1`} value={form.order_reference} onChange={(e) => setForm((prev) => ({ ...prev, order_reference: e.target.value }))}/>
          </label>
          <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Notes
            <textarea className={`${field} mt-1`} rows={2} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}/>
          </label>
        </div>

        {form.source === "Website" && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">Manual Website entry. Website stock is handled by paid orders, so this record will not adjust inventory.</p>}
        {(form.source === "Meesho" || form.source === "Referral") && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Saving this manual sale will reduce each product’s stock. Editing or deleting it will adjust stock accordingly.</p>}

        <div className="mt-4 rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">Profit Summary</h3>
          <div className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <span>Products<br/><b>{formatINR(totals.sales)}</b></span>
            <span>Buying Cost<br/><b>{formatINR(totals.cost)}</b></span>
            <span>Gross Profit<br/><b>{formatINR(grossProfit)}</b></span>
            <span>Packing Charge<br/><b>{formatINR(form.packing_charge)}</b></span>
            <span>Platform Charges<br/><b>{formatINR(form.platform_charges)}</b></span>
            <span>Shipping / Other<br/><b>{formatINR(form.shipping_other_charges)}</b></span>
            <span>Discount / Adjustment<br/><b>{formatINR(form.discount_adjustment)}</b></span>
            <span>Total Charges<br/><b>{formatINR(charges)}</b></span>
            <span className="font-semibold">NET PROFIT<br/><b>{formatINR(netProfit)}</b></span>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setModal(false)} className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm">Cancel</button>
          <button disabled={saving || !form.products.length || form.products.some((line) => !line.product_id || line.buying_price_per_unit == null)} className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-50">{saving ? "Saving…" : "Save Sale"}</button>
        </div>
      </form>
    </div>}
  </div>;
}

export default AdminSales;
