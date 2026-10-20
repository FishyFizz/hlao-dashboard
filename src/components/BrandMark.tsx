/** The square mark used by the dashboard, the setup screen, and the specimen. */
export function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0.5" y="0.5" width="17" height="17" fill="none" stroke="currentColor" />
      <rect x="6" y="6" width="6" height="6" fill="var(--accent)" />
      <path d="M9 0v4M9 14v4M0 9h4M14 9h4" stroke="currentColor" />
    </svg>
  );
}
