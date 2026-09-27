// Lightweight centered fallback shown while a lazy-loaded route chunk is fetched.
export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-[var(--brand)] animate-spin" role="status" aria-label="Loading" />
    </div>
  );
}
