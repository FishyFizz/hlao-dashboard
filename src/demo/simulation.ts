import type { SessionView } from "../wire/protocol";
import { preview, type PendingPrompt } from "./support";
import type { DemoState } from "./types";
import {
  emit,
  notifySession,
  requireSession,
  schedule,
} from "./world";

/** Turn lifecycle: one active turn, a FIFO queue, and scheduled fake work. */

export function startTurn(
  state: DemoState,
  sessionId: string,
  prompt: PendingPrompt,
): number {
  const session = requireSession(state, sessionId);
  const turn = session.turn + 1;
  state.active.set(sessionId, { ...prompt, queuedAt: Date.now() });
  const next: SessionView = {
    ...session,
    status: "busy",
    turn,
    turnStartedAt: new Date().toISOString(),
    settled: false,
    lastStopReason: null,
    pendingPermissions: [],
  };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "prompt.sent", {
    text: prompt.text,
    from: prompt.from,
    messageId: prompt.id,
  });
  emit(state, sessionId, "turn.started", {});
  notifySession(state, requireSession(state, sessionId));

  schedule(
    state,
    sessionId,
    setTimeout(() => {
      emit(state, sessionId, "agent.thought", {
        text: "Read the request, then act.",
        messageId: `thought-${turn}`,
        chunk: false,
      });
    }, 350),
  );
  schedule(
    state,
    sessionId,
    setTimeout(() => {
      emit(state, sessionId, "tool.call", {
        toolCallId: `call-${turn}`,
        name: "Bash",
        title: "npm test",
        status: "running",
        input: "npm test",
      });
    }, 850),
  );
  schedule(
    state,
    sessionId,
    setTimeout(() => {
      emit(state, sessionId, "tool.update", {
        toolCallId: `call-${turn}`,
        status: "completed",
        output: "tests passed",
      });
    }, 1_450),
  );
  schedule(
    state,
    sessionId,
    setTimeout(() => {
      emit(state, sessionId, "agent.message", {
        text: "The requested step completed. ",
        messageId: `msg-${turn}-out`,
        chunk: true,
      });
    }, 2_000),
  );
  schedule(
    state,
    sessionId,
    setTimeout(() => {
      emit(state, sessionId, "agent.message", {
        text: "Queue another prompt if you want the next step.",
        messageId: `msg-${turn}-out`,
        chunk: true,
      });
      finishTurn(state, sessionId, "end_turn");
    }, 2_700),
  );
  return turn;
}

export function finishTurn(
  state: DemoState,
  sessionId: string,
  stopReason: string,
  cancelled = false,
): void {
  const session = state.sessions.get(sessionId);
  if (!session) return;
  emit(state, sessionId, "turn.ended", { reason: stopReason });
  const queue = state.queues.get(sessionId) ?? [];
  const next: SessionView = {
    ...session,
    status: "idle",
    turnStartedAt: null,
    settled: queue.length === 0,
    queued: queue.length,
    lastStopReason: stopReason === "cancelled" ? "cancelled" : "end_turn",
    pendingPermissions: [],
  };
  state.sessions.set(sessionId, next);
  state.active.delete(sessionId);
  notifySession(state, requireSession(state, sessionId));
  if (!cancelled && queue.length > 0) startNextQueued(state, sessionId);
}

export function startNextQueued(state: DemoState, sessionId: string): void {
  const queue = state.queues.get(sessionId) ?? [];
  const [next, ...rest] = queue;
  if (!next) return;
  state.queues.set(sessionId, rest);
  const session = state.sessions.get(sessionId);
  if (!session) return;
  state.sessions.set(sessionId, { ...session, queued: rest.length, settled: false });
  startTurn(state, sessionId, next);
}

export function enqueue(
  state: DemoState,
  sessionId: string,
  prompt: PendingPrompt,
): void {
  const queue = state.queues.get(sessionId) ?? [];
  queue.push(prompt);
  state.queues.set(sessionId, queue);
  const session = requireSession(state, sessionId);
  state.sessions.set(sessionId, { ...session, queued: queue.length, settled: false });
  emit(state, sessionId, "prompt.queued", {
    text: prompt.text,
    from: prompt.from,
    messageId: prompt.id,
  });
  notifySession(state, requireSession(state, sessionId));
}

export function discardQueue(
  state: DemoState,
  sessionId: string,
  reason: string,
): number {
  const queue = state.queues.get(sessionId) ?? [];
  if (queue.length === 0) return 0;
  state.queues.set(sessionId, []);
  const session = requireSession(state, sessionId);
  state.sessions.set(sessionId, { ...session, queued: 0, settled: session.status === "idle" });
  for (const [index, prompt] of queue.entries()) {
    emit(state, sessionId, "prompt.discarded", {
      messageId: prompt.id,
      textPreview: preview(prompt.text),
      position: index + 1,
      reason,
      from: prompt.from,
      by: "operator",
    });
  }
  notifySession(state, requireSession(state, sessionId));
  return queue.length;
}
