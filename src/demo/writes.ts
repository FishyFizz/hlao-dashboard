import type {
  CancelResult,
  CloseResult,
  ForgetResult,
  PermissionView,
  PermitResult,
  QueueDropResult,
  SendParams,
  SendResult,
  SessionView,
  SpawnParams,
  SpawnResult,
  ShutdownResult,
} from "../wire/protocol";
import { descendantsOf } from "../store/model";
import {
  baseSession,
  makeEvents,
  preview,
  wireError,
  withEvents,
  type EventSpec,
  type PendingPrompt,
} from "./support";
import type { DemoState } from "./types";
import {
  addSession,
  clearTimers,
  emit,
  isTerminal,
  makeHandle,
  makeId,
  notifyRemoved,
  notifySession,
  requireSession,
  schedule,
} from "./world";
import { backends, queueView } from "./reads";
import {
  discardQueue,
  enqueue,
  finishTurn,
  startNextQueued,
  startTurn,
} from "./simulation";

/** Mutations. Every method echoes the full session view, like the wire. */

export async function send(state: DemoState, params: SendParams): Promise<SendResult> {
  const session = requireSession(state, params.sessionId);
  if (isTerminal(session)) {
    throw wireError("session_closed", "the session is closed or failed");
  }
  if (!params.text.trim()) throw wireError("bad_request", "text is required");
  const key = params.idempotencyKey ? `send:${params.idempotencyKey}` : null;
  if (key) {
    const existing = state.idempotency.get(key);
    if (existing) {
      const existingSession = state.sessions.get(existing);
      if (existingSession) {
        return {
          session: existingSession,
          messageId: existing,
          queued: existingSession.queued > 0,
          turn: existingSession.turn,
          completed: false,
          timedOut: false,
          duplicate: true,
        };
      }
    }
  }
  const messageId = params.messageId ?? makeId("msg");
  const prompt: PendingPrompt = {
    id: messageId,
    text: params.text,
    from: "operator",
    queuedAt: Date.now(),
  };
  if (key) state.idempotency.set(key, messageId);

  if (
    params.steer === true &&
    session.status === "busy" &&
    session.steeringSupported === true
  ) {
    emit(state, session.id, "prompt.steered", {
      text: params.text,
      from: "operator",
      messageId,
      turn: session.turn,
    });
    return {
      session: requireSession(state, session.id),
      messageId,
      queued: false,
      steered: true,
      turn: session.turn,
      completed: false,
      timedOut: false,
    };
  }

  if (session.status === "busy" || session.status === "waiting_permission" || session.queued > 0) {
    enqueue(state, session.id, prompt);
    return {
      session: requireSession(state, session.id),
      messageId,
      queued: true,
      turn: null,
      completed: false,
      timedOut: false,
    };
  }

  const turn = startTurn(state, session.id, prompt);
  return {
    session: requireSession(state, session.id),
    messageId,
    queued: false,
    turn,
    completed: false,
    timedOut: false,
  };
}

