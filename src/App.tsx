import { lazy, Suspense } from "react";
import { Dashboard } from "./app/Dashboard";
import { ErrorBoundary } from "./app/ErrorBoundary";

const Gallery = lazy(() =>
  import("./gallery/Gallery").then((module) => ({ default: module.Gallery })),
);

export function App() {
  const design = window.location.pathname.replace(/\/+$/, "").endsWith("/design");
  if (!design) {
    return (
      <ErrorBoundary>
        <Dashboard />
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="boot">
            <div className="boot__title">HLAO design specimen</div>
            <div className="boot__text">Loading the primitive gallery…</div>
          </div>
        }
      >
        <Gallery />
      </Suspense>
    </ErrorBoundary>
  );
}
