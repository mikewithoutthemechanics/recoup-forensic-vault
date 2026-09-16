export default function Loading() {
  return (
    <div className="space-y-6" aria-label="Loading workspace" aria-busy="true">
      {/* Page header skeleton */}
      <div className="space-y-2 border-b border-line pb-6">
        <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
        <div className="h-7 w-56 animate-pulse rounded-lg bg-white/10 sm:w-96" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-white/5" />
        <div className="h-4 w-2/3 max-w-xl animate-pulse rounded bg-white/[0.03]" />
      </div>

      {/* KPI cards — 4 + 4 to mirror page.tsx Stat grids */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`kpi-a-${index}`}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-7 w-7 animate-pulse rounded-lg bg-white/10" />
            </div>
            <div className="mt-3 h-6 w-28 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-white/5" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`kpi-b-${index}`}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-6 w-28 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-36 animate-pulse rounded bg-white/5" />
          </div>
        ))}
      </div>

      {/* Work queue + Needs a human skeleton */}
      <div className="grid gap-4 xl:grid-cols-3" aria-hidden>
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] xl:col-span-2">
          <div className="border-b border-white/5 px-5 py-3.5">
            <div className="h-3.5 w-48 animate-pulse rounded bg-white/10" />
            <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-white/5" />
          </div>
          <div className="px-2 py-3">
            {/* Table header skeleton */}
            <div className="flex gap-2 px-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-3 flex-1 animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
            {/* Table rows skeleton */}
            <div className="space-y-1.5 px-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-2 py-2.5">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
                    <div className="h-2.5 w-24 animate-pulse rounded bg-white/5" />
                  </div>
                  <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-8 animate-pulse rounded bg-white/5" />
                  <div className="h-1.5 w-20 animate-pulse rounded-full bg-white/10" />
                  <div className="h-5 w-20 animate-pulse rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.03]">
            <div className="border-b border-white/5 px-5 py-3.5">
              <div className="h-3.5 w-24 animate-pulse rounded bg-white/10" />
              <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-white/5" />
            </div>
            <div className="space-y-2 px-5 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
                  <div className="mt-1.5 h-2.5 w-full animate-pulse rounded bg-white/5" />
                  <div className="mt-1 h-2.5 w-3/5 animate-pulse rounded bg-white/[0.03]" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-4">
            <div className="h-3.5 w-28 animate-pulse rounded bg-white/10" />
            <div className="mt-1.5 h-3 w-28 animate-pulse rounded bg-white/5" />
            <div className="mt-4 flex h-28 items-end gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 animate-pulse rounded-t bg-white/10"
                  style={{ height: `${20 + ((i * 37) % 80)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom 3 analytics cards skeleton */}
      <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`bottom-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.03]">
            <div className="border-b border-white/5 px-5 py-3.5">
              <div className="h-3.5 w-36 animate-pulse rounded bg-white/10" />
              <div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-white/5" />
            </div>
            <div className="space-y-3 px-5 py-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
                  <div className="h-2 flex-1 animate-pulse rounded-full bg-white/10" />
                  <div className="h-3 w-12 animate-pulse rounded bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
