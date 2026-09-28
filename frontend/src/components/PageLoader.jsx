// Lightweight centered fallback shown while a lazy-loaded route chunk is fetched.
export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-[var(--brand)] animate-spin" role="status" aria-label="Loading" />
    </div>
  );
}

const HOME_TILES = ["w-12", "w-10", "w-9", "w-12", "w-14", "w-16"];

export function HomePageLoader() {
  return (
    <div className="relative w-full" aria-busy="true">
      <div aria-hidden="true" className="pointer-events-none select-none">
        <section className="relative overflow-hidden bg-gradient-to-b from-[#FCEEE9] via-[#FAF7F2] to-[#FAF7F2]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-14 sm:py-20 grid lg:grid-cols-2 gap-8 items-center">
            <div className="min-h-[280px] flex flex-col items-center justify-center gap-5 lg:items-start">
              <div className="skeleton h-6 w-40 rounded-full" />
              <div className="skeleton h-20 w-4/5 rounded-2xl" />
              <div className="skeleton h-12 w-3/4 rounded-xl" />
              <div className="flex gap-3">
                <div className="skeleton h-12 w-28 rounded-full" />
                <div className="skeleton h-12 w-36 rounded-full" />
              </div>
            </div>
            <div className="relative min-h-[360px] sm:min-h-[480px] flex items-center justify-center">
              <div className="h-72 w-72 rounded-full bg-white/50 animate-pulse" />
            </div>
          </div>
        </section>

        <div className="bg-white border-y border-[var(--line)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-4 py-5">
            {HOME_TILES.slice(0, 4).map((width, index) => (
              <div key={index} className="flex items-center justify-center gap-2">
                <div className="skeleton h-[18px] w-[18px] rounded-full" />
                <div className={`skeleton h-4 ${width} rounded`} />
              </div>
            ))}
          </div>
        </div>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14">
          <div className="mb-6 sm:mb-8">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-8 w-52 rounded-lg mt-2" />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
            {HOME_TILES.map((width, index) => (
              <div key={index} className="flex flex-col items-center gap-3">
                <div className="skeleton h-16 w-16 rounded-3xl sm:h-20 sm:w-20" />
                <div className={`skeleton h-4 ${width} rounded`} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="absolute inset-x-0 top-0 flex min-h-[50vh] items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-[var(--brand)] animate-spin" role="status" aria-label="Loading" />
      </div>
    </div>
  );
}
