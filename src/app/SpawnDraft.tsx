import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FolderOpen, History, Play } from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Notice } from "../components/Notice";
import { Tag } from "../components/Status";
import {
  canUse,
  store,
  type DashboardState,
  type DirectoryListing,
} from "../store/store";
import { isTerminalStatus } from "../store/model";
import type { AgentView } from "../wire/protocol";
import { asWireError, CAPABILITIES } from "../wire/protocol";
import { newId } from "../lib/id";
import { CwdBrowser } from "./CwdBrowser";
import { PermissionModeField } from "./PermissionModeField";
import { SelectField, ToggleRow } from "./ui";

/**
 * The temporary view a spawn opens. It is shaped like the session lens it will
 * become: a header, a draft body, and the same composer. Nothing exists on the
 * supervisor until the operator starts the session, so there is no handle, no
 * transcript, and no task — only start parameters and a first prompt.
 */
export function SpawnDraft({
  state,
  onClose,
  onResume,
}: {
  state: DashboardState;
  onClose: () => void;
  onResume: () => void;
}) {
  const [backend, setBackend] = useState(state.local.lastBackend ?? "");
  const [cwd, setCwd] = useState(state.local.lastCwd ?? "");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [parent, setParent] = useState("");
  const [mode, setMode] = useState("");
  const [skill, setSkill] = useState(true);
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
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  const pending = Boolean(state.pending.spawn);
  const supportsBackends = canUse(state, CAPABILITIES.backendsList);
  const supportsIdempotency = canUse(state, CAPABILITIES.spawnIdempotency);
  const configError = state.instance?.configError ?? null;
  const parentChoices = Object.values(state.sessions).filter(
    (session) => !isTerminalStatus(session.status),
  );
  const selectedBackend = backends?.find((candidate) => candidate.name === backend);
  const noBackends = supportsBackends && backends !== null && backends.length === 0;
  const canBrowse = state.mode === "bridge";
  const canStart =
    !pending &&
    !configError &&
    Boolean(backend.trim()) &&
    !noBackends &&
    !(supportsBackends && loadingBackends) &&
    !(selectedBackend ? !selectedBackend.available : false);

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
    if (!supportsBackends) return;
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
  }, [cwd, supportsBackends]);

  const signature = JSON.stringify({
    backend,
    cwd,
    name,
    prompt,
    parent,
    mode,
    skill,
  });

  const submit = () => {
    if (!canStart) return;
    setError(null);
    setDetails(null);
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: newId("spawn") };
    }
    const idempotencyKey = supportsIdempotency ? attempt.current.key : undefined;
    void store
      .spawnSession({
        backend: backend.trim(),
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(prompt.trim() ? { prompt, wait: false } : {}),
        ...(parent ? { parentSessionId: parent } : {}),
        ...(mode.trim() ? { mode: mode.trim() } : {}),
        skill,
        ...(idempotencyKey ? { idempotencyKey } : {}),
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
    <>
      <main className="dash-main">
        <div className="session-lens spawn-draft">
      <header className="session-head">
        <div className="session-head__identity">
          <IconButton
            className="session-head__back"
            aria-label="Discard this draft and return to the fleet"
            onPress={onClose}
          >
            <ChevronLeft className="icon" />
          </IconButton>
          <div className="session-head__text">
            <div className="session-head__line">
              <Tag tone="accent">draft</Tag>
              <h1 className="session-head__name">New session</h1>
              {backend.trim() ? <Tag className="ident">{backend.trim()}</Tag> : null}
            </div>
          </div>
        </div>
        <div className="session-head__actions">
          <Button
            size="sm"
            variant="ghost"
            onPress={onResume}
            title="Open the provider catalog to resume or fork an existing session"
          >
            <History className="btn__icon icon" />
            Resume or fork…
          </Button>
          <Button size="sm" variant="ghost" onPress={onClose} isDisabled={pending}>
            Discard
          </Button>
        </div>
      </header>

      <div className="spawn-draft__scroll">
        <section className="spawn-draft__lede">
          <span className="spawn-draft__kicker">Not started</span>
          <h2>Start a session from a first prompt.</h2>
          <p>
            This view is a draft. No session, handle, or task exists until the
            start below succeeds. The prompt becomes the first turn; everything
            left empty is a supervisor default.
          </p>
        </section>

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

        <section className="spawn-draft__params" aria-label="Start parameters">
          <div className="spawn-draft__params-head">
            <span>Start parameters</span>
            <span>applied to this spawn only</span>
          </div>
          <div className="form-grid">
            <div>
              {supportsBackends ? (
                <SelectField
                  label="Backend *"
                  value={backend}
                  onChange={setBackend}
                  disabled={pending || loadingBackends}
                >
                  {backends?.length ? null : (
                    <option value="">No backends loaded</option>
                  )}
                  {backends?.map((candidate) => (
                    <option
                      value={candidate.name}
                      key={candidate.name}
                      disabled={!candidate.available}
                    >
                      {candidate.name}
                      {candidate.available
                        ? ""
                        : ` / ${candidate.unavailableReason ?? "unavailable"}`}
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
              <label className="field__label" htmlFor="spawn-draft-cwd">
                Working directory
              </label>
              <div className="field__with-action">
                <input
                  id="spawn-draft-cwd"
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
            </div>

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
              placeholder={
                selectedBackend?.defaultMode
                  ? `backend default · ${selectedBackend.defaultMode}`
                  : "provider default"
              }
              disabled={pending}
            />

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
              Provider modes, model, and config options are provider-native and
              may not be enumerable before a session exists. This view
              deliberately does not invent them; set them after the session
              starts from the values it advertises.
            </p>
            <div className="form-advanced__facts">
              <span>
                <span className="caption">effective cwd</span>{" "}
                <span className="mono">
                  {cwd.trim() || "supervisor default"}
                </span>
              </span>
              <span>
                <span className="caption">parent</span>{" "}
                <span className="mono">{parent || "root"}</span>
              </span>
              <span>
                <span className="caption">idempotency</span>{" "}
                <span className="mono">
                  {supportsIdempotency ? "on · key per attempt" : "not supported"}
                </span>
              </span>
            </div>
          </details>
        </section>

        {noBackends ? (
          <Notice tone="danger" title="No backends are configured">
            Fix the HLAO config or install a backend, then reopen this draft.
          </Notice>
        ) : null}
        {backendsError ? (
          <Notice tone="danger" title="Backend discovery failed">
            {backendsError}
          </Notice>
        ) : null}
      </div>

      <section className="composer spawn-draft__composer" aria-label="Composer">
        {error ? (
          <Notice
            tone="danger"
            title="Spawn failed"
            className="spawn-draft__error"
          >
            {error}
            {details ? (
              <details className="dialog-details">
                <summary>Adapter stderr / details</summary>
                <pre>{details}</pre>
              </details>
            ) : null}
          </Notice>
        ) : null}
        <div className="composer__box">
          <textarea
            className="composer__input"
            value={prompt}
            rows={3}
            placeholder="Write the first prompt. Ctrl/Cmd+Enter starts the session."
            aria-label="First prompt"
            title="Optional. It becomes the first turn of the session being started."
            autoFocus
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="composer__actions">
            <span className="composer__hint">
              Starting creates the session and sends the prompt
              {prompt.trim() ? "" : " — with no prompt, the session just starts"}.
            </span>
            <span className="composer__count">
              {prompt.length.toLocaleString()} chars
            </span>
            <Button
              size="sm"
              variant="primary"
              isDisabled={!canStart}
              onPress={submit}
              aria-label="Start the session"
            >
              <Play className="btn__icon icon" />
              {pending ? "Starting…" : "Start session"}
            </Button>
          </div>
        </div>

      </section>
        </div>
      </main>
      <aside className="dash-inspector" aria-label="New session draft">
        <div className="inspector">
          <section className="inspector__section">
            <div className="inspector__head">
              <span>Draft</span>
              <span>not started</span>
            </div>
            <p className="inspector__note">
              A local draft. Starting creates the session; discarding leaves the
              instance unchanged.
            </p>
          </section>
          <section className="inspector__section">
            <div className="inspector__head">
              <span>Start parameters</span>
            </div>
            <div className="inspector__rows inspector__rows--tight">
              <DraftFact
                label="backend"
                value={backend.trim() || "not chosen"}
                mono
              />
              <DraftFact
                label="cwd"
                value={cwd.trim() || "supervisor default"}
                mono
              />
              <DraftFact label="name" value={name.trim() || "—"} />
              <DraftFact
                label="parent"
                value={parent ? `#${parent}` : "root"}
                mono
              />
              <DraftFact
                label="mode"
                value={
                  mode.trim() ||
                  (selectedBackend?.defaultMode
                    ? `backend default · ${selectedBackend.defaultMode}`
                    : "provider default")
                }
                mono
              />
              <DraftFact
                label="skill"
                value={skill ? "included" : "excluded"}
              />
            </div>
          </section>
          <section className="inspector__section">
            <div className="inspector__head">
              <span>Next</span>
            </div>
            <p className="inspector__note">
              Type the first prompt in the composer. Ctrl/Cmd+Enter starts; an
              empty prompt starts an idle session.
            </p>
            <p className="inspector__note">
              Need an existing provider conversation?{" "}
              <button type="button" className="provider-link" onClick={onResume}>
                Resume or fork…
              </button>
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}

function DraftFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="inspector__row">
      <span className="inspector__label">{label}</span>
      <span
        className={mono ? "inspector__value mono" : "inspector__value"}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
