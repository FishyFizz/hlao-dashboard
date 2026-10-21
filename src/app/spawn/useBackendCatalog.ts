import { useEffect, useRef, useState } from "react";
import { asWireError, type AgentView } from "../../wire/protocol";
import { store } from "../../store/store";

export type BackendCatalog = {
  backends: AgentView[] | null;
  loading: boolean;
  error: string | null;
};

/**
 * Reads `backends.list` for a cwd. The cwd is project context for backend
 * discovery; the selected backend's own defaults stay on its AgentView.
 *
 * A debounce is optional because the draft edits cwd continuously while the
 * resume dialog opens once.
 */
export function useBackendCatalog({
  enabled,
  cwd,
  debounceMs = 0,
}: {
  enabled: boolean;
  cwd?: string;
  debounceMs?: number;
}): BackendCatalog {
  const [backends, setBackends] = useState<AgentView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  useEffect(() => {
    if (!enabled) {
      token.current += 1;
      setBackends(null);
      setLoading(false);
      setError(null);
      return;
    }
    const current = ++token.current;
    let timer: number | null = null;
    const run = () => {
      setLoading(true);
      setError(null);
      void store
        .listBackends(cwd?.trim() || undefined)
        .then((result) => {
          if (current !== token.current) return;
          setBackends(result.backends);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (current !== token.current) return;
          setLoading(false);
          setError(asWireError(cause).message);
        });
    };
    if (debounceMs > 0) timer = window.setTimeout(run, debounceMs);
    else run();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, cwd, debounceMs]);

  return { backends, loading, error };
}
