import { useEffect, useRef, useState } from "react";
import { GitFork, Play, RefreshCw, Search } from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Notice } from "../components/Notice";
import { Tag } from "../components/Status";
import {
  canUse,
  store,
  type DashboardState,
} from "../store/store";
import {
  formatAge,
  formatDateTime,
  isTerminalStatus,
} from "../store/model";
import type {
  AgentView,
  ProviderSessionView,
} from "../wire/protocol";
import { asWireError, CAPABILITIES } from "../wire/protocol";
import { newId } from "../lib/id";
import { DialogShell } from "./DialogShell";
import { useNow } from "./hooks";
import { PermissionModeField } from "./PermissionModeField";
import { SelectField, ToggleRow } from "./ui";
import {
  canForkProviderRow,
  canResumeProviderRow,
  matchesProviderQuery,
} from "./providerSessions";

export type ResumePrefill = {
  backend: string;
  providerId: string;
  cwd?: string;
  name?: string;
  parentSessionId?: string | null;
};

/**
 * The provider-session popup. The provider owns the catalog, so the picker is
 * two columns: a provider on the left and that provider's sessions on the
 * right. Resume and fork are the two actions, not a mode switch: either one is
 * a complete submission against the selected row.
 */
export function ResumeDialog({
  open,
  state,
  onClose,
  initial,
}: {
  open: boolean;
  state: DashboardState;
  onClose: () => void;
  initial?: ResumePrefill;
}) {
  const now = useNow();
  const [backends, setBackends] = useState<AgentView[] | null>(null);
  const [loadingBackends, setLoadingBackends] = useState(false);
  const [backendsError, setBackendsError] = useState<string | null>(null);
  const [backend, setBackend] = useState("");
  const [rows, setRows] = useState<ProviderSessionView[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [catalogAgent, setCatalogAgent] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<ProviderSessionView | null>(null);
  const [manual, setManual] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualCwd, setManualCwd] = useState("");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [mode, setMode] = useState("");
  const [skill, setSkill] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const backendsToken = useRef(0);
  const catalogToken = useRef(0);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const prefillApplied = useRef(false);

  const pending = Boolean(state.pending.spawn);
  const supportsBackends = canUse(state, CAPABILITIES.backendsList);
  const supportsCatalog = canUse(state, CAPABILITIES.providerSessions);
  const supportsResume = canUse(state, CAPABILITIES.spawnResume);
  const supportsFork = canUse(state, CAPABILITIES.spawnFork);
  const supportsIdempotency = canUse(state, CAPABILITIES.spawnIdempotency);
  const configError = state.instance?.configError ?? null;
  const parentChoices = Object.values(state.sessions).filter(
    (session) => !isTerminalStatus(session.status),
  );
  const visibleRows = rows.filter((row) => matchesProviderQuery(row, query));
  const providerId = selectedRow?.sessionId ?? manualId.trim();
  const providerCwd = selectedRow?.cwd ?? manualCwd.trim();
  const showManual = manual || !supportsCatalog;
  const resumeAllowed =
    supportsResume &&
    Boolean(backend.trim()) &&
    Boolean(providerId) &&
    (selectedRow ? canResumeProviderRow(selectedRow) : true);
  const forkAllowed =
    supportsFork &&
    Boolean(backend.trim()) &&
    Boolean(providerId) &&
    (selectedRow ? canForkProviderRow(selectedRow) : true);
  const blocked = pending || Boolean(configError);

  useEffect(() => {
    if (!open) return;
    const initialParent =
      initial?.parentSessionId !== undefined &&
      initial?.parentSessionId !== null &&
      state.sessions[initial.parentSessionId] !== undefined &&
      !isTerminalStatus(state.sessions[initial.parentSessionId]!.status)
        ? initial.parentSessionId
        : "";
    setQuery("");
    setName(initial?.name ?? "");
    setParent(initialParent);
    setMode("");
    setSkill(true);
    setManual(initial !== undefined);
    setManualId(initial?.providerId ?? "");
    setManualCwd(initial?.cwd ?? "");
    setSelectedRow(null);
    setRows([]);
    setNextCursor(null);
    setRowsError(null);
    setLoadingRows(false);
    setLoadingMore(false);
    setCatalogAgent(null);
    setRefresh(0);
    setError(null);
    setDetails(null);
    attempt.current = null;
    setBackend(initial?.backend.trim() ?? state.local.lastBackend ?? "");

    if (!supportsBackends) {
      setBackends(null);
      return;
    }
    const token = ++backendsToken.current;
    setLoadingBackends(true);
    setBackendsError(null);
    void store
      // The last-used cwd is the only project context available before a row
      // is chosen; the selected row's own cwd governs the actual spawn.
      .listBackends(state.local.lastCwd || undefined)
      .then((result) => {
        if (token !== backendsToken.current) return;
        setBackends(result.backends);
        setLoadingBackends(false);
        setBackend((current) => {
          for (const candidate of [
            current,
            initial?.backend.trim(),
            state.local.lastBackend,
          ]) {
            if (!candidate) continue;
            const match = result.backends.find(
              (item) => item.name === candidate && item.available,
            );
            if (match) return match.name;
          }
          // A recovery row names a backend that produced this conversation.
          // Keep it visible even when the current manifest marks it
          // unavailable, so the failure is explicit and the id/cwd are kept.
          const recorded = initial?.backend.trim();
          if (recorded) {
            const match = result.backends.find((item) => item.name === recorded);
            if (match) return match.name;
          }
          return result.backends.find((item) => item.available)?.name ?? "";
        });
      })
      .catch((cause: unknown) => {
        if (token !== backendsToken.current) return;
        setLoadingBackends(false);
        setBackendsError(asWireError(cause).message);
      });
    // The reset is intentionally tied to opening the dialog, not to every
    // local-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supportsBackends, initial]);

  // A provider switch invalidates the catalog immediately, including any
  // in-flight page, so rows never leak from one provider to another.
  useEffect(() => {
    catalogToken.current++;
    setRows([]);
    setNextCursor(null);
    setRowsError(null);
    setSelectedRow(null);
    setLoadingRows(false);
    setLoadingMore(false);
  }, [backend]);

  useEffect(() => {
    if (!open || !supportsCatalog || !backend.trim()) return;
    const token = ++catalogToken.current;
    const timer = window.setTimeout(() => {
      setLoadingRows(true);
      setRowsError(null);
      void store
        .listProviderSessions(backend.trim())
        .then((result) => {
          if (token !== catalogToken.current) return;
          setRows(result.sessions);
          setNextCursor(result.nextCursor);
          setCatalogAgent(
            result.agentName
              ? `${result.agentName}${result.agentVersion ? ` ${result.agentVersion}` : ""}`
              : null,
          );
          setLoadingRows(false);
          // Keep the selected row's facts current, but do not drop the
          // selection when a later page no longer lists the row.
          setSelectedRow((current) =>
            current === null
              ? null
              : result.sessions.find(
                  (row) => row.sessionId === current.sessionId,
                ) ?? current,
          );
        })
        .catch((cause: unknown) => {
          if (token !== catalogToken.current) return;
          setRows([]);
          setNextCursor(null);
          setRowsError(asWireError(cause).message);
          setLoadingRows(false);
          // The manual fallback is the documented next move when the catalog
          // cannot be read, so reveal it instead of making the operator hunt.
          setManual(true);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, backend, refresh, supportsCatalog]);

  // A row opened from the Recoverable rail starts as a manual id so the exact
  // receipt is visible even before the catalog arrives. Once the provider list
  // contains that id, select the row to expose its title/loadable flags. The
  // ref makes this a one-shot: an operator who switches to manual entry keeps
  // manual entry.
  useEffect(() => {
    if (!open) {
      prefillApplied.current = false;
      return;
    }
    if (initial === undefined || prefillApplied.current) return;
    const row = rows.find((candidate) => candidate.sessionId === initial.providerId);
    if (row === undefined) return;
    prefillApplied.current = true;
    setSelectedRow(row);
    setManual(false);
    setManualId("");
  }, [open, initial, rows]);

  const loadMore = () => {
    if (!nextCursor || !backend.trim() || loadingMore || pending) return;
    const token = ++catalogToken.current;
    setLoadingMore(true);
    void store
      .listProviderSessions(backend.trim(), undefined, nextCursor)
      .then((result) => {
        if (token !== catalogToken.current) return;
        setRows((current) => {
          const seen = new Set(current.map((row) => row.sessionId));
          return [
            ...current,
            ...result.sessions.filter((row) => !seen.has(row.sessionId)),
          ];
        });
        setNextCursor(result.nextCursor);
        setLoadingMore(false);
      })
      .catch((cause: unknown) => {
        if (token !== catalogToken.current) return;
        setRowsError(asWireError(cause).message);
        setLoadingMore(false);
      });
  };

  const chooseRow = (row: ProviderSessionView) => {
    setSelectedRow(row);
    setManual(false);
    setManualId("");
    setError(null);
  };

  const toggleManual = () => {
    if (manual) {
      setManual(false);
      // Hiding the manual fields must also drop their id, or a hidden manual
      // entry would keep the footer actions enabled with no visible source.
      setManualId("");
      setManualCwd("");
    } else {
      setManual(true);
      setSelectedRow(null);
    }
  };

  const signatureFor = (action: "resume" | "fork") =>
    JSON.stringify({
      action,
      backend,
      providerId,
      providerCwd,
      name,
      parent,
      mode,
      skill,
    });

  const submit = (action: "resume" | "fork") => {
    if (blocked) return;
    setError(null);
    setDetails(null);
    if (!backend.trim()) {
      setError("Choose a provider first.");
      return;
    }
    if (!providerId) {
      setError("Choose a provider session or enter its id manually.");
      return;
    }
    if (action === "resume" && !supportsResume) {
      setError("This supervisor does not advertise spawn.resume.");
      return;
    }
    if (action === "fork" && !supportsFork) {
      setError("This supervisor does not advertise spawn.fork.");
      return;
    }
    if (selectedRow && action === "resume" && !selectedRow.loadable) {
      setError(
        `The adapter did not advertise loadSession for ${selectedRow.sessionId}; it cannot be resumed.`,
      );
      return;
    }
    if (selectedRow && action === "fork" && !selectedRow.forkable) {
      setError(
        `The adapter did not advertise session/fork for ${selectedRow.sessionId}; it cannot be copied.`,
      );
      return;
    }
    const signature = signatureFor(action);
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: newId("spawn") };
    }
    const idempotencyKey = supportsIdempotency ? attempt.current.key : undefined;
    void store
      .spawnSession({
        backend: backend.trim(),
        ...(providerCwd ? { cwd: providerCwd } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(parent ? { parentSessionId: parent } : {}),
        ...(mode.trim() ? { mode: mode.trim() } : {}),
        skill,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(action === "resume"
          ? { resumeSessionId: providerId }
          : { forkSessionId: providerId }),
      })
      .then(() => onClose())
      .catch((cause: unknown) => {
        const wire = asWireError(cause);
        setError(wire.message);
        if (wire.details !== undefined) {
          const payload = wire.details;
          const stderr =
            payload && typeof payload === "object" && "stderr" in payload
              ? String((payload as { stderr: unknown }).stderr)
              : null;
          setDetails(stderr ?? JSON.stringify(payload, null, 2));
        }
      });
  };

  const forkHint = !supportsFork
    ? "This supervisor does not advertise spawn.fork."
    : selectedRow && !selectedRow.forkable
      ? "The adapter did not advertise session/fork for this row."
      : !providerId
        ? "Choose a provider session first."
        : "Copy the provider session and leave the source untouched";
  const resumeHint = !supportsResume
    ? "This supervisor does not advertise spawn.resume."
    : selectedRow && !selectedRow.loadable
      ? "The adapter did not advertise loadSession for this row."
      : !providerId
        ? "Choose a provider session first."
        : "Attach this provider session to the instance";

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="Provider sessions"
      title="Resume or fork a provider session"
      className="dialog--provider"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onPress={() => submit("fork")}
            isDisabled={blocked || !forkAllowed}
            title={forkHint}
          >
            <GitFork className="btn__icon icon" />
            {pending ? "Working…" : "Fork copy"}
          </Button>
          <Button
            variant="primary"
            onPress={() => submit("resume")}
            isDisabled={blocked || !resumeAllowed}
            title={resumeHint}
          >
            <Play className="btn__icon icon" />
            {pending ? "Working…" : "Resume"}
          </Button>
        </>
      }
    >
      <p className="dialog-lede">
        The provider owns this catalog. Reading it starts a short-lived adapter
        and creates no HLAO session. Pick a provider, then one of its sessions.
        Resume attaches it here; Fork copies it and leaves the source alone.
      </p>

      {configError ? (
        <Notice tone="danger" title="New spawns are blocked by a config error">
          {configError} Fix the file and use Reload config; live sessions are
          unaffected.
        </Notice>
      ) : null}

      <div className="provider-picker">
        <section className="provider-picker__col" aria-label="Providers">
          <div className="provider-picker__col-head">
            <span>Provider</span>
            <span>
              {loadingBackends
                ? "reading…"
                : backends === null
                  ? ""
                  : backends.length}
            </span>
          </div>
          <div className="provider-picker__list">
            {loadingBackends ? (
              <span className="provider-picker__empty">Reading backends…</span>
            ) : null}
            {backends?.map((candidate) => (
              <button
                type="button"
                className="provider-row"
                key={candidate.name}
                data-selected={backend === candidate.name ? "true" : undefined}
                disabled={!candidate.available || pending}
                onClick={() => setBackend(candidate.name)}
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
            {backendsError ? (
              <span className="provider-picker__empty provider-picker__empty--warn">
                {backendsError}
              </span>
            ) : null}
            {!supportsBackends || backendsError ? (
              <label className="field provider-picker__typed">
                <span className="field__label">Backend</span>
                <input
                  className="field__input"
                  value={backend}
                  onChange={(event) => setBackend(event.target.value)}
                  placeholder="claude"
                  spellCheck={false}
                />
              </label>
            ) : null}
            {backends !== null && backends.length === 0 && !backendsError ? (
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
              {catalogAgent ? (
                <span className="provider-picker__agent"> · {catalogAgent}</span>
              ) : null}
            </span>
            <IconButton
              aria-label="Read the provider catalog again"
              title="Read the provider catalog again"
              onPress={() => setRefresh((value) => value + 1)}
              isDisabled={pending || loadingRows || !backend.trim()}
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
                  onChange={(event) => setQuery(event.target.value)}
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
            {supportsCatalog && backend.trim() && loadingRows ? (
              <span className="provider-picker__empty">
                Reading the provider catalog…
              </span>
            ) : null}
            {supportsCatalog && rowsError ? (
              <Notice tone="warn" title="Provider catalog unavailable">
                {rowsError} Enter the provider id and its original cwd below.
              </Notice>
            ) : null}
            {supportsCatalog &&
            backend.trim() &&
            !loadingRows &&
            !rowsError &&
            rows.length === 0 ? (
              <span className="provider-picker__empty">
                No provider sessions reported for {backend}.
              </span>
            ) : null}
            {supportsCatalog &&
            rows.length > 0 &&
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
                  onClick={() => chooseRow(row)}
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
            {supportsCatalog && nextCursor ? (
              <button
                type="button"
                className="provider-more"
                onClick={loadMore}
                disabled={loadingMore || pending}
              >
                {loadingMore ? "Reading…" : "Load older sessions"}
              </button>
            ) : null}
          </div>

          <div className="provider-picker__manual">
            {supportsCatalog ? (
              <button type="button" className="provider-link" onClick={toggleManual}>
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
                    onChange={(event) => {
                      setManualId(event.target.value);
                      setSelectedRow(null);
                      setError(null);
                    }}
                    placeholder="id copied from a log or earlier spawn"
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Original working directory</span>
                  <input
                    className="field__input"
                    value={manualCwd}
                    onChange={(event) => setManualCwd(event.target.value)}
                    placeholder="Required by most providers to reopen a transcript"
                    spellCheck={false}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="provider-details" aria-label="Resume parameters">
        <div className="provider-details__facts">
          <span>
            <span className="caption">provider</span>{" "}
            <span className="mono">{backend.trim() || "—"}</span>
          </span>
          <span>
            <span className="caption">session</span>{" "}
            <span className="mono">{providerId || "—"}</span>
          </span>
          <span>
            <span className="caption">cwd</span>{" "}
            <span className="mono">{providerCwd || "provider default"}</span>
          </span>
          <span>
            <span className="caption">updated</span>{" "}
            <span className="mono">
              {selectedRow?.updatedAt
                ? formatDateTime(selectedRow.updatedAt)
                : "—"}
            </span>
          </span>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional label for the new HLAO session"
              title="Labels are mutable; the provider id is the durable handle."
            />
          </label>
          <SelectField label="Parent" value={parent} onChange={setParent}>
            <option value="">root session</option>
            {parentChoices.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>
                #{candidate.id} /{" "}
                {candidate.name ?? candidate.title ?? candidate.backend}
              </option>
            ))}
          </SelectField>
          <PermissionModeField
            state={state}
            backend={backend.trim()}
            value={mode}
            onChange={setMode}
            placeholder="provider’s persisted mode"
            disabled={pending}
          />
          <div className="provider-details__toggle">
            <ToggleRow
              label="Include the HLAO skill pointer"
              checked={skill}
              onChange={setSkill}
            />
          </div>
        </div>

        <span className="caption">
          {selectedRow?.attached
            ? "This row is live in the instance. Resume returns the existing session as a duplicate; Fork makes a new provider session."
            : "Resuming creates a new HLAO session attached to this provider conversation. Fork copies it instead."}{" "}
          Resume and fork keep the provider’s persisted mode unless a
          permission override is set. The backend’s defaultMode applies only to
          a new session.
        </span>
      </section>

      {error ? (
        <Notice tone="danger" title="Provider session action failed">
          {error}
          {details ? (
            <details className="dialog-details">
              <summary>Adapter stderr / details</summary>
              <pre>{details}</pre>
            </details>
          ) : null}
        </Notice>
      ) : null}
    </DialogShell>
  );
}
