/**
 * One skeleton language for the whole site: the same shimmer (`.skeleton`
 * keyframes, brand paper/line colours, stopped by prefers-reduced-motion) on
 * shapes that reserve the final component's size, so nothing jumps when the
 * real content arrives. Decorative parts are aria-hidden; each group carries
 * one status label for screen readers. Used only where content loads in the
 * browser — server-rendered pages never show skeletons.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <span className={'skeleton-block ' + className} aria-hidden="true" />;
}

/** Same size as a trip card in `.trip-grid` (image 220 px + two lines). */
export function TripCardSkeleton() {
  return (
    <div className="trip-card skeleton-card" aria-hidden="true">
      <SkeletonBlock className="trip-image" />
      <SkeletonBlock className="skeleton-line" />
      <SkeletonBlock className="skeleton-line short" />
    </div>
  );
}

/** Same size as a My trip day card. */
export function DayCardSkeleton() {
  return (
    <div className="day-card skeleton-card" aria-hidden="true">
      <SkeletonBlock className="skeleton-thumb" />
      <span className="skeleton-stack">
        <SkeletonBlock className="skeleton-line" />
        <SkeletonBlock className="skeleton-line short" />
      </span>
    </div>
  );
}

export function SkeletonGroup({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={'skeleton-group ' + className}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
