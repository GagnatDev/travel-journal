/** Presentational layers for AuthenticatedImage: loading pulse, neutral fill, and fetch error UI. */

export function AuthenticatedImageLoadingPulse() {
  return (
    <span
      className="absolute inset-0 bg-caption/10 animate-pulse motion-reduce:animate-none"
      aria-hidden
    />
  );
}

export function AuthenticatedImageNeutralUnderlay() {
  return <span className="absolute inset-0 bg-bg-secondary" aria-hidden />;
}

export function AuthenticatedImageUnavailable({ label }: { label: string }) {
  return (
    <span
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-bg-secondary px-2 text-center text-caption"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <svg
        className="h-8 w-8 shrink-0 opacity-70"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M8 11h.01M16 11h.01M8 15h8" />
        <path d="m4 19 16-16" />
      </svg>
      <span className="font-ui text-xs leading-tight">{label}</span>
    </span>
  );
}
