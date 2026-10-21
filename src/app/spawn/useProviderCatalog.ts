import { useCallback, useEffect, useRef, useState } from "react";
import { asWireError, type ProviderSessionView } from "../../wire/protocol";
import { store } from "../../store/store";

export type ProviderCatalog = {
  rows: ProviderSessionView[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  agent: string | null;
  /** The catalog failed; the manual id fields are the documented fallback. */
  needsManual: boolean;
  refresh: () => void;
  loadMore: () => void;
};

/**
 * Reads the provider's own session catalog on demand. It starts a short-lived
 * adapter and creates no HLAO session, so it must only run while its surface
 * is open.
 */
export function useProviderCatalog(
  backend: string,
  enabled: boolean,
): ProviderCatalog {
  const [rows, setRows] = useState<ProviderSessionView[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [needsManual, setNeedsManual] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const token = useRef(0);
  const trimmed = backend.trim();

  // A provider switch invalidates the catalog immediately, including any
  // in-flight page, so rows never leak from one provider to another.
  useEffect(() => {
    token.current += 1;
    setRows([]);
    setNextCursor(null);
    setError(null);
    setLoading(false);
    setLoadingMore(false);
    setAgent(null);
    setNeedsManual(false);
  }, [backend]);

  useEffect(() => {
    if (!enabled || !trimmed) return;
    const current = ++token.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void store
        .listProviderSessions(trimmed)
        .then((result) => {
          if (current !== token.current) return;
          setRows(result.sessions);
          setNextCursor(result.nextCursor);
          setAgent(
            result.agentName
              ? `${result.agentName}${result.agentVersion ? ` ${result.agentVersion}` : ""}`
              : null,
          );
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (current !== token.current) return;
          setRows([]);
          setNextCursor(null);
          setError(asWireError(cause).message);
          setLoading(false);
          // The manual fallback is the documented next move when the catalog
          // cannot be read, so reveal it instead of making the operator hunt.
          setNeedsManual(true);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabled, trimmed, epoch]);

  const loadMore = useCallback(() => {
    if (!nextCursor || !trimmed || loadingMore) return;
    const current = ++token.current;
    setLoadingMore(true);
    void store
      .listProviderSessions(trimmed, undefined, nextCursor)
      .then((result) => {
        if (current !== token.current) return;
        setRows((existing) => {
          const seen = new Set(existing.map((row) => row.sessionId));
          return [
            ...existing,
            ...result.sessions.filter((row) => !seen.has(row.sessionId)),
          ];
        });
        setNextCursor(result.nextCursor);
        setLoadingMore(false);
      })
      .catch((cause: unknown) => {
        if (current !== token.current) return;
        setError(asWireError(cause).message);
        setLoadingMore(false);
      });
  }, [trimmed, nextCursor, loadingMore]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    nextCursor,
    agent,
    needsManual,
    refresh: () => setEpoch((value) => value + 1),
    loadMore,
  };
}
