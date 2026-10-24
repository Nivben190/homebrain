/** Instant skeleton while a server page loads, so taps never feel frozen. */
export default function Loading() {
  return (
    <div className="safe-top animate-pulse" aria-busy>
      <div className="mb-6 mt-2 space-y-3 px-1">
        <div className="h-3.5 w-28 rounded-full bg-sunken" />
        <div className="h-9 w-56 rounded-2xl bg-sunken" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass flex items-center gap-3 rounded-3xl p-4">
            <div className="size-11 shrink-0 rounded-2xl bg-sunken" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded-full bg-sunken" />
              <div className="h-3 w-1/3 rounded-full bg-sunken" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
