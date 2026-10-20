import { useEffect, useRef, useState } from "react";
import { Search, Square } from "lucide-react";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { Handle } from "../components/Status";
import {
  store,
  type DashboardState,
  type SearchOutcome,
  type SearchScope,
} from "../store/store";
import { displayLabel, formatClock, formatDateTime } from "../store/model";
import { asWireError } from "../wire/protocol";
import { DialogShell } from "./DialogShell";
import { ToggleRow } from "./ui";

export function SearchDialog({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: DashboardState;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>(
    state.selection ? "session" : "instance",
  );
  const [includeClosed, setIncludeClosed] = useState(true);
  const [raw, setRaw] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = state.selection
    ? state.sessions[state.selection.id] ?? null
    : null;
  const runToken = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setScope(state.selection ? "session" : "instance");
    setIncludeClosed(true);
    setRaw(false);
    setOutcome(null);
    setError(null);
    setRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = () => {
    if (running || !query.trim()) return;
    const token = ++runToken.current;
    setRunning(true);
    setOutcome(null);
    setError(null);
    void store
      .search({ query, scope, includeClosed, raw })
      .then((result) => {
        if (token !== runToken.current) return;
        setOutcome(result);
        setRunning(false);
      })
      .catch((cause: unknown) => {
        if (token !== runToken.current) return;
        setRunning(false);
        setError(asWireError(cause).message);
      });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="Retained history · snapshot"
      title="Find"
      wide
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            Close
          </Button>
          {running ? (
            <Button
              variant="danger"
              onPress={() => {
                runToken.current += 1;
                store.cancelSearch();
                setRunning(false);
              }}
            >
              <Square className="btn__icon icon" />
              Cancel scan
            </Button>
          ) : (
            <Button
              variant="primary"
              onPress={run}
              isDisabled={!query.trim() || (scope === "session" && !selected)}
            >
              <Search className="btn__icon icon" />
              Search
            </Button>
          )}
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <label className="field">
          <span className="field__label">Literal text</span>
          <div className="field__search">
            <Search className="field__search-icon icon" />
            <input
              className="field__input"
              value={query}
              autoFocus
              placeholder="Case-insensitive over type and event data"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </label>
      </form>

      <div className="search-scope">
        <span className="field__label">Scope</span>
        <div className="segmented" role="group" aria-label="Search scope">
          <button
            type="button"
            className="segmented__item"
            data-selected={scope === "session" ? "true" : undefined}
            onClick={() => setScope("session")}
            disabled={!selected}
            title={selected ? `Session #${selected.id}` : "Select a session first"}
          >
            This session
          </button>
          <button
            type="button"
            className="segmented__item"
            data-selected={scope === "instance" ? "true" : undefined}
            onClick={() => setScope("instance")}
          >
            Instance
          </button>
        </div>
        <span className="caption">
          {scope === "session"
            ? selected
              ? `#${selected.id} · ${displayLabel(selected)}`
              : "No session selected; instance scope is available."
            : "Every session in this instance; no index and no cross-instance search."}
        </span>
      </div>

      <div className="search-options">
        <ToggleRow
          label="Include retained closed and failed sessions"
          description="Live vs retained is an explicit filter. Ended sessions keep only their retention window."
          checked={includeClosed}
          onChange={setIncludeClosed}
          disabled={scope === "session"}
        />
        <ToggleRow
          label="Include provider raw payloads"
          description="Explicit opt-in. Without it, private raw fields are removed by the supervisor."
          checked={raw}
          onChange={setRaw}
        />
      </div>

      <div className="search-meta">
        <span>
          {scope === "session"
            ? "Session scope · up to 200 matches from this retained log"
            : "Instance scope · up to 20 sessions, 50 matches per session, first page each"}
        </span>
        <span>Search is a snapshot, not an index. Live work continues.</span>
      </div>

      {error ? (
        <Notice tone="danger" title="Search failed">
          {error}
        </Notice>
      ) : null}

      {running ? (
        <div className="search-running" role="status">
          Scanning retained pages… The fleet and transcript stay live.
        </div>
      ) : outcome ? (
        <div className="search-results">
          <div className="search-results__head">
            <span>
              {outcome.hits.length} match{outcome.hits.length === 1 ? "" : "es"} ·{" "}
              {outcome.scannedSessions} of {outcome.totalSessions} sessions scanned
            </span>
            <span>as of {formatClock(outcome.asOf)}</span>
          </div>
          {outcome.cancelled ? (
            <div className="banner banner--warn">
              <span className="banner__text">
                Scan cancelled. The partial results below are from the pages that
                finished before cancellation.
              </span>
            </div>
          ) : null}
          {outcome.capped || outcome.truncated ? (
            <div className="banner banner--warn">
              <span className="banner__text">
                {outcome.capped
                  ? "The scan hit a cap; more matches may exist. Narrow the query or scope."
                  : ""}
                {outcome.truncated
                  ? " Part of the searched history was already evicted; results are not a complete record."
                  : ""}
              </span>
            </div>
          ) : null}
          {outcome.errors.length > 0 ? (
            <div className="banner banner--danger">
              <span className="banner__text">
                {outcome.errors.length} session
                {outcome.errors.length === 1 ? "" : "s"} could not be scanned:{" "}
                {outcome.errors[0]}
              </span>
            </div>
          ) : null}
          {outcome.hits.length === 0 ? (
            <div className="search-empty">
              No matches in the scanned retained history.
            </div>
          ) : (
            <div className="search-results__list">
              {outcome.hits.map((hit) => (
                <button
                  type="button"
                  className="search-result"
                  key={`${hit.session.id}-${hit.event.seq}`}
                  onClick={() => {
                    onClose();
                    void store.openAtSeq(hit.session.id, hit.event.seq);
                  }}
                >
                  <span className="search-result__session">
                    <span>{displayLabel(hit.session)}</span>
                    <Handle id={hit.session.id} />
                  </span>
                  <span className="search-result__event">
                    <span className="search-result__type">
                      seq {hit.event.seq} · {hit.event.type}
                    </span>
                    <span className="search-result__time">
                      {formatDateTime(hit.event.at)}
                    </span>
                  </span>
                  <span className="search-result__snippet">
                    {hit.snippet || "(no preview; inspect the event in context)"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="search-empty">
          Enter text to search the retained log. Results show session, seq, time,
          type, and a bounded snippet.
        </div>
      )}
    </DialogShell>
  );
}