export async function spawn(state: DemoState, params: SpawnParams): Promise<SpawnResult> {
  const backend = params.backend?.trim();
  if (!backend) throw wireError("bad_request", "backend is required");
  const available = backends().backends.find((item) => item.name === backend);
  if (!available) throw wireError("backend_not_found", `no backend named ${backend}`);
  if (!available.available) {
    throw wireError(
      "backend_unavailable",
      available.unavailableReason ?? `${backend} is unavailable`,
    );
  }
  if (params.idempotencyKey) {
    const existingId = state.idempotency.get(`spawn:${params.idempotencyKey}`);
    if (existingId) {
      const existing = state.sessions.get(existingId);
      if (existing) {
        return { session: existing, nextSeq: existing.lastSeq, duplicate: true };
      }
    }
  }

  const resumeId = params.resumeSessionId?.trim() || undefined;
  const forkId = params.forkSessionId?.trim() || undefined;
  if (resumeId !== undefined && forkId !== undefined) {
    throw wireError(
      "bad_request",
      "resumeSessionId and forkSessionId are mutually exclusive",
    );
  }
  if (resumeId !== undefined) {
    const attached = [...state.sessions.values()].find(
      (candidate) =>
        !isTerminal(candidate) &&
        candidate.agentSessionId === resumeId,
    );
    if (attached) {
      return {
        session: attached,
        nextSeq: attached.lastSeq,
        duplicate: true,
        resumed: true,
      };
    }
  }

  const id = makeHandle(state);
  const now = Date.now();
  const parent = params.parentSessionId
    ? state.sessions.get(params.parentSessionId)
    : null;
  const agentSessionId =
    resumeId ??
    (forkId !== undefined
      ? `${forkId}-fork-${state.sessions.size + 1}`
      : `acp-${9000 + state.sessions.size}`);
  const session = baseSession({
    id,
    name: params.name?.trim() || null,
    backend,
    cwd: params.cwd?.trim() || "D:\\work\\hlao",
    status: "starting",
    parentId: parent?.id ?? null,
    rootId: parent?.rootId ?? id,
    depth: parent ? parent.depth + 1 : 0,
    createdAt: new Date(now).toISOString(),
    createdBy: "operator",
    ...(params.mode
      ? {
          modes: {
            currentModeId: params.mode,
            availableModes: [{ id: params.mode, name: params.mode }],
          },
        }
      : {}),
    agentName: backend === "claude" ? "claude-agent-acp" : backend === "codex" ? "codex-acp" : "gemini-cli",
    agentVersion: "demo",
    agentSessionId,
    forkedFrom: forkId ?? null,
    processId: 8200 + state.sessions.size,
  });
  const history: EventSpec[] =
    resumeId !== undefined || forkId !== undefined
      ? [
          {
            ago: 3,
            type: "user.message",
            data: {
              text: "Earlier prompt restored from the provider.",
              messageId: "hist-1",
            },
            replay: true,
          },
          {
            ago: 2,
            type: "agent.message",
            data: {
              text: "Earlier reply restored from the provider.",
              messageId: "hist-2",
            },
            replay: true,
          },
        ]
      : [];
  const historyEvents = history.length;
  const specs: EventSpec[] = [
    {
      ago: 4,
      type: "session.created",
      data: {
        createdBy: "operator",
        ...(forkId !== undefined ? { forkedFrom: forkId } : {}),
      },
    },
    ...history,
    {
      ago: 0,
      type: "session.initialized",
      data: {
        agentName: session.agentName,
        agentVersion: "demo",
        resumed: resumeId !== undefined,
        forked: forkId !== undefined,
        ...(forkId !== undefined ? { forkedFrom: forkId } : {}),
      },
    },
    ...(resumeId !== undefined
      ? [
          {
            ago: 0,
            type: "session.resumed",
            data: {
              agentSessionId,
              historyStartSeq: 2,
              historyEndSeq: 1 + historyEvents,
              historyEvents,
            },
          } satisfies EventSpec,
        ]
      : forkId !== undefined
        ? [
            {
              ago: 0,
              type: "session.forked",
              data: {
                agentSessionId,
                forkedFrom: forkId,
                historyLoaded: true,
                historyStartSeq: 2,
                historyEndSeq: 1 + historyEvents,
                historyEvents,
              },
            } satisfies EventSpec,
          ]
        : []),
  ];
  const created = makeEvents(now, specs);
  addSession(state, withEvents(session, created), created);
  if (params.idempotencyKey) state.idempotency.set(`spawn:${params.idempotencyKey}`, id);
  notifySession(state, requireSession(state, id));

  const timer = setTimeout(() => {
    const current = state.sessions.get(id);
    if (!current || isTerminal(current)) return;
    const next = { ...current, status: "idle" as const, settled: true };
    state.sessions.set(id, next);
    notifySession(state, next);
    if (params.prompt?.trim()) {
      const prompt: PendingPrompt = {
        id: makeId("msg"),
        text: params.prompt,
        from: "operator",
        queuedAt: Date.now(),
      };
      startTurn(state, id, prompt);
    }
  }, 500);
  schedule(state, id, timer);

  return {
    session: requireSession(state, id),
    nextSeq: created.length,
    createdBy: "operator",
    ...(resumeId !== undefined ? { resumed: true } : {}),
    ...(forkId !== undefined ? { forked: true } : {}),
  };
}

