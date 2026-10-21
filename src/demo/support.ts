import type { EventView, SessionView, WireError } from "../wire/protocol";
import { eventTitle } from "../store/model";

/** Shapes and builders shared by the demo world, fixtures, and handlers. */

export type Timer = ReturnType<typeof setTimeout>;

export type PendingPrompt = {
  id: string;
  text: string;
  from: string;
  queuedAt: number;
};

export type Subscription = {
  fleet: boolean;
  sessionIds: Set<string>;
};

export type EventSpec = {
  ago: number;
  type: string;
  turn?: number | null;
  data?: Record<string, unknown>;
  replay?: true;
};

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/**
 * Seeded demo sessions keep their creation timestamps across a reload in this
 * browser session. Drafts, read markers, and a selected handle+createdAt then
 * behave the way they do against a real supervisor. A new tab/session gets a
 * fresh fixture epoch.
 */
export function demoEpoch(): number {
  try {
    if (typeof window !== "undefined" && "sessionStorage" in window) {
      const key = "hlao-demo-epoch";
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      const now = Date.now();
      window.sessionStorage.setItem(key, String(now));
      return now;
    }
  } catch {
    // Session storage can be unavailable; the demo still runs with a fresh epoch.
  }
  return Date.now();
}

export function ago(now: number, ms: number): string {
  return new Date(now - ms).toISOString();
}

export function wireError(
  code: WireError["code"],
  message: string,
  details?: unknown,
): WireError {
  return { code, message, details };
}

export function preview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 200 ? `${compact.slice(0, 197)}…` : compact;
}

export function makeEvents(now: number, specs: EventSpec[]): EventView[] {
  return [...specs]
    .sort((a, b) => b.ago - a.ago)
    .map((spec, index) => ({
      seq: index + 1,
      at: ago(now, spec.ago),
      type: spec.type,
      turn: spec.turn ?? null,
      data: spec.data ?? {},
      ...(spec.replay === true ? { replay: true as const } : {}),
    }));
}

export function baseSession(
  input: Pick<SessionView, "id" | "backend" | "cwd" | "status" | "createdAt"> &
    Partial<SessionView>,
): SessionView {
  return {
    id: input.id,
    name: input.name ?? null,
    createdBy: input.createdBy ?? "operator",
    backend: input.backend,
    cwd: input.cwd,
    status: input.status,
    parentId: input.parentId ?? null,
    rootId: input.rootId ?? input.id,
    depth: input.depth ?? 0,
    createdAt: input.createdAt,
    lastActivityAt: input.lastActivityAt ?? input.createdAt,
    endedAt: input.endedAt ?? null,
    turn: input.turn ?? 0,
    turnStartedAt: input.turnStartedAt ?? null,
    queued: input.queued ?? 0,
    settled: input.settled ?? input.status === "idle",
    lastSeq: input.lastSeq ?? 0,
    lastEvent: input.lastEvent ?? null,
    pendingPermissions: input.pendingPermissions ?? [],
    lastStopReason: input.lastStopReason ?? null,
    agentSessionId: input.agentSessionId ?? null,
    forkedFrom: input.forkedFrom ?? null,
    processId: input.processId ?? null,
    exit: input.exit ?? null,
    modes: input.modes ?? null,
    configOptions: input.configOptions ?? null,
    usage: input.usage ?? null,
    compaction: input.compaction ?? null,
    plan: input.plan ?? null,
    title: input.title ?? null,
    firstPrompt: input.firstPrompt ?? null,
    agentName: input.agentName ?? null,
    agentVersion: input.agentVersion ?? null,
    steeringSupported: input.steeringSupported ?? true,
  };
}

export function lastProjection(events: EventView[]): SessionView["lastEvent"] {
  const last = events[events.length - 1];
  if (!last) return null;
  return {
    type: last.type,
    title: eventTitle(last) || null,
    at: last.at,
  };
}

export function withEvents(
  session: SessionView,
  events: EventView[],
  lastActivityAt?: string,
): SessionView {
  return {
    ...session,
    lastSeq: events.length,
    lastEvent: lastProjection(events),
    lastActivityAt:
      lastActivityAt ??
      events[events.length - 1]?.at ??
      session.lastActivityAt,
  };
}
