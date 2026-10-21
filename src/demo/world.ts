import type { EventView, NotificationFrame, SessionView } from "../wire/protocol";
import { eventTitle } from "../store/model";
import { ago, demoEpoch, MINUTE, wireError, type Timer } from "./support";
import type { DemoState } from "./types";

export function createDemoState(
  notify: (frame: NotificationFrame) => void,
): DemoState {
  const now = demoEpoch();
  return {
    now,
    startedAt: ago(now, 52 * MINUTE),
    sessions: new Map(),
    events: new Map(),
    queues: new Map(),
    active: new Map(),
    timers: new Map(),
    subscriptions: new Map(),
    idempotency: new Map(),
    nextSubscription: 1,
    shuttingDown: false,
    notify,
  };
}

export function addSession(
  state: DemoState,
  session: SessionView,
  events: EventView[],
): void {
  state.sessions.set(session.id, session);
  state.events.set(session.id, events);
}

export function requireSession(state: DemoState, sessionId: string): SessionView {
  const session = state.sessions.get(sessionId);
  if (!session) throw wireError("not_found", `no session ${sessionId}`);
  return session;
}

export function isTerminal(session: SessionView): boolean {
  return session.status === "closed" || session.status === "failed";
}

export function setSession(state: DemoState, session: SessionView): void {
  state.sessions.set(session.id, session);
}

export function setSessionPatch(
  state: DemoState,
  sessionId: string,
  patch: Partial<SessionView>,
): void {
  const session = state.sessions.get(sessionId);
  if (!session) return;
  state.sessions.set(sessionId, { ...session, ...patch });
}

/** Append one event and fan it out to every scoped event subscription. */
export function emit(
  state: DemoState,
  sessionId: string,
  type: string,
  data: Record<string, unknown>,
): EventView {
  const session = requireSession(state, sessionId);
  const all = state.events.get(sessionId) ?? [];
  const event: EventView = {
    seq: all.length + 1,
    at: new Date().toISOString(),
    type,
    turn: session.turn,
    data,
  };
  const nextEvents = [...all, event];
  state.events.set(sessionId, nextEvents);
  const next: SessionView = {
    ...session,
    lastSeq: event.seq,
    lastEvent: { type: event.type, title: eventTitle(event) || null, at: event.at },
    lastActivityAt: event.at,
  };
  state.sessions.set(sessionId, next);
  for (const [subscription, scope] of state.subscriptions) {
    if (!scope.sessionIds.has(sessionId)) continue;
    state.notify({
      type: "notification",
      subscription,
      kind: "event",
      sessionId,
      events: [event],
      cursor: event.seq,
      truncated: false,
    });
  }
  notifySession(state, next);
  return event;
}

export function notifySession(state: DemoState, session: SessionView): void {
  for (const [subscription, scope] of state.subscriptions) {
    if (!scope.fleet && !scope.sessionIds.has(session.id)) continue;
    state.notify({
      type: "notification",
      subscription,
      kind: "session",
      session,
    });
  }
}

export function notifyRemoved(state: DemoState, sessionId: string): void {
  for (const [subscription, scope] of state.subscriptions) {
    if (!scope.fleet && !scope.sessionIds.has(sessionId)) continue;
    state.notify({
      type: "notification",
      subscription,
      kind: "session.removed",
      sessionId,
    });
  }
}

export function schedule(state: DemoState, sessionId: string, timer: Timer): void {
  const set = state.timers.get(sessionId) ?? new Set<Timer>();
  set.add(timer);
  state.timers.set(sessionId, set);
}

export function clearTimers(state: DemoState, sessionId: string): void {
  const set = state.timers.get(sessionId);
  if (!set) return;
  for (const timer of set) clearTimeout(timer);
  state.timers.delete(sessionId);
}

export function clearAllTimers(state: DemoState): void {
  for (const sessionId of state.timers.keys()) clearTimers(state, sessionId);
}

export function makeHandle(state: DemoState): string {
  let id = "";
  do {
    id = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0");
  } while (state.sessions.has(id));
  return id;
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

export function recountQueues(state: DemoState): void {
  for (const [sessionId, queue] of state.queues) {
    const session = state.sessions.get(sessionId);
    if (session) {
      state.sessions.set(sessionId, {
        ...session,
        queued: queue.length,
        settled: session.status === "idle" && queue.length === 0,
      });
    }
  }
}
