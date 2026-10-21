import { useRef } from "react";
import { Copy, Send, Trash2 } from "lucide-react";
import { Button } from "../components/Button";
import { Tag } from "../components/Status";
import { isMod } from "./hooks";
import { isTerminalStatus, sessionLocalKey } from "../store/model";
import { canUse, store, type DashboardState } from "../store/store";
import type { QueueItemView, SessionView } from "../wire/protocol";
import { CAPABILITIES } from "../wire/protocol";
import { copyWithToast } from "./ui";

export function Composer({
  state,
  session,
  onDrop,
}: {
  state: DashboardState;
  session: SessionView;
  onDrop: (item: QueueItemView) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const key = sessionLocalKey(session);
  const draft = state.local.drafts[key]?.text ?? "";
  const terminal = isTerminalStatus(session.status);
  const waiting = session.status === "waiting_permission";
  const busy = session.status === "busy" || session.queued > 0;
  const inTurn = session.status === "busy" && !terminal;
  // A steered send silently falls back to the queue when the adapter does not
  // support mid-turn injection, so only offer it when both sides can steer.
  const canSteer =
    inTurn &&
    canUse(state, CAPABILITIES.sendSteering) &&
    session.steeringSupported === true;
  const pending = Boolean(state.pending.send);
  const error = state.actionError[`send:${session.id}`];
  const queue = state.queue;
  const queuedCount = queue?.queue.length ?? session.queued;
  const canRetrySafely = canUse(state, CAPABILITIES.sendIdempotency);
  const canSend = !terminal && !pending && draft.trim().length > 0;
  const label = canSteer
    ? "Steer the current turn"
    : busy || waiting
      ? "Queue prompt"
      : "Send prompt";

  const submit = (steer = canSteer) => {
    if (!canSend) return;
    void store.sendPrompt(draft, { steer }).then((result) => {
      if (result) textarea.current?.focus();
    });
  };

  return (
    <section className="composer" aria-label="Composer">
      {queuedCount > 0 ? (
        <details className="queue-strip" open>
          <summary>
            <span className="queue-strip__title">Queue</span>
            <span className="queue-strip__count">
              {queue?.active ? "active turn + " : ""}
              {queuedCount} waiting
            </span>
            {queue?.active ? (
              <span className="queue-strip__active" title={queue.active.textPreview}>
                {queue.active.textPreview}
              </span>
            ) : null}
          </summary>
          <div className="queue-strip__body">
            {queue?.active ? (
              <div className="queue-item queue-item--active">
                <span className="queue-item__position">active</span>
                <span className="queue-item__text">{queue.active.textPreview}</span>
                <span className="queue-item__meta">
                  {queue.active.from} · {queue.active.id}
                </span>
              </div>
            ) : null}
            {queue?.queue.map((item) => (
              <div className="queue-item" key={item.id}>
                <span className="queue-item__position">{item.position ?? "?"}</span>
                <span className="queue-item__text">{item.textPreview}</span>
                <span className="queue-item__meta">
                  {item.from} · {Math.round(item.queuedMs / 1000)}s · {item.id}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={Boolean(state.pending["queue-drop"])}
                  onPress={() => onDrop(item)}
                  aria-label={`Drop queued prompt ${item.id}`}
                  title="Remove this queued prompt"
                >
                  <Trash2 className="btn__icon icon" />
                </Button>
              </div>
            ))}
            {queuedCount > 0 && !queue ? (
              <div className="queue-item">
                <span className="queue-item__position">…</span>
                <span className="queue-item__text">
                  {state.queueLoading ? "Loading the queue snapshot…" : "Queue snapshot unavailable."}
                </span>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="composer__box" data-disabled={terminal ? "true" : undefined}>
        <textarea
          ref={textarea}
          className="composer__input"
          value={draft}
          rows={3}
          placeholder={
            terminal
              ? "This session has ended. The draft stays local and copyable."
              : waiting
                ? "Write a prompt. It will queue until the permission request is answered."
                : canSteer
                  ? "Write a prompt. Ctrl/Cmd+Enter steers the current turn."
                  : busy
                    ? "Write a prompt. It runs after the current turn."
                    : "Write a prompt. Ctrl/Cmd+Enter sends."
          }
          readOnly={terminal}
          aria-label="Prompt"
          title="Orchestration text only; no attachments."
          onChange={(event) => store.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && isMod(event)) {
              event.preventDefault();
              submit(canSteer);
            }
          }}
        />
        <div className="composer__actions">
          <span className="composer__hint">
            {terminal ? (
              "Composer disabled: closed and failed sessions cannot run another turn."
            ) : waiting ? (
              <>
                <Tag tone="warn">will not run until answered</Tag>
                This queues only; it does not answer the request.
              </>
            ) : canSteer ? (
              "Steer injects into the current turn · Queue runs after it."
            ) : busy ? (
              "Runs after the current turn."
            ) : (
              "Draft stays local · text only."
            )}
          </span>
          <span className="composer__count">{draft.length.toLocaleString()} chars</span>
          {terminal && draft ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => void copyWithToast(draft, "draft")}
              aria-label="Copy the preserved draft"
            >
              <Copy className="btn__icon icon" />
              Copy
            </Button>
          ) : null}
          {canSteer ? (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={!canSend}
              onPress={() => submit(false)}
              aria-label="Queue prompt instead of steering"
              title="Queue this prompt behind the current turn"
            >
              Queue
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            isDisabled={!canSend}
            onPress={() => submit(canSteer)}
            aria-label={label}
            title={
              canRetrySafely
                ? undefined
                : "This supervisor does not advertise send.idempotency; a retry after a disconnect may duplicate."
            }
          >
            <Send className="btn__icon icon" />
            {pending
              ? "Sending…"
              : terminal
                ? "Ended"
                : canSteer
                  ? "Steer"
                  : busy || waiting
                    ? "Queue"
                    : "Send"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="composer__error" role="alert">
          <span>{error}</span>
          <span className="dim">The draft is preserved.</span>
        </div>
      ) : null}

    </section>
  );
}
