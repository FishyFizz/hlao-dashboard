import { useRef } from "react";
import { Copy, Send, Trash2 } from "lucide-react";
import { Button } from "../components/Button";
import { Tag } from "../components/Status";
import { isMod } from "./hooks";
import { sessionLocalKey } from "../store/model";
import { canUse, store, type DashboardState } from "../store/store";
import type { QueueItemView, SessionView } from "../wire/protocol";
import { copyWithToast } from "./ui";

export function Composer({
  state,
  session,
  onSpawnReplacement,
  onDrop,
}: {
  state: DashboardState;
  session: SessionView;
  onSpawnReplacement: () => void;
  onDrop: (item: QueueItemView) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const key = sessionLocalKey(session);
  const draft = state.local.drafts[key]?.text ?? "";
  const terminal = session.status === "closed" || session.status === "failed";
  const waiting = session.status === "waiting_permission";
  const busy = session.status === "busy" || session.queued > 0;
  const pending = Boolean(state.pending.send);
  const error = state.actionError[`send:${session.id}`];
  const queue = state.queue;
  const queuedCount = queue?.queue.length ?? session.queued;
  const canRetrySafely = canUse(state, "send.idempotency");
  const canSend = !terminal && !pending && draft.trim().length > 0;
  const label = busy || waiting ? "Queue prompt" : "Send prompt";

  const submit = () => {
    if (!canSend) return;
    void store.sendPrompt(draft).then((result) => {
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
          rows={2}
          placeholder={
            terminal
              ? "This session has ended. The draft stays local and copyable."
              : waiting
                ? "Write a prompt. It will queue until the permission request is answered."
                : busy
                  ? "Write a prompt. It runs after the current turn."
                  : "Write a prompt. Ctrl/Cmd+Enter sends."
          }
          readOnly={terminal}
          aria-label="Prompt"
          onChange={(event) => store.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && isMod(event)) {
              event.preventDefault();
              submit();
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
            ) : busy ? (
              <>
                <Tag tone="warn">will queue</Tag>
                Runs after the current turn.
              </>
            ) : (
              "Draft stays local."
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
          <Button
            size="sm"
            variant="primary"
            isDisabled={!canSend}
            onPress={submit}
            aria-label={label}
          >
            <Send className="btn__icon icon" />
            {pending ? "Sending…" : terminal ? "Ended" : busy || waiting ? "Queue" : "Send"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="composer__error" role="alert">
          <span>{error}</span>
          <span className="dim">The draft is preserved.</span>
        </div>
      ) : null}

      {terminal ? (
        <div className="composer__ended">
          <span>
            {session.status === "failed"
              ? "This session failed. The transcript remains readable for the retention period."
              : "This session is closed. The transcript remains readable for the retention period."}
          </span>
          <Button size="sm" onPress={onSpawnReplacement}>
            Spawn a replacement
          </Button>
        </div>
      ) : null}

      <div className="composer__foot">
        <span>
          <span className="mono">Enter</span> newline ·{" "}
          <span className="mono">Ctrl/Cmd+Enter</span> {busy || waiting ? "queue" : "send"}
        </span>
        <span>
          {canRetrySafely
            ? "Text only · no attachments"
            : "Text only · retry may duplicate"}
        </span>
      </div>
    </section>
  );
}
