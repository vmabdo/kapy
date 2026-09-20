export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" dir="rtl">
      {/* Header skeleton */}
      <div className="flex justify-between items-center pb-2 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted/70 rounded-lg" />
          <div className="h-4 w-72 bg-muted/40 rounded-md" />
        </div>
        <div className="h-10 w-28 bg-muted/60 rounded-xl" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-2xl bg-card border border-border/50 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-muted/50 rounded" />
              <div className="h-8 w-8 bg-muted/40 rounded-xl" />
            </div>
            <div className="h-8 w-32 bg-muted/70 rounded-lg" />
            <div className="h-3 w-40 bg-muted/30 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="p-6 rounded-2xl bg-card border border-border/50 space-y-4">
        <div className="flex justify-between items-center mb-4">
          <div className="h-5 w-36 bg-muted/60 rounded" />
          <div className="h-8 w-24 bg-muted/40 rounded-lg" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-12 w-full bg-muted/30 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
