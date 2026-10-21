import { RefreshCw, Search } from "lucide-react";
import { IconButton } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { Tag } from "../../components/Status";
import { formatAge, formatDateTime } from "../../store/model";
import type { ProviderSessionView } from "../../wire/protocol";
import { matchesProviderQuery } from "./providerSessions";
import { useNow } from "../hooks";
import type { BackendCatalog } from "./useBackendCatalog";
import type { ProviderCatalog } from "./useProviderCatalog";

/**
 * The provider picker: a provider column, that provider's catalog, and the
 * manual id fallback. All reads and selection live in the parent; this file
 * only renders the two columns and their empty/error states.
 */
export function ProviderPicker({
  pending,
  backendCatalog,
  backend,
  onBackend,
  supportsBackends,
  supportsCatalog,
  catalog,
  query,
  onQuery,
  selectedRow,
  onSelectRow,
  showManual,
  onToggleManual,
  manualId,
  manualCwd,
  onManualId,
  onManualCwd,
}: {
  pending: boolean;
  backendCatalog: BackendCatalog;
  backend: string;
  onBackend: (value: string) => void;
  supportsBackends: boolean;
  supportsCatalog: boolean;
  catalog: ProviderCatalog;
  query: string;
  onQuery: (value: string) => void;
  selectedRow: ProviderSessionView | null;
  onSelectRow: (row: ProviderSessionView) => void;
  showManual: boolean;
  onToggleManual: () => void;
  manualId: string;
  manualCwd: string;
  onManualId: (value: string) => void;
  onManualCwd: (value: string) => void;
}) {
  const now = useNow();
  const visibleRows = catalog.rows.filter((row) => matchesProviderQuery(row, query));

  return (
    <div className="provider-picker">
      <section className="provider-picker__col" aria-label="Providers">
        <div className="provider-picker__col-head">
          <span>Provider</span>
          <span>
            {backendCatalog.loading
              ? "reading…"
              : backendCatalog.backends === null
                ? ""
                : backendCatalog.backends.length}
          </span>
        </div>
        <div className="provider-picker__list">
          {backendCatalog.loading ? (
            <span className="provider-picker__empty">Reading backends…</span>
          ) : null}
          {backendCatalog.backends?.map((candidate) => (
            <button
              type="button"
              className="provider-row"
              key={candidate.name}
              data-selected={backend === candidate.name ? "true" : undefined}
              disabled={!candidate.available || pending}
              onClick={() => onBackend(candidate.name)}
              title={
                candidate.available
                  ? `${candidate.name} · ${candidate.source}`
                  : candidate.unavailableReason ?? `${candidate.name} is unavailable`
              }
            >
              <span className="provider-row__name">{candidate.name}</span>
              <span className="provider-row__meta">
                {candidate.source}
                {candidate.defaultMode ? ` · ${candidate.defaultMode}` : ""}
              </span>
              {!candidate.available ? (
                <span className="provider-row__warn">
                  {candidate.unavailableReason ?? "unavailable"}
                </span>
              ) : null}
            </button>
          ))}
          {backendCatalog.error ? (
            <span className="provider-picker__empty provider-picker__empty--warn">
              {backendCatalog.error}
            </span>
          ) : null}
          {!supportsBackends || backendCatalog.error ? (
            <label className="field provider-picker__typed">
              <span className="field__label">Backend</span>
              <input
                className="field__input"
                value={backend}
                onChange={(event) => onBackend(event.target.value)}
                placeholder="claude"
                spellCheck={false}
              />
            </label>
          ) : null}
          {backendCatalog.backends !== null &&
          backendCatalog.backends.length === 0 &&
          !backendCatalog.error ? (
            <span className="provider-picker__empty">
              No backends are configured.
            </span>
          ) : null}
        </div>
      </section>

      <section className="provider-picker__col" aria-label="Provider sessions">
        <div className="provider-picker__col-head">
          <span>
            Sessions
            {catalog.agent ? (
              <span className="provider-picker__agent"> · {catalog.agent}</span>
            ) : null}
          </span>
          <IconButton
            aria-label="Read the provider catalog again"
            title="Read the provider catalog again"
            onPress={catalog.refresh}
            isDisabled={pending || catalog.loading || !backend.trim()}
          >
            <RefreshCw className="icon" />
          </IconButton>
        </div>

        {supportsCatalog ? (
          <div className="provider-picker__search">
            <div className="field__search">
              <Search className="field__search-icon icon" />
              <input
                className="field__input"
                type="search"
                value={query}
                placeholder="Search id, title, or cwd"
                aria-label="Search provider sessions"
                onChange={(event) => onQuery(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="provider-picker__list">
          {!supportsCatalog ? (
            <Notice tone="warn" title="Provider discovery is not available">
              This supervisor predates{" "}
              <span className="mono">backends.sessions</span>. Enter the id and
              its original working directory below.
            </Notice>
          ) : null}
          {supportsCatalog && !backend.trim() ? (
            <span className="provider-picker__empty">
              Choose a provider to read its catalog.
            </span>
          ) : null}
          {supportsCatalog && backend.trim() && catalog.loading ? (
            <span className="provider-picker__empty">
              Reading the provider catalog…
            </span>
          ) : null}
          {supportsCatalog && catalog.error ? (
            <Notice tone="warn" title="Provider catalog unavailable">
              {catalog.error} Enter the provider id and its original cwd below.
            </Notice>
          ) : null}
          {supportsCatalog &&
          backend.trim() &&
          !catalog.loading &&
          !catalog.error &&
          catalog.rows.length === 0 ? (
            <span className="provider-picker__empty">
              No provider sessions reported for {backend}.
            </span>
          ) : null}
          {supportsCatalog &&
          catalog.rows.length > 0 &&
          visibleRows.length === 0 ? (
            <span className="provider-picker__empty">
              No sessions match “{query.trim()}”.
            </span>
          ) : null}
          {visibleRows.map((row) => {
            const title = row.title?.trim();
            return (
              <button
                type="button"
                className="provider-session"
                key={row.sessionId}
                data-selected={
                  selectedRow?.sessionId === row.sessionId ? "true" : undefined
                }
                onClick={() => onSelectRow(row)}
                disabled={pending}
              >
                <span className="provider-session__title">
                  {title || row.sessionId}
                </span>
                <span className="provider-session__meta">
                  <span className="mono">{row.sessionId}</span>
                  <span
                    className="provider-session__age"
                    title={formatDateTime(row.updatedAt)}
                  >
                    {formatAge(row.updatedAt, now)}
                  </span>
                </span>
                <span className="provider-session__cwd">{row.cwd}</span>
                <span className="provider-session__tags">
                  {row.attached ? (
                    <Tag tone="ok">
                      live #{row.hlaoSessionId ?? "?"}
                      {row.hlaoName ? ` · ${row.hlaoName}` : ""}
                    </Tag>
                  ) : (
                    <Tag>provider-only</Tag>
                  )}
                  {!row.loadable ? (
                    <span className="provider-session__warn">cannot load</span>
                  ) : null}
                  {!row.forkable ? (
                    <span className="provider-session__warn">cannot fork</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {supportsCatalog && catalog.nextCursor ? (
            <button
              type="button"
              className="provider-more"
              onClick={catalog.loadMore}
              disabled={catalog.loadingMore || pending}
            >
              {catalog.loadingMore ? "Reading…" : "Load older sessions"}
            </button>
          ) : null}
        </div>

        <div className="provider-picker__manual">
          {supportsCatalog ? (
            <button type="button" className="provider-link" onClick={onToggleManual}>
              {showManual ? "Pick from the catalog" : "Enter an id manually"}
            </button>
          ) : null}
          {showManual ? (
            <div className="provider-manual">
              <label className="field">
                <span className="field__label">Provider session id</span>
                <input
                  className="field__input"
                  value={manualId}
                  onChange={(event) => onManualId(event.target.value)}
                  placeholder="id copied from a log or earlier spawn"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span className="field__label">Original working directory</span>
                <input
                  className="field__input"
                  value={manualCwd}
                  onChange={(event) => onManualCwd(event.target.value)}
                  placeholder="Required by most providers to reopen a transcript"
                  spellCheck={false}
                />
              </label>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
