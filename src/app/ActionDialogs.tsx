import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { Handle } from "../components/Status";
import { store, type DashboardState } from "../store/store";
import { descendantsOf, displayLabel, formatDateTime, isTerminalStatus } from "../store/model";
import type { QueueItemView, QueueResult, SessionView } from "../wire/protocol";
import { ConfirmDialog } from "./ConfirmDialog";
import { DialogShell } from "./DialogShell";
import { ToggleRow } from "./ui";

export function StopDialog({
  open,
  session,
  queue,
  onClose,
  onConfirm,
}: {
  open: boolean;
  session: SessionView;
  queue: QueueResult | null;
  onClose: () => void;
  onConfirm: (keepQueue: boolean) => void;
}) {
  const pending = Boolean(store.getSnapshot().pending.cancel);
  const active = queue?.active ?? null;
  const queued = queue?.queue ?? [];
  const count = Math.max(queued.length, session.queued);
  const previewsIncomplete = queued.length < session.queued;
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker={`Session #${session.id}`}
      title="Stop the active turn"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            Cancel
          </Button>
          {count > 0 ? (
            <>
              <Button onPress={() => onConfirm(true)} isDisabled={pending}>
                Stop turn, keep queue
              </Button>
              <Button variant="danger" onPress={() => onConfirm(false)} isDisabled={pending}>
                {pending ? "Working…" : `Stop and discard ${count}`}
              </Button>
            </>
          ) : (
            <Button variant="danger" onPress={() => onConfirm(false)} isDisabled={pending}>
              {pending ? "Working…" : "Stop turn"}
            </Button>
          )}
        </>
      }
    >
      <p className="dialog-lede">
        Cancelling ends the active turn and resolves every pending permission as
        cancelled. The session stays alive and can run another turn.
      </p>
      {active ? (
        <div className="stop-target">
          <span className="stop-target__label">Active turn · {session.turn}</span>
          <span className="stop-target__text">{active.textPreview}</span>
          <span className="stop-target__meta">
            {active.from} · {active.id}
          </span>
        </div>
      ) : null}
      {count > 0 ? (
        <>
          <div className="stop-target__label">
            {count} queued prompt{count === 1 ? "" : "s"} · discard is permanent
          </div>
          <div className="stop-queue">
            {queued.map((item) => (
              <div className="stop-queue__item" key={item.id}>
                <span className="stop-queue__pos">{item.position}</span>
                <span className="stop-queue__text">{item.textPreview}</span>
                <span className="stop-queue__meta">{item.id}</span>
              </div>
            ))}
          </div>
          {previewsIncomplete ? (
            <p className="dialog-note">
              The queue snapshot is incomplete; the session view reports {count}{" "}
              queued. The discard action still targets every queued prompt.
            </p>
          ) : null}
          <p className="dialog-note">
            “Keep queue” lets the queued prompts run after this turn settles.
            “Discard” settles every one as cancelled and reports the count.
          </p>
        </>
      ) : (
        <p className="dialog-note">The queue is empty; only the active turn stops.</p>
      )}
    </DialogShell>
  );
}

export function CloseDialog({
  open,
  session,
  onClose,
  onConfirm,
}: {
  open: boolean;
  session: SessionView;
  onClose: () => void;
  onConfirm: (force: boolean) => void;
}) {
  const [force, setForce] = useState(false);
  const pending = Boolean(store.getSnapshot().pending.close);
  useEffect(() => {
    if (open) setForce(false);
  }, [open]);
  return (
    <ConfirmDialog
      open={open}
      onCancel={onClose}
      onConfirm={() => onConfirm(force)}
      title="Close this session"
      kicker={`Session #${session.id}`}
      confirmLabel={force ? "Force close" : "Close session"}
      tone="danger"
      busy={pending}
    >
      <p className="dialog-lede">
        Closing is terminal. <strong>{displayLabel(session)}</strong>{" "}
        <Handle id={session.id} /> will not run another turn. It remains readable for
        the supervisor’s retention period, then expires.
      </p>
      {session.queued > 0 ? (
        <Notice
          tone="danger"
          title={`${session.queued} queued prompt${session.queued === 1 ? "" : "s"} will be discarded`}
        >
          Closing does not run queued work.
        </Notice>
      ) : null}
      <ToggleRow
        label="Force close (advanced)"
        description="Skip the graceful ACP close and terminate the process. Use only when a normal close does not resolve the situation."
        checked={force}
        onChange={setForce}
      />
      <p className="dialog-note">
        The handle stays the same until retention removes the session. There is no
        resume action.
      </p>
    </ConfirmDialog>
  );
}

