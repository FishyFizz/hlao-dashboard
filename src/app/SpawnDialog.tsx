import { useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  FolderOpen,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "../components/Button";
import { Tag } from "../components/Status";
import {
  canUse,
  store,
  type DashboardState,
  type DirectoryListing,
} from "../store/store";
import type { AgentView, PermissionPolicy } from "../wire/protocol";
import { DialogShell } from "./DialogShell";
import { PolicySelector } from "./PolicySelector";
import { SelectField, ToggleRow } from "./ui";

type PolicyChoice = PermissionPolicy;

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
  const [policy, setPolicy] = useState<PolicyChoice>("allow");
  const [parent, setParent] = useState("");
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
  const supportsBackends = canUse(state, "backends.list");
  const supportsIdempotency = canUse(state, "spawn.idempotency");
  const configError = state.instance?.configError ?? null;
  const parentChoices = Object.values(state.sessions).filter(
    (session) => session.status !== "closed" && session.status !== "failed",
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
      .catch((cause: unknown) => setBrowseError(messageOf(cause)))
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
    setPolicy("allow");
    setParent("");
    setSkill(true);
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
          setBackendsError(
            cause && typeof cause === "object" && "message" in cause
              ? String((cause as { message: unknown }).message)
              : String(cause),
          );
        });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, cwd, supportsBackends]);

  const signature = JSON.stringify({
    backend,
    cwd,
    name,
    prompt,
    policy,
    parent,
    skill,
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
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: cryptoId() };
    }
    const idempotencyKey = supportsIdempotency ? attempt.current.key : undefined;
    void store
      .spawnSession({
        backend: backend.trim(),
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(prompt.trim() ? { prompt, wait: false } : {}),
        permissionPolicy: policy,
        ...(parent ? { parentSessionId: parent } : {}),
        skill,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      })
      .then(() => onClose())
      .catch((cause: unknown) => {
        const message =
          cause && typeof cause === "object" && "message" in cause
            ? String((cause as { message: unknown }).message)
            : String(cause);
        setError(message);
        if (cause && typeof cause === "object" && "details" in cause) {
          const payload = (cause as { details: unknown }).details;
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
              (selectedBackend ? !selectedBackend.available : false)
            }
          >
            {pending ? "Spawning…" : "Spawn session"}
          </Button>
        </>
      }
    >
      <p className="dialog-lede">
        One form, no wizard. Anything left empty is a supervisor default and is
        labelled below. The session is the object; no task is created.
      </p>

      {configError ? (
        <div className="notice notice--danger">
          <TriangleAlert className="icon" />
          <span className="notice__body">
            <span className="notice__title">New spawns are blocked by a config error</span>
            <span>
              {configError} Fix the file and use Reload config; live sessions are
              unaffected.
            </span>
          </span>
        </div>
      ) : null}

      {!supportsBackends ? (
        <div className="notice notice--warn">
          <TriangleAlert className="icon" />
          <span className="notice__body">
            <span className="notice__title">backends.list is not available</span>
            <span>
              This supervisor cannot discover configured backends. Type the backend
              name; the spawn will fail cleanly if it is not configured.
            </span>
          </span>
        </div>
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
            <div className="cwd-browser">
              <div className="cwd-browser__head">
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={!listing?.parent || browseLoading}
                  onPress={() => {
                    if (listing?.parent) loadDirectory(listing.parent);
                  }}
                  title="Parent directory"
                >
                  <ChevronUp className="btn__icon icon" />
                  Up
                </Button>
                <span className="cwd-browser__path" title={listing?.path}>
                  {listing?.path ?? "Loading..."}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={browseLoading}
                  onPress={() => setBrowseOpen(false)}
                  aria-label="Close directory browser"
                >
                  <X className="btn__icon icon" />
                </Button>
              </div>
              {listing && listing.roots.length > 1 ? (
                <div className="cwd-browser__roots">
                  {listing.roots.map((root) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      key={root}
                      onPress={() => loadDirectory(root)}
                    >
                      {root}
                    </Button>
                  ))}
                </div>
              ) : null}
              {browseError ? (
                <p className="cwd-browser__error" role="alert">
                  {browseError}
                </p>
              ) : null}
              <div className="cwd-browser__list">
                {browseLoading ? (
                  <span className="cwd-browser__empty">Loading directories...</span>
                ) : listing?.entries.length ? (
                  listing.entries.map((entry) => (
                    <button
                      type="button"
                      className="cwd-browser__entry"
                      key={entry.path}
                      onClick={() => loadDirectory(entry.path)}
                      title={entry.path}
                    >
                      <FolderOpen className="icon" />
                      <span>{entry.name}</span>
                    </button>
                  ))
                ) : (
                  <span className="cwd-browser__empty">No subdirectories.</span>
                )}
              </div>
              <div className="cwd-browser__foot">
                <span className="caption">
                  {listing ? `${listing.entries.length} folders` : ""}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={!listing || browseLoading}
                  onPress={() => {
                    if (!listing) return;
                    setCwd(listing.path);
                    setBrowseOpen(false);
                  }}
                >
                  Use this folder
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="field">
          <span className="field__label">Permission policy</span>
          <PolicySelector
            value={policy}
            onChange={setPolicy}
            ariaLabel="Spawn permission policy"
          />
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
          enumerable before a session exists. Set them after spawn from the values the
          session advertises. This form deliberately does not invent them.
        </p>
        <div className="form-advanced__facts">
          <span>
            <span className="caption">effective cwd</span>{" "}
            <span className="mono">{cwd.trim() || "supervisor default"}</span>
          </span>
          <span>
            <span className="caption">effective policy</span>{" "}
            <span className="mono">{policy}</span>
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

      {noBackends ? (
        <div className="notice notice--danger">
          <TriangleAlert className="icon" />
          <span className="notice__body">
            <span className="notice__title">No backends are configured</span>
            <span>Fix the HLAO config or install a backend, then reopen this form.</span>
          </span>
        </div>
      ) : null}
      {backendsError ? (
        <div className="notice notice--danger">
          <TriangleAlert className="icon" />
          <span className="notice__body">
            <span className="notice__title">Backend discovery failed</span>
            <span>{backendsError}</span>
          </span>
        </div>
      ) : null}
      {error ? (
        <div className="notice notice--danger">
          <TriangleAlert className="icon" />
          <span className="notice__body">
            <span className="notice__title">Spawn failed</span>
            <span>{error}</span>
            {details ? (
              <details className="dialog-details">
                <summary>Adapter stderr / details</summary>
                <pre>{details}</pre>
              </details>
            ) : null}
          </span>
        </div>
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

function messageOf(cause: unknown): string {
  return cause && typeof cause === "object" && "message" in cause
    ? String((cause as { message: unknown }).message)
    : String(cause);
}

function cryptoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `spawn-${Math.random().toString(16).slice(2)}`;
}