export async function permit(
  state: DemoState,
  sessionId: string,
  requestId: string | undefined,
  optionId: string | undefined,
): Promise<PermitResult> {
  const session = requireSession(state, sessionId);
  const pending = session.pendingPermissions;
  if (pending.length === 0) {
    throw wireError("no_pending_permission", "no permission is pending");
  }

  let target: PermissionView;
  if (requestId !== undefined) {
    const found = pending.find((item) => item.requestId === requestId);
    if (!found) {
      throw wireError(
        "no_pending_permission",
        `no pending permission ${requestId}`,
        { pending: pending.map((item) => item.requestId) },
      );
    }
    target = found;
  } else if (pending.length === 1) {
    target = pending[0]!;
  } else {
    throw wireError(
      "bad_request",
      `multiple permission requests are pending: ${pending
        .map((item) => item.requestId)
        .join(", ")}; pass requestId`,
    );
  }

  if (!optionId) throw wireError("bad_option", "optionId is required");
  const option = target.options.find(
    (candidate) => candidate.optionId === optionId,
  );
  if (!option) {
    throw wireError("bad_option", `option ${optionId} is not offered`);
  }

  const remaining = pending.filter(
    (item) => item.requestId !== target.requestId,
  );
  const next: SessionView = {
    ...session,
    pendingPermissions: remaining,
    status: remaining.length > 0 ? "waiting_permission" : "busy",
    lastStopReason: null,
  };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "permission.resolved", {
    requestId: target.requestId,
    optionId: option.optionId,
    optionName: option.name,
    by: "operator",
  });

  if (remaining.length === 0) {
    const timer = setTimeout(() => {
      const current = state.sessions.get(sessionId);
      if (!current || isTerminal(current)) return;
      emit(state, sessionId, "agent.message", {
        text: "The probe completed. The output is in the transcript.",
        messageId: "msg-perm-out",
        chunk: false,
      });
      finishTurn(state, sessionId, "end_turn");
    }, 1200);
    schedule(state, sessionId, timer);
  }

  return {
    session: requireSession(state, sessionId),
    requestId: target.requestId,
    optionId: option.optionId,
    by: "operator",
  };
}

/** A cancel or close resolves every request; the provider gets a cancellation. */
export function clearPending(
  state: DemoState,
  sessionId: string,
  reason: string,
): void {
  const session = state.sessions.get(sessionId);
  if (!session || session.pendingPermissions.length === 0) return;
  const pending = session.pendingPermissions;
  state.sessions.set(sessionId, { ...session, pendingPermissions: [] });
  for (const item of pending) {
    emit(state, sessionId, "permission.resolved", {
      requestId: item.requestId,
      optionId: null,
      by: "system",
      reason,
    });
  }
}

export function cancel(
  state: DemoState,
  sessionId: string,
  keepQueue: boolean,
): CancelResult {
  const session = requireSession(state, sessionId);
  if (isTerminal(session)) throw wireError("session_closed", "the session is closed");
  clearTimers(state, sessionId);
  const active = state.active.get(sessionId);
  let discarded = 0;
  if (active) {
    emit(state, sessionId, "cancel.requested", {
      by: "operator",
      keepQueue,
    });
  }
  clearPending(state, sessionId, "cancelled");
  if (!keepQueue) discarded = discardQueue(state, sessionId, "cancel");
  finishTurn(state, sessionId, "cancelled", true);
  if (keepQueue) startNextQueued(state, sessionId);
  return { session: requireSession(state, sessionId), discarded };
}

export function closeSession(state: DemoState, sessionId: string): CloseResult {
  const session = requireSession(state, sessionId);
  const wasTerminal = isTerminal(session);
  if (wasTerminal) return { session, killed: false, wasTerminal };
  clearTimers(state, sessionId);
  clearPending(state, sessionId, "cancelled");
  discardQueue(state, sessionId, "close");
  state.active.delete(sessionId);
  const next: SessionView = {
    ...session,
    status: "closed",
    endedAt: new Date().toISOString(),
    turnStartedAt: null,
    settled: true,
    pendingPermissions: [],
    queued: 0,
  };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "session.closed", { by: "operator" });
  notifySession(state, requireSession(state, sessionId));
  return { session: requireSession(state, sessionId), killed: false, wasTerminal };
}