export function CloseSubtreeDialog({
  open,
  state,
  session,
  onClose,
  onConfirm,
}: {
  open: boolean;
  state: DashboardState;
  session: SessionView;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const descendants = descendantsOf(session.id, Object.values(state.sessions));
  const targets = [...descendants, session].sort((a, b) => b.depth - a.depth);
  const pending = Boolean(store.getSnapshot().pending.close);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="Client assembly · not a wire primitive"
      title="Close the root subtree"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onPress={onConfirm} isDisabled={pending}>
            {pending ? "Closing…" : `Close ${targets.length} sessions`}
          </Button>
        </>
      }
    >
      <p className="dialog-lede">
        This loops over <span className="mono">sessions.close</span> deepest-first.
        It reports per-target results and never silently hides a failure. Every
        session in the list is terminal afterward.
      </p>
      <div className="subtree-list">
        {targets.map((target) => (
          <div className="subtree-row" key={target.id} data-self={target.id === session.id ? "true" : undefined}>
            <span className="subtree-row__depth">d{target.depth}</span>
            <Handle id={target.id} />
            <span className="subtree-row__name">{displayLabel(target)}</span>
            <span className="subtree-row__status">{target.status}</span>
          </div>
        ))}
      </div>
      <p className="dialog-note">
        Closing a subtree ends every descendant session. Queued prompts are discarded.
        Retained histories remain readable for the retention period.
      </p>
    </DialogShell>
  );
}

export function ForgetDialog({
  open,
  session,
  onClose,
  onConfirm,
  onExport,
}: {
  open: boolean;
  session: SessionView;
  onClose: () => void;
  onConfirm: () => void;
  onExport: () => void;
}) {
  const pending = Boolean(store.getSnapshot().pending.forget);
  return (
    <ConfirmDialog
      open={open}
      onCancel={onClose}
      onConfirm={onConfirm}
      title="Forget this session"
      kicker={`Session #${session.id}`}
      confirmLabel="Forget and discard history"
      tone="danger"
      busy={pending}
    >
      <p className="dialog-lede">
        Forgetting removes a terminal session from the live table and discards its
        retained event log immediately. This is history loss, not cleanup. It cannot
        be undone.
      </p>
      <div className="stop-target">
        <span className="stop-target__label">
          {session.status} · {displayLabel(session)} · #{session.id}
        </span>
        <span className="stop-target__meta">
          {session.endedAt ? `ended ${formatDateTime(session.endedAt)}` : "end time not reported"}
        </span>
      </div>
      <Button onPress={onExport}>Export the loaded transcript first</Button>
      <p className="dialog-note">
        The wire rejects forgetting a terminal session that still has retained
        descendants. Close the descendants first.
      </p>
    </ConfirmDialog>
  );
}

export function DropDialog({
  open,
  session,
  item,
  onClose,
  onConfirm,
}: {
  open: boolean;
  session: SessionView;
  item: QueueItemView | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const pending = Boolean(store.getSnapshot().pending["queue-drop"]);
  if (!item) return null;
  return (
    <ConfirmDialog
      open={open}
      onCancel={onClose}
      onConfirm={onConfirm}
      title="Drop this queued prompt"
      kicker={`Session #${session.id}`}
      confirmLabel="Drop permanently"
      tone="danger"
      busy={pending}
    >
      <p className="dialog-lede">
        This removes one queued prompt before it runs. It is permanent; the prompt is
        settled as cancelled and reported in the transcript.
      </p>
      <div className="stop-target">
        <span className="stop-target__label">
          Position {item.position ?? "unknown"} · {item.id}
        </span>
        <span className="stop-target__text">{item.textPreview}</span>
        <span className="stop-target__meta">from {item.from}</span>
      </div>
    </ConfirmDialog>
  );
}

export function ShutdownDialog({
  open,
  state,
  onClose,
  onConfirm,
}: {
  open: boolean;
  state: DashboardState;
  onClose: () => void;
  onConfirm: (force: boolean) => void;
}) {
  const [force, setForce] = useState(false);
  useEffect(() => {
    if (open) setForce(false);
  }, [open]);
  const sessions = Object.values(state.sessions);
  const live = sessions.filter((session) => !isTerminalStatus(session.status));
  const retained = sessions.length - live.length;
  const pending = Boolean(store.getSnapshot().pending.shutdown);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="Danger zone"
      title="Shut down the supervisor"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onPress={() => onConfirm(force)} isDisabled={pending}>
            {pending ? "Shutting down…" : "Shut down supervisor"}
          </Button>
        </>
      }
    >
      <p className="dialog-lede">
        This closes every live session and discards every retained history in the
        instance. It is not cleanup; the local dashboard cannot recover what is lost.
      </p>
      <div className="shutdown-counts">
        <span>{live.length} live sessions close</span>
        <span>{retained} retained histories discarded</span>
      </div>
      <div className="subtree-list">
        {live.map((session) => (
          <div className="subtree-row" key={session.id}>
            <Handle id={session.id} />
            <span className="subtree-row__name">{displayLabel(session)}</span>
            <span className="subtree-row__status">
              {session.status}
              {session.queued > 0 ? ` · ${session.queued} queued` : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="dialog-note">
        Export anything you need before confirming. The supervisor replies, then
        exits; the dashboard becomes disconnected.
      </p>
      <ToggleRow
        label="Force shutdown (advanced)"
        description="Skip graceful ACP closes."
        checked={force}
        onChange={setForce}
      />
    </DialogShell>
  );
}

export function ClearLocalDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onCancel={onClose}
      onConfirm={onConfirm}
      title="Clear local dashboard state"
      confirmLabel="Clear local state"
      tone="danger"
    >
      <p className="dialog-lede">
        This removes drafts, read markers, locally acknowledged failures, dismissed
        notices, filters, and the current selection from this browser. The supervisor
        and every session are unchanged. This cannot be undone.
      </p>
      <p className="dialog-note">
        Theme and notification preferences are global and are kept.
      </p>
    </ConfirmDialog>
  );
}


