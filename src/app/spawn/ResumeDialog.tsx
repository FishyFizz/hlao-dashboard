import { useEffect, useRef, useState } from "react";
import { GitFork, Play } from "lucide-react";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import {
  activeSessions,
  canUse,
  store,
  type DashboardState,
} from "../../store/store";
import { formatDateTime } from "../../store/model";
import type { ProviderSessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import { DialogShell } from "../DialogShell";
import { SelectField, ToggleRow } from "../ui";
import { canForkProviderRow, canResumeProviderRow } from "./providerSessions";
import { PermissionModeField } from "./PermissionModeField";
import { ProviderPicker } from "./ProviderPicker";
import { SpawnErrorNotice } from "./SpawnErrorNotice";
import { spawnFailure } from "./errors";
import { spawnIdempotencyKey, useSpawnAttempt } from "./attempt";
import { useBackendCatalog } from "./useBackendCatalog";
import { useProviderCatalog } from "./useProviderCatalog";

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
  const [backend, setBackend] = useState("");
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
  const attempt = useSpawnAttempt();
  const prefillApplied = useRef(false);

  const pending = Boolean(state.pending.spawn);
  const supportsBackends = canUse(state, CAPABILITIES.backendsList);
  const supportsCatalog = canUse(state, CAPABILITIES.providerSessions);
  const supportsResume = canUse(state, CAPABILITIES.spawnResume);
  const supportsFork = canUse(state, CAPABILITIES.spawnFork);
  const supportsIdempotency = canUse(state, CAPABILITIES.spawnIdempotency);
  const configError = state.instance?.configError ?? null;
  const parentChoices = activeSessions(state);

  const backendCatalog = useBackendCatalog({
    enabled: open && supportsBackends,
    cwd: state.local.lastCwd || undefined,
  });
  const catalog = useProviderCatalog(backend, open && supportsCatalog);

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

  // Opening resets the whole surface. The backend list is loaded by the
  // catalog hook; this only establishes the initial selection.
  useEffect(() => {
    if (!open) return;
    const initialParent =
      initial?.parentSessionId !== undefined &&
      initial?.parentSessionId !== null &&
      state.sessions[initial.parentSessionId] !== undefined &&
      activeSessions(state).some((session) => session.id === initial.parentSessionId)
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
    setError(null);
    setDetails(null);
    attempt.current = null;
    setBackend(initial?.backend.trim() ?? state.local.lastBackend ?? "");
    // The reset is intentionally tied to opening the dialog, not to every
    // local-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // A provider switch invalidates the selected row; catalog rows are reset by
  // the hook itself.
  useEffect(() => {
    setSelectedRow(null);
  }, [backend]);

  // The catalog could not be read; reveal the manual id fields once. The
  // operator may still switch back to the catalog.
  useEffect(() => {
    if (catalog.needsManual) setManual(true);
  }, [catalog.needsManual]);

  // Keep the selected row's facts current, but do not drop the selection when
  // a later page no longer lists the row.
  useEffect(() => {
    setSelectedRow((current) =>
      current === null
        ? null
        : catalog.rows.find((row) => row.sessionId === current.sessionId) ?? current,
    );
  }, [catalog.rows]);

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
    const row = catalog.rows.find((candidate) => candidate.sessionId === initial.providerId);
    if (row === undefined) return;
    prefillApplied.current = true;
    setSelectedRow(row);
    setManual(false);
    setManualId("");
  }, [open, initial, catalog.rows]);

  // The recorded backend is kept visible even when the current manifest marks
  // it unavailable, so the failure is explicit and the id/cwd are kept.
  useEffect(() => {
    const backends = backendCatalog.backends;
    if (!backends) return;
    setBackend((current) => {
      for (const candidate of [
        current,
        initial?.backend.trim(),
        state.local.lastBackend,
      ]) {
        if (!candidate) continue;
        const match = backends.find(
          (item) => item.name === candidate && item.available,
        );
        if (match) return match.name;
      }
      const recorded = initial?.backend.trim();
      if (recorded) {
        const match = backends.find((item) => item.name === recorded);
        if (match) return match.name;
      }
      return backends.find((item) => item.available)?.name ?? "";
    });
  }, [backendCatalog.backends, initial?.backend, state.local.lastBackend]);

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
    const idempotencyKey = spawnIdempotencyKey(
      attempt,
      signatureFor(action),
      supportsIdempotency,
    );
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
        const failure = spawnFailure(cause);
        setError(failure.message);
        setDetails(failure.details);
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

      <ProviderPicker
        pending={pending}
        backendCatalog={backendCatalog}
        backend={backend}
        onBackend={setBackend}
        supportsBackends={supportsBackends}
        supportsCatalog={supportsCatalog}
        catalog={catalog}
        query={query}
        onQuery={setQuery}
        selectedRow={selectedRow}
        onSelectRow={chooseRow}
        showManual={showManual}
        onToggleManual={toggleManual}
        manualId={manualId}
        onManualId={setManualId}
        manualCwd={manualCwd}
        onManualCwd={setManualCwd}
      />

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
        <SpawnErrorNotice
          title="Provider session action failed"
          message={error}
          details={details}
        />
      ) : null}
    </DialogShell>
  );
}