export function forget(state: DemoState, sessionId: string): ForgetResult {
  const session = requireSession(state, sessionId);
  if (!isTerminal(session)) {
    throw wireError("bad_request", "only terminal sessions can be forgotten");
  }
  const descendants = descendantsOf(sessionId, [...state.sessions.values()]);
  if (descendants.length > 0) {
    throw wireError("bad_request", "terminal session still has retained descendants");
  }
  state.sessions.delete(sessionId);
  state.events.delete(sessionId);
  state.queues.delete(sessionId);
  state.active.delete(sessionId);
  notifyRemoved(state, sessionId);
  return { sessionId, forgotten: true };
}

export function rename(
  state: DemoState,
  sessionId: string,
  name: string | null,
): { session: SessionView } {
  const session = requireSession(state, sessionId);
  const next = { ...session, name: name?.trim() ? name.trim() : null };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "session.renamed", { name: next.name, by: "operator" });
  notifySession(state, requireSession(state, sessionId));
  return { session: requireSession(state, sessionId) };
}

export function setMode(
  state: DemoState,
  sessionId: string,
  modeId: string,
): { session: SessionView } {
  const session = requireSession(state, sessionId);
  if (!session.modes) throw wireError("bad_request", "this backend advertises no modes");
  if (!session.modes.availableModes.some((mode) => mode.id === modeId)) {
    throw wireError("bad_option", `mode ${modeId} is not offered`);
  }
  const next: SessionView = {
    ...session,
    modes: { ...session.modes, currentModeId: modeId },
  };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "mode", { modeId, by: "operator" });
  notifySession(state, requireSession(state, sessionId));
  return { session: requireSession(state, sessionId) };
}

export function setConfig(
  state: DemoState,
  sessionId: string,
  configId: string,
  value: string | boolean,
): { session: SessionView } {
  const session = requireSession(state, sessionId);
  const option = session.configOptions?.find((candidate) => candidate.id === configId);
  if (!option) throw wireError("bad_request", `config option ${configId} is not advertised`);
  let nextValue = value;
  if (option.type === "boolean") {
    nextValue = value === true || value === "true";
  } else {
    const stringValue = String(value);
    if (!option.values.some((candidate) => candidate.value === stringValue)) {
      throw wireError("bad_option", `value ${stringValue} is not offered`);
    }
    nextValue = stringValue;
  }
  const next: SessionView = {
    ...session,
    configOptions:
      session.configOptions?.map((candidate) =>
        candidate.id === configId ? { ...candidate, currentValue: nextValue } : candidate,
      ) ?? null,
  };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "config", { configId, value: nextValue, by: "operator" });
  notifySession(state, requireSession(state, sessionId));
  return { session: requireSession(state, sessionId) };
}

export function queueDrop(
  state: DemoState,
  sessionId: string,
  messageId?: string,
  position?: number,
): QueueDropResult {
  const session = requireSession(state, sessionId);
  const queue = state.queues.get(sessionId) ?? [];
  let index = -1;
  if (messageId) index = queue.findIndex((item) => item.id === messageId);
  else if (position) index = position - 1;
  if (index < 0 || index >= queue.length) {
    throw wireError("bad_request", "no queued prompt matches that target");
  }
  const [dropped] = queue.splice(index, 1);
  state.queues.set(sessionId, queue);
  const next = { ...session, queued: queue.length, settled: false };
  state.sessions.set(sessionId, next);
  emit(state, sessionId, "prompt.discarded", {
    messageId: dropped!.id,
    textPreview: preview(dropped!.text),
    position: index + 1,
    reason: "dropped",
    from: dropped!.from,
    by: "operator",
  });
  notifySession(state, requireSession(state, sessionId));
  return {
    session: requireSession(state, sessionId),
    dropped: queueView(dropped!, index + 1, session.turn),
    discarded: 1,
  };
}

export async function shutdown(state: DemoState): Promise<ShutdownResult> {
  let sessionsClosed = 0;
  let retainedDiscarded = 0;
  for (const session of state.sessions.values()) {
    if (isTerminal(session)) retainedDiscarded += 1;
    else {
      sessionsClosed += 1;
      clearTimers(state, session.id);
    }
  }
  for (const sessionId of [...state.sessions.keys()]) {
    state.sessions.delete(sessionId);
    notifyRemoved(state, sessionId);
  }
  state.shuttingDown = true;
  return { sessionsClosed, retainedDiscarded };
}
