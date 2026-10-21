import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { Tag } from "../components/Status";
import {
  canUse,
  store,
  type DashboardState,
  type DirectoryListing,
} from "../store/store";
import type { AgentView, ProviderSessionView } from "../wire/protocol";
import { asWireError, CAPABILITIES } from "../wire/protocol";
import { isTerminalStatus } from "../store/model";
import { newId } from "../lib/id";
import { DialogShell } from "./DialogShell";
import { CwdBrowser } from "./CwdBrowser";
import { SelectField, ToggleRow } from "./ui";

/**
 * Compare the form cwd with the provider row's cwd without a path module in
 * the browser. Windows drive paths are case-insensitive; separators and a
 * trailing slash are normalized.
 */
function sameCwd(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/[\\/]+$/, "");
  const a = normalize(left);
  const b = normalize(right);
  const windows = /^[A-Za-z]:/.test(a) || /^[A-Za-z]:/.test(b);
  if (!windows) return a === b;
  return (
    a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase()
  );
}

export function SpawnDialog({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: DashboardState;
  onClose: () => void;
}) {
  const [backend, setBackend] = useState("");
  const [cwd, setCwd] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [parent, setParent] = useState("");
  const [skill, setSkill] = useState(true);
  const [providerMode, setProviderMode] = useState<"new" | "resume" | "fork">("new");
  const [providerId, setProviderId] = useState("");
  const [providerRows, setProviderRows] = useState<ProviderSessionView[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [selectedProviderRow, setSelectedProviderRow] = useState("");
  const [selectedProviderSnapshot, setSelectedProviderSnapshot] =
    useState<ProviderSessionView | null>(null);
  const [providerAll, setProviderAll] = useState(false);
  const [providerRefresh, setProviderRefresh] = useState(0);
  const [backends, setBackends] = useState<AgentView[] | null>(null);
  const [backendsError, setBackendsError] = useState<string | null>(null);
  const [loadingBackends, setLoadingBackends] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const backendList = useRef(0);
  const providerLookup = useRef(0);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const pending = Boolean(state.pending.spawn);
  const supportsBackends = canUse(state, CAPABILITIES.backendsList);
  const supportsProviderCatalog = canUse(state, CAPABILITIES.providerSessions);
  const supportsIdempotency = canUse(state, CAPABILITIES.spawnIdempotency);
  const supportsResume = canUse(state, CAPABILITIES.spawnResume);
  const supportsFork = canUse(state, CAPABILITIES.spawnFork);
  const providerSessions = Object.values(state.sessions).filter(
    (session) => Boolean(session.agentSessionId),
  );
  const chosenProvider =
    providerRows.find((row) => row.sessionId === providerId.trim()) ??
    (selectedProviderSnapshot?.sessionId === providerId.trim()
      ? selectedProviderSnapshot
      : undefined);
  const configError = state.instance?.configError ?? null;
  const parentChoices = Object.values(state.sessions).filter(
    (session) => !isTerminalStatus(session.status),
  );
  const selectedBackend = backends?.find((candidate) => candidate.name === backend);
  const noBackends = supportsBackends && backends !== null && backends.length === 0;
  const canBrowse = state.mode === "bridge";

  const loadDirectory = (path?: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    void store
      .listDirectories(path)
      .then((result) => setListing(result))
      .catch((cause: unknown) => setBrowseError(asWireError(cause).message))
      .finally(() => setBrowseLoading(false));
  };

  const openDirectoryBrowser = () => {
    setBrowseOpen(true);
    loadDirectory(cwd.trim() || undefined);
  };

  useEffect(() => {
    if (!open) return;
    setBackend(state.local.lastBackend ?? "");
    setCwd(state.local.lastCwd ?? "");
    setName("");
    setPrompt("");
    setParent("");
    setSkill(true);
    setProviderMode("new");
    setProviderId("");
    setProviderRows([]);
    setProviderError(null);
    setProviderLoading(false);
    setSelectedProviderRow("");
    setSelectedProviderSnapshot(null);
    setProviderAll(false);
    setProviderRefresh(0);
    setError(null);
    setDetails(null);
    setBrowseOpen(false);
    setListing(null);
    setBrowseError(null);
    attempt.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !supportsBackends) return;
    const token = ++backendList.current;
    const timer = window.setTimeout(() => {
      setLoadingBackends(true);
      setBackendsError(null);
      void store
        .listBackends(cwd.trim() || undefined)
        .then((result) => {
          if (token !== backendList.current) return;
          setBackends(result.backends);
          setLoadingBackends(false);
          setBackend((current) => {
            if (current && result.backends.some((item) => item.name === current)) {
              return current;
            }
            return (
              result.backends.find((item) => item.available)?.name ??
              result.backends[0]?.name ??
              ""
            );
          });
        })
        .catch((cause) => {
          if (token !== backendList.current) return;
          setLoadingBackends(false);
          setBackendsError(asWireError(cause).message);
        });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, cwd, supportsBackends]);

  // The provider catalog is an on-demand read that starts an adapter. Load it
  // only when the operator is actually choosing a provider session.
  useEffect(() => {
    if (!open || providerMode === "new" || !supportsProviderCatalog) return;
    if (!backend.trim()) {
      setProviderRows([]);
      return;
    }
    const token = ++providerLookup.current;
    const timer = window.setTimeout(() => {
      setProviderLoading(true);
      setProviderError(null);
      void store
        .listProviderSessions(
          backend.trim(),
          providerAll ? undefined : cwd.trim() || undefined,
        )
        .then((result) => {
          if (token !== providerLookup.current) return;
          setProviderRows(result.sessions);
          setProviderLoading(false);
          setSelectedProviderRow((current) =>
            result.sessions.some((row) => row.sessionId === current)
              ? current
              : "",
          );
          // Keep the selected row's cwd/mode for validation even when a later
          // catalog page no longer lists it.
          setSelectedProviderSnapshot((current) => {
            if (current === null) return null;
            return (
              result.sessions.find(
                (row) => row.sessionId === current.sessionId,
              ) ?? current
            );
          });
        })
        .catch((cause: unknown) => {
          if (token !== providerLookup.current) return;
          setProviderLoading(false);
          setProviderRows([]);
          setProviderError(asWireError(cause).message);
        });
    }, 320);
    return () => window.clearTimeout(timer);
    // Intentionally not keyed on cwd: each catalog read starts an adapter, and
    // editing the cwd must not drop the row the operator just selected. The
    // explicit Refresh control re-scopes to the current cwd (or all cwds).
  }, [open, providerMode, backend, providerAll, providerRefresh, supportsProviderCatalog]);

  const chooseProviderRow = (sessionId: string) => {
    setSelectedProviderRow(sessionId);
    const row = providerRows.find((candidate) => candidate.sessionId === sessionId);
    if (row === undefined) return;
    setProviderId(row.sessionId);
    setSelectedProviderSnapshot(row);
    // The provider row's cwd is the safe default; a later edit is validated
    // against it before the spawn request is sent.
    setCwd(row.cwd);
    setError(null);
  };

  const selectedRowUsable =
    chosenProvider === undefined ||
    (providerMode === "resume"
      ? chosenProvider.loadable
      : providerMode === "fork"
        ? chosenProvider.forkable
        : true);

  const signature = JSON.stringify({
    backend,
    cwd,
    name,
    prompt,
    parent,
    skill,
    providerMode,
    providerId,
  });

  const submit = () => {
    if (pending || configError) return;
    setError(null);
    setDetails(null);
    if (!backend.trim()) {
      setError("A backend is required.");
      return;
    }
    if (selectedBackend && !selectedBackend.available) {
      setError(
        selectedBackend.unavailableReason ?? `${backend} is unavailable.`,
      );
      return;
    }
    if (providerMode !== "new") {
      if (!providerId.trim()) {
        setError("A provider session id is required to resume or fork.");
        return;
      }
      if (providerMode === "resume" && !supportsResume) {
        setError("This supervisor does not advertise spawn.resume.");
        return;
      }
      if (providerMode === "fork" && !supportsFork) {
        setError("This supervisor does not advertise spawn.fork.");
        return;
      }
      if (chosenProvider !== undefined) {
        if (providerMode === "resume" && !chosenProvider.loadable) {
          setError(
            `The adapter did not advertise loadSession for ${chosenProvider.sessionId}; it cannot be resumed.`,
          );
          return;
        }
        if (providerMode === "fork" && !chosenProvider.forkable) {
          setError(
            `The adapter did not advertise session/fork for ${chosenProvider.sessionId}; it cannot be copied.`,
          );
          return;
        }
        if (cwd.trim() && !sameCwd(cwd, chosenProvider.cwd)) {
          setError(
            `Provider session ${chosenProvider.sessionId} belongs to ${chosenProvider.cwd}. Clear the working directory to use the provider's cwd, or choose a different session.`,
          );
          return;
        }
      }
    }
    const effectiveCwd =
      providerMode !== "new" && chosenProvider !== undefined
        ? chosenProvider.cwd
        : cwd.trim() || undefined;
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: newId("spawn") };
    }
    const idempotencyKey = supportsIdempotency ? attempt.current.key : undefined;
    void store
      .spawnSession({
        backend: backend.trim(),
        ...(effectiveCwd ? { cwd: effectiveCwd } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(prompt.trim() ? { prompt, wait: false } : {}),
        ...(parent ? { parentSessionId: parent } : {}),
        skill,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(providerMode === "resume" && providerId.trim()
          ? { resumeSessionId: providerId.trim() }
          : {}),
        ...(providerMode === "fork" && providerId.trim()
          ? { forkSessionId: providerId.trim() }
          : {}),
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

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="New session"
      title="Spawn a session"
      wide
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isDisabled={
              pending ||
              Boolean(configError) ||
              noBackends ||
              (supportsBackends && loadingBackends) ||
              !selectedRowUsable ||
              (selectedBackend ? !selectedBackend.available : false)
            }
          >
            {pending
              ? providerMode === "new"
                ? "Spawning…"
                : "Attaching…"
              : providerMode === "resume"
                ? "Resume session"
                : providerMode === "fork"
                  ? "Fork session"
                  : "Spawn session"}
          </Button>
        </>
      }
    >
      <p className="dialog-lede">
        One form, no wizard. Anything left empty is a supervisor default and is
        labelled below. The session is the object; no task is created.
      </p>

      {configError ? (
        <Notice tone="danger" title="New spawns are blocked by a config error">
          {configError} Fix the file and use Reload config; live sessions are
          unaffected.
        </Notice>
      ) : null}

      {!supportsBackends ? (
        <Notice tone="warn" title="backends.list is not available">
          This supervisor cannot discover configured backends. Type the backend
          name; the spawn will fail cleanly if it is not configured.
        </Notice>
      ) : null}

      <div className="form-grid">
        <div className="form-grid__wide">
          <label className="field">
            <span className="field__label">First prompt</span>
            <textarea
              className="field__textarea"
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Optional. Sent after the session initializes."
              autoFocus
              title="Sent once; a retry reuses the spawn idempotency key when supported."
            />
          </label>
        </div>

        <div>
          {supportsBackends ? (
            <SelectField
              label="Backend *"
              value={backend}
              onChange={setBackend}
              disabled={pending || loadingBackends}
            >
              {backends?.length ? null : <option value="">No backends loaded</option>}
              {backends?.map((candidate) => (
                <option
                  value={candidate.name}
                  key={candidate.name}
                  disabled={!candidate.available}
                >
                  {candidate.name}
                  {candidate.available ? "" : ` / ${candidate.unavailableReason ?? "unavailable"}`}
                </option>
              ))}
            </SelectField>
          ) : (
            <label className="field">
              <span className="field__label">Backend *</span>
              <input
                className="field__input"
                value={backend}
                onChange={(event) => setBackend(event.target.value)}
                placeholder="claude"
              />
            </label>
          )}
          {selectedBackend ? (
            <span className="caption">
              {providerMode === "new"
                ? selectedBackend.defaultMode
                  ? `New sessions start in the backend default mode “${selectedBackend.defaultMode}”; change it after spawn.`
                  : "No backend default mode is set; the provider chooses the start mode for a new session."
                : "A resumed or forked session keeps the provider's persisted mode."}
            </span>
          ) : null}
        </div>

        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional operator label"
            title="Labels are mutable; the handle is identity."
          />
        </label>

        <div className="field form-grid__wide">
          <label className="field__label" htmlFor="spawn-cwd">
            Working directory
          </label>
          <div className="field__with-action">
            <input
              id="spawn-cwd"
              className="field__input"
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="Supervisor default cwd"
              spellCheck={false}
              title="Absolute path. Changing it refreshes backends for project config."
            />
            {canBrowse ? (
              <Button
                size="sm"
                variant="secondary"
                onPress={openDirectoryBrowser}
                title="Browse local directories through the bridge"
              >
                <FolderOpen className="btn__icon icon" />
                Browse
              </Button>
            ) : null}
          </div>
          {browseOpen ? (
            <CwdBrowser
              listing={listing}
              loading={browseLoading}
              error={browseError}
              onNavigate={loadDirectory}
              onUse={(path) => {
                setCwd(path);
                setBrowseOpen(false);
              }}
              onClose={() => setBrowseOpen(false)}
            />
          ) : null}
          {providerMode !== "new" && chosenProvider ? (
            <span className="caption">
              Provider cwd: <span className="mono">{chosenProvider.cwd}</span>.
              A different directory is refused before the adapter starts.
            </span>
          ) : null}
        </div>

        <SelectField
          label="Parent"
          value={parent}
          onChange={setParent}
        >
          <option value="">root session</option>
          {parentChoices.map((candidate) => (
            <option value={candidate.id} key={candidate.id}>
              #{candidate.id} / {candidate.name ?? candidate.title ?? candidate.backend}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Provider session"
          value={providerMode}
          onChange={(value) =>
            setProviderMode(value as "new" | "resume" | "fork")
          }
          disabled={pending}
        >
          <option value="new">new session</option>
          <option value="resume" disabled={!supportsResume}>
            resume an existing one{supportsResume ? "" : " (unsupported)"}
          </option>
          <option value="fork" disabled={!supportsFork}>
            fork a copy{supportsFork ? "" : " (unsupported)"}
          </option>
        </SelectField>

        {providerMode !== "new" ? (
          <div className="field form-grid__wide">
            <span className="field__label">Provider session</span>
            {supportsProviderCatalog ? (
              <>
                <div className="field__with-action">
                  <select
                    className="field__input app-select"
                    value={selectedProviderRow}
                    aria-label="Provider session from the provider catalog"
                    disabled={pending || providerLoading || providerRows.length === 0}
                    onChange={(event) => chooseProviderRow(event.target.value)}
                  >
                    <option value="">
                      {providerLoading
                        ? "Reading the provider catalog…"
                        : providerRows.length === 0
                          ? "No provider sessions reported"
                          : "— choose a provider session —"}
                    </option>
                    {providerRows.map((row) => {
                      const usable =
                        providerMode === "resume" ? row.loadable : row.forkable;
                      const suffix = row.attached
                        ? ` · live #${row.hlaoSessionId ?? "?"}${
                            row.hlaoName ? ` (${row.hlaoName})` : ""
                          }`
                        : " · provider-only";
                      return (
                        <option
                          key={row.sessionId}
                          value={row.sessionId}
                          disabled={!usable}
                        >
                          {(row.title ?? row.sessionId)} · {row.cwd}
                          {suffix}
                          {usable
                            ? ""
                            : providerMode === "resume"
                              ? " · cannot load"
                              : " · cannot fork"}
                        </option>
                      );
                    })}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => setProviderRefresh((value) => value + 1)}
                    isDisabled={pending || providerLoading}
                    title="Read the provider catalog again"
                  >
                    <RefreshCw className="btn__icon icon" />
                    Refresh
                  </Button>
                </div>
                <span className="caption">
                  The provider catalog is read on demand. Refresh re-scopes to
                  the current cwd
                  {providerAll || !cwd.trim() ? " (all cwds)" : ""}; a selected
                  row always supplies its own cwd.
                </span>
                {providerError ? (
                  <Notice tone="warn" title="Provider catalog unavailable">
                    {providerError} Paste the provider id and its original cwd
                    below.
                  </Notice>
                ) : null}
                {!providerError && !providerLoading && providerRows.length === 0 ? (
                  <span className="caption">
                    No provider sessions reported for this backend
                    {!providerAll && cwd.trim() ? " and working directory" : ""}.
                    Paste an id below, change the backend, or refresh.
                  </span>
                ) : null}
                <ToggleRow
                  label="Search all working directories"
                  description="The catalog is read across cwds; a selected row still supplies its own cwd."
                  checked={providerAll}
                  onChange={setProviderAll}
                  disabled={pending || providerLoading}
                />
                {chosenProvider ? (
                  <span className="caption">
                    {chosenProvider.attached
                      ? `Live in this instance as #${chosenProvider.hlaoSessionId ?? "?"}${
                          chosenProvider.hlaoName
                            ? ` (${chosenProvider.hlaoName})`
                            : ""
                        }. `
                      : "Provider-only row; adopting it creates a new HLAO session. "}
                    {providerMode === "fork"
                      ? "The copy keeps the source untouched."
                      : "The provider row supplies the cwd and mode."}
                  </span>
                ) : null}
              </>
            ) : (
              <Notice tone="warn" title="Provider discovery is not available">
                This supervisor predates <span className="mono">backends.sessions</span>.
                Paste the provider id and its original cwd.
              </Notice>
            )}
            <label className="field__label" htmlFor="spawn-provider">
              Provider session id
            </label>
            <input
              id="spawn-provider"
              className="field__input"
              value={providerId}
              onChange={(event) => {
                const value = event.target.value;
                setProviderId(value);
                const row = providerRows.find(
                  (candidate) => candidate.sessionId === value,
                );
                setSelectedProviderRow(row === undefined ? "" : value);
                setSelectedProviderSnapshot(row ?? null);
              }}
              placeholder="The id an earlier spawn reported as provider"
              spellCheck={false}
              list="spawn-provider-sessions"
            />
            <datalist id="spawn-provider-sessions">
              {providerSessions.map((candidate) => (
                <option
                  key={candidate.id}
                  value={candidate.agentSessionId ?? ""}
                >
                  #{candidate.id} / {candidate.name ?? candidate.title ?? candidate.backend}
                </option>
              ))}
            </datalist>
            <span className="caption">
              {providerMode === "resume"
                ? "Reopens the provider session and replays its history. The interrupted turn is not replayed; send the prompt again. A row chosen from the provider catalog supplies the cwd and mode."
                : "Copies the provider session into a new one. The source keeps running untouched. A row chosen from the provider catalog supplies the cwd and mode."}
            </span>
          </div>
        ) : null}

        <div className="form-grid__wide">
          <ToggleRow
            label="Include the HLAO skill pointer"
            checked={skill}
            onChange={setSkill}
          />
        </div>
      </div>

      <details className="form-advanced">
        <summary>Advanced</summary>
        <p>
          Provider modes, model, and config options are provider-native and may not be
          enumerable before a session exists. A new session starts in the backend’s
          operator default mode when the manifest sets one, then the provider’s own
          default. A resumed or forked session keeps the provider’s persisted mode.
          Set a different mode after spawn from the values the session advertises.
          This form deliberately does not invent them.
        </p>
        <div className="form-advanced__facts">
          <span>
            <span className="caption">effective cwd</span>{" "}
            <span className="mono">
              {providerMode !== "new" && chosenProvider
                ? chosenProvider.cwd
                : cwd.trim() || "supervisor default"}
            </span>
          </span>
          <span>
            <span className="caption">provider mode</span>{" "}
            <span className="mono">
              {providerMode !== "new"
                ? "provider's persisted mode"
                : selectedBackend?.defaultMode
                  ? `backend default · ${selectedBackend.defaultMode}`
                  : "provider default"}
            </span>
          </span>
          <span>
            <span className="caption">parent</span>{" "}
            <span className="mono">{parent || "root"}</span>
          </span>
          <span>
            <span className="caption">provider</span>{" "}
            <span className="mono">
              {providerMode === "new"
                ? "new session"
                : `${providerMode} ${providerId.trim() || "—"}`}
            </span>
          </span>
          <span>
            <span className="caption">idempotency</span>{" "}
            <span className="mono">
              {supportsIdempotency ? "on · key per attempt" : "not supported"}
            </span>
          </span>
        </div>
      </details>

      {noBackends ? (
        <Notice tone="danger" title="No backends are configured">
          Fix the HLAO config or install a backend, then reopen this form.
        </Notice>
      ) : null}
      {backendsError ? (
        <Notice tone="danger" title="Backend discovery failed">
          {backendsError}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" title="Spawn failed">
          {error}
          {details ? (
            <details className="dialog-details">
              <summary>Adapter stderr / details</summary>
              <pre>{details}</pre>
            </details>
          ) : null}
        </Notice>
      ) : null}

      <div className="spawn-foot">
        <Tag>{state.mode === "demo" ? "demo supervisor" : "local supervisor"}</Tag>
        <Tag>{supportsBackends ? "backends discovered" : "typed backend"}</Tag>
        <span className="caption">
          The form is preserved on failure; retry is idempotent when supported.
        </span>
        {loadingBackends ? (
          <span className="caption">
            <RefreshCw className="icon" /> refreshing
          </span>
        ) : null}
      </div>
    </DialogShell>
  );
}
