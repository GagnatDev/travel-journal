/** Placeholder rows while the entries feed is loading (first page). */
export function TimelineEntrySkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          data-testid="timeline-entry-skeleton"
          className="bg-bg-secondary rounded-card border border-caption/10 p-4 space-y-3 animate-pulse"
          aria-hidden="true"
        >
          <div className="flex gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-bg-tertiary" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <div className="h-4 w-32 max-w-[45%] rounded bg-bg-tertiary" />
              <div className="h-3 w-20 max-w-[30%] rounded bg-bg-tertiary" />
            </div>
          </div>
          <div className="h-3.5 w-full rounded bg-bg-tertiary" />
          <div className="h-3.5 w-[92%] rounded bg-bg-tertiary" />
          <div className="h-36 w-full rounded-lg bg-bg-tertiary" />
        </div>
      ))}
    </div>
  );
}
