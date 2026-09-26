import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";

export const PRODUCT_PAGE_SIZE = 12;

export function SectionHeader({ title, subtitle, to, cta = "View all" }) {
  return (
    <div className="flex items-end justify-between mb-6 sm:mb-8">
      <div>
        {subtitle && <span className="text-xs font-semibold tracking-widest uppercase text-[var(--brand)]">{subtitle}</span>}
        <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-[var(--ink)] mt-1">{title}</h2>
      </div>
      {to && <Link to={to} className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand)] whitespace-nowrap transition-colors">{cta} →</Link>}
    </div>
  );
}

export function Section({ children, className = "" }) {
  return <section className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 ${className}`}>{children}</section>;
}

export function ProductRow({ products = [] }) {
  return (
    <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
      {products.map((p, i) => (
        <div key={p.id} className="min-w-[230px] w-[230px] sm:min-w-[250px] sm:w-[250px] snap-start">
          <ProductCard product={p} index={i} />
        </div>
      ))}
    </div>
  );
}

export function ProductGrid({ products = [] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
      {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
    </div>
  );
}

export function Pagination({ page, total, pageSize = PRODUCT_PAGE_SIZE, onPageChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  let pages;
  if (totalPages <= 7) pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  else if (page <= 4) pages = [1, 2, 3, 4, 5, totalPages];
  else if (page >= totalPages - 3) pages = [1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  else pages = [1, page - 1, page, page + 1, totalPages];

  return (
    <nav aria-label="Product pages" className="flex items-center justify-center gap-2 mt-8">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}
        className="px-3 py-2 rounded-full border border-[var(--line)] text-sm disabled:opacity-40">Previous</button>
      {pages.map((number, index) => (
        <span key={number} className="contents">
          {index > 0 && number - pages[index - 1] > 1 && <span className="px-1 text-[var(--ink-soft)]" aria-hidden="true">…</span>}
          <button type="button" onClick={() => onPageChange(number)} aria-current={page === number ? "page" : undefined}
            className={`w-10 h-10 rounded-full text-sm font-medium ${page === number ? "bg-[var(--ink)] text-white" : "border border-[var(--line)] text-[var(--ink)]"}`}>
            {number}
          </button>
        </span>
      ))}
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
        className="px-3 py-2 rounded-full border border-[var(--line)] text-sm disabled:opacity-40">Next</button>
    </nav>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-[var(--line)]">
      <div className="skeleton aspect-square" />
      <div className="p-4 space-y-3">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-9 w-full rounded-full" />
      </div>
    </div>
  );
}

export function GridSkeleton({ n = 8 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
      {Array.from({ length: n }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function Reveal({ children, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay }}>
      {children}
    </motion.div>
  );
}
