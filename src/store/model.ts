import type {
  EventView,
  PermissionView,
  SessionPlanView,
  SessionStatus,
  SessionUsageView,
  SessionView,
} from "../wire/protocol";

/* ------------------------------------------------------------------ */
/* Identity                                                           */
/* ------------------------------------------------------------------ */

export function normalizeHome(home: string): string {
  return home.trim().replace(/[\\/]+$/, "").toLowerCase();
}

/** Stable local identity for a session. Handles can be reused after a restart. */
export function sessionLocalKey(session: Pick<SessionView, "id" | "createdAt">): string {
  return `${session.id}@${session.createdAt}`;
}

export function displayLabel(session: SessionView): string {
  const name = session.name?.trim();
  if (name) return name;
  const title = session.title?.trim();
  if (title) return title;
  return `#${session.id}`;
}

export function labelKind(session: SessionView): "name" | "title" | "handle" {
  if (session.name?.trim()) return "name";
  if (session.title?.trim()) return "title";
  return "handle";
}

export function isActive(status: SessionStatus): boolean {
  return status === "starting" || status === "busy" || status === "waiting_permission";
}

export function isTerminalStatus(status: SessionStatus): boolean {
  return status === "closed" || status === "failed";
}

/* ------------------------------------------------------------------ */
/* Attention                                                          */
/* ------------------------------------------------------------------ */

export type NoticeRecord = {
  seq: number;
  severity: "info" | "warning" | "error";
  text: string;
  at: string;
};

export type LocalReadingState = {
  acknowledged: Record<string, string>;
  dismissedNotices: Record<string, number>;
};

export type AttentionKind = "permission" | "failure" | "notice";

export type AttentionItem = {
  session: SessionView;
  rank: 1 | 2 | 3;
  kind: AttentionKind;
  reason: string;
  /** Structural sort key: oldest permission first; newest failure/notice first. */
  sortAt: string;
  noticeSeq?: number;
  permission?: PermissionView | null;
};

export function attentionFor(
  sessions: readonly SessionView[],
  notices: Record<string, NoticeRecord>,
  local: LocalReadingState,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const session of sessions) {
    const key = sessionLocalKey(session);

    if (session.status === "waiting_permission" && session.pendingPermission) {
      const permission = session.pendingPermission;
      items.push({
        session,
        rank: 1,
        kind: "permission",
        reason: `${permission.title} · ${permission.kind ?? "permission"}`,
        sortAt: permission.requestedAt,
        permission,
      });
      continue;
    }

    if (session.status === "failed") {
      const acknowledgedAt = local.acknowledged[key];
      const failureAt = session.endedAt ?? session.lastActivityAt;
      if (acknowledgedAt && acknowledgedAt === failureAt) continue;
      items.push({
        session,
        rank: 2,
        kind: "failure",
        reason: failureReason(session),
        sortAt: session.endedAt ?? session.lastActivityAt,
      });
      continue;
    }

    if (isTerminalStatus(session.status)) continue;

    const notice = notices[key];
    if (
      notice &&
      notice.severity === "error" &&
      local.dismissedNotices[key] !== notice.seq
    ) {
      items.push({
        session,
        rank: 3,
        kind: "notice",
        reason: notice.text,
        sortAt: notice.at,
        noticeSeq: notice.seq,
      });
    }
  }

  items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank === 1) return Date.parse(a.sortAt) - Date.parse(b.sortAt);
    return Date.parse(b.sortAt) - Date.parse(a.sortAt);
  });
  return items;
}

export function failureReason(session: SessionView): string {
  if (session.exit) {
    if (session.exit.signal) return `exited on ${session.exit.signal}`;
    if (session.exit.code !== null) return `exited with code ${session.exit.code}`;
  }
  if (session.lastStopReason) return `turn ended: ${session.lastStopReason}`;
  return "session failed";
}

export function attentionSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function noticeFromEvent(event: EventView): NoticeRecord | null {
  if (event.type !== "notice") return null;
  const severity =
    event.data.severity === "error" || event.data.severity === "warning"
      ? (event.data.severity as "error" | "warning")
      : "info";
  const text = stringField(event.data, ["text", "message", "title"]) || "Notice";
  return { seq: event.seq, severity, text, at: event.at };
}

/* ------------------------------------------------------------------ */
/* Grouping and ordering                                              */
/* ------------------------------------------------------------------ */

export type FleetGroup = "needs" | "running" | "quiet" | "ended";

export function fleetGroupFor(
  session: SessionView,
  attentionRank: number | undefined,
): FleetGroup {
  if (attentionRank) return "needs";
  if (session.status === "busy" || session.status === "starting") return "running";
  if (session.status === "idle") return "quiet";
  return "ended";
}

export type FleetSort = "created" | "activity" | "name";

export function sortSessions(
  sessions: readonly SessionView[],
  sort: FleetSort,
): SessionView[] {
  const copy = [...sessions];
  if (sort === "activity") {
    copy.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  } else if (sort === "name") {
    copy.sort((a, b) => displayLabel(a).localeCompare(displayLabel(b), undefined, { numeric: true }));
  } else {
    copy.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }
  return copy;
}

export function matchesQuery(session: SessionView, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    session.id,
    session.name ?? "",
    session.title ?? "",
    session.backend,
    session.cwd,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

export function unreadFor(
  session: SessionView,
  lastSeenSeq: number,
  earliestRetainedSeq: number,
): { unread: boolean; count: number | null; partlyEvicted: boolean } {
  if (
    lastSeenSeq > 0 &&
    earliestRetainedSeq > lastSeenSeq &&
    session.lastSeq >= earliestRetainedSeq
  ) {
    return { unread: true, count: null, partlyEvicted: true };
  }
  const count = Math.max(0, session.lastSeq - Math.max(0, lastSeenSeq));
  return { unread: count > 0, count, partlyEvicted: false };
}

/* ------------------------------------------------------------------ */
/* Fleet search target resolution                                     */
/* ------------------------------------------------------------------ */

export type TargetResolution =
  | { kind: "ok"; session: SessionView }
  | { kind: "ambiguous"; candidates: SessionView[] }
  | { kind: "none" };

export function resolveTarget(
  token: string,
  sessions: readonly SessionView[],
): TargetResolution {
  const raw = token.trim().replace(/^#/, "");
  if (!raw) return { kind: "none" };

  const exact = sessions.filter((session) => session.id === raw);
  if (exact.length === 1) return { kind: "ok", session: exact[0]! };

  const named = sessions.filter((session) => session.name === raw);
  if (named.length === 1) return { kind: "ok", session: named[0]! };
  if (named.length > 1) return { kind: "ambiguous", candidates: named };

  const prefixed = sessions.filter((session) => session.id.startsWith(raw));
  if (prefixed.length === 1) return { kind: "ok", session: prefixed[0]! };
  if (prefixed.length > 1) return { kind: "ambiguous", candidates: prefixed };

  return { kind: "none" };
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

export function appendEvents(
  existing: readonly EventView[],
  incoming: readonly EventView[],
  lastSeq: number,
): { events: EventView[]; added: number; gap: boolean } {
  const sorted = [...incoming].sort((a, b) => a.seq - b.seq);
  const accepted: EventView[] = [];
  let cursor = lastSeq;
  let gap = false;
  for (const event of sorted) {
    if (event.seq <= cursor) continue;
    if (event.seq > cursor + 1 && cursor > 0) gap = true;
    accepted.push(event);
    cursor = event.seq;
  }
  if (accepted.length === 0) return { events: [...existing], added: 0, gap: false };
  return { events: [...existing, ...accepted], added: accepted.length, gap };
}

export function mergeEvents(
  existing: readonly EventView[],
  incoming: readonly EventView[],
  max = 5000,
): { events: EventView[]; added: number; dropped: number } {
  const map = new Map<number, EventView>();
  for (const event of existing) map.set(event.seq, event);
  let added = 0;
  for (const event of incoming) {
    if (!map.has(event.seq)) {
      map.set(event.seq, event);
      added += 1;
    }
  }
  const events = [...map.values()].sort((a, b) => a.seq - b.seq);
  const dropped = Math.max(0, events.length - max);
  return {
    events: dropped > 0 ? events.slice(dropped) : events,
    added,
    dropped,
  };
}

export function lastEventTime(session: SessionView): string {
  return session.lastEvent?.at ?? session.lastActivityAt;
}

export function lastEventLabel(session: SessionView, lastEventCapability: boolean): string {
  if (session.lastEvent) {
    return session.lastEvent.title || session.lastEvent.type;
  }
  return lastEventCapability ? "No events yet" : "Not reported by this supervisor";
}

/* ------------------------------------------------------------------ */
/* Transcript render items                                            */
/* ------------------------------------------------------------------ */

export type RenderItem =
  | {
      kind: "message";
      id: string;
      type: "agent.message" | "agent.thought" | "user.message" | "session.message";
      text: string;
      at: string;
      turn: number | null;
      seq: number;
      events: EventView[];
    }
  | {
      kind: "tool";
      id: string;
      name: string;
      title: string;
      status: string;
      input: string | null;
      output: string | null;
      at: string;
      turn: number | null;
      seq: number;
      events: EventView[];
    }
  | {
      kind: "compaction";
      id: string;
      status: string;
      summary: string;
      error: string | null;
      at: string;
      turn: number | null;
      seq: number;
      events: EventView[];
    }
  | {
      kind: "permission";
      id: string;
      requestId: string | null;
      title: string;
      request: EventView | null;
      resolution: EventView | null;
      at: string;
      turn: number | null;
      seq: number;
    }
  | {
      kind: "event";
      id: string;
      event: EventView;
    };

const MESSAGE_TYPES = new Set([
  "agent.message",
  "agent.thought",
  "user.message",
  "session.message",
]);

export function buildRenderItems(events: readonly EventView[]): RenderItem[] {
  const items: RenderItem[] = [];
  const messageIndex = new Map<string, number>();
  const toolIndex = new Map<string, number>();
  const compactionIndex = new Map<string, number>();
  const permissionIndex = new Map<string, number>();

  for (const event of events) {
    const messageId = stringField(event.data, ["messageId", "id"]);
    if (MESSAGE_TYPES.has(event.type)) {
      const key = `${event.type}:${messageId ?? event.seq}`;
      const existing = messageIndex.get(key);
      const text = stringField(event.data, ["text", "delta", "content"]) ?? "";
      if (existing !== undefined) {
        const item = items[existing];
        if (item && item.kind === "message") item.text += text;
      } else {
        messageIndex.set(key, items.length);
        items.push({
          kind: "message",
          id: key,
          type: event.type as "agent.message" | "agent.thought" | "user.message" | "session.message",
          text,
          at: event.at,
          turn: event.turn,
          seq: event.seq,
          events: [event],
        });
      }
      continue;
    }

    if (
      event.type === "permission.requested" ||
      event.type === "permission.resolved"
    ) {
      const requestId = stringField(event.data, ["requestId"]);
      const key = requestId ?? `permission-${event.seq}`;
      const existing = permissionIndex.get(key);
      if (existing !== undefined) {
        const item = items[existing];
        if (item && item.kind === "permission") {
          if (event.type === "permission.requested") item.request = event;
          else item.resolution = event;
        }
        continue;
      }
      permissionIndex.set(key, items.length);
      items.push({
        kind: "permission",
        id: key,
        requestId,
        title:
          event.type === "permission.requested"
            ? eventText(event) || "Permission"
            : "Permission",
        request: event.type === "permission.requested" ? event : null,
        resolution: event.type === "permission.resolved" ? event : null,
        at: event.at,
        turn: event.turn,
        seq: event.seq,
      });
      continue;
    }

    if (event.type === "tool.call" || event.type === "tool.update") {
      const callId =
        stringField(event.data, ["toolCallId", "callId", "id"]) ?? `tool-${event.seq}`;
      const existing = toolIndex.get(callId);
      if (existing !== undefined) {
        const item = items[existing];
        if (item && item.kind === "tool") {
          item.status =
            stringField(event.data, ["status", "state"]) ?? item.status;
          item.input =
            item.input ??
            payloadField(event.data, ["input", "rawInput", "arguments"]);
          item.output =
            payloadField(event.data, ["output", "rawOutput", "text", "content"]) ??
            item.output;
          item.at = event.at;
          item.events.push(event);
        }
      } else {
        toolIndex.set(callId, items.length);
        items.push({
          kind: "tool",
          id: callId,
          name: stringField(event.data, ["name", "tool", "toolName"]) ?? "tool",
          title: stringField(event.data, ["title", "command", "description"]) ?? "",
          status: stringField(event.data, ["status", "state"]) ?? "running",
          input: payloadField(event.data, ["input", "rawInput", "arguments"]),
          output: payloadField(event.data, ["output", "rawOutput", "content"]),
          at: event.at,
          turn: event.turn,
          seq: event.seq,
          events: [event],
        });
      }
      continue;
    }

    if (event.type === "compaction") {
      const compactionId = stringField(event.data, ["compactionId", "id"]) ?? `compaction-${event.seq}`;
      const existing = compactionIndex.get(compactionId);
      const text = stringField(event.data, ["text", "summary", "content"]) ?? "";
      const status = stringField(event.data, ["status"]) ?? "in_progress";
      if (existing !== undefined) {
        const item = items[existing];
        if (item && item.kind === "compaction") {
          if (event.data.chunk === true) item.summary += text;
          else item.summary = text || item.summary;
          item.status = status;
          item.error = stringField(event.data, ["error"]) ?? item.error;
          item.at = event.at;
          item.events.push(event);
        }
      } else {
        compactionIndex.set(compactionId, items.length);
        items.push({
          kind: "compaction",
          id: compactionId,
          status,
          summary: event.data.chunk === true ? text : text,
          error: stringField(event.data, ["error"]),
          at: event.at,
          turn: event.turn,
          seq: event.seq,
          events: [event],
        });
      }
      continue;
    }

    items.push({
      kind: "event",
      id: `event-${event.seq}`,
      event,
    });
  }

  return items;
}

export function eventText(event: EventView): string {
  return (
    stringField(event.data, [
      "text",
      "textPreview",
      "content",
      "title",
      "summary",
      "message",
      "prompt",
      "command",
      "reason",
      "error",
      "name",
    ]) ?? ""
  );
}

export function eventTitle(event: EventView): string {
  const value = eventText(event).replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}

export function eventActor(event: EventView): string | null {
  return stringField(event.data, ["by", "from", "actor", "createdBy"]);
}

export function payloadField(
  data: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value !== null && typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        // Fall through to the next candidate.
      }
    }
  }
  return null;
}

export function stringField(
  data: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

export function numberField(
  data: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                         */
/* ------------------------------------------------------------------ */

export function formatAge(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 1) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatElapsed(
  start: string | null | undefined,
  now: number,
  end?: string | null,
): string {
  if (!start) return "—";
  const from = Date.parse(start);
  if (!Number.isFinite(from)) return "—";
  const to = end ? Date.parse(end) : now;
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function formatCost(usage: SessionUsageView | null): string {
  if (!usage || !usage.cost) return "not reported";
  const { amount, currency } = usage.cost;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 4,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

export function contextPercent(usage: SessionUsageView | null): number | null {
  if (!usage || usage.size <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((usage.used / usage.size) * 100)));
}

export function planKindLabel(plan: SessionPlanView): string {
  if (plan.kind === "items") return "plan";
  if (plan.kind === "file") return "plan file";
  return "plan note";
}

export function descendantsOf(
  sessionId: string,
  sessions: readonly SessionView[],
): SessionView[] {
  const descendants: SessionView[] = [];
  const queue = [sessionId];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const session of sessions) {
      if (session.parentId === parent) {
        descendants.push(session);
        queue.push(session.id);
      }
    }
  }
  return descendants;
}

export function rootOf(
  session: SessionView,
  sessions: readonly SessionView[],
): SessionView | null {
  if (session.rootId === session.id) return null;
  return sessions.find((candidate) => candidate.id === session.rootId) ?? null;
}

export function parentOf(
  session: SessionView,
  sessions: readonly SessionView[],
): SessionView | null {
  if (!session.parentId) return null;
  return sessions.find((candidate) => candidate.id === session.parentId) ?? null;
}

export function childrenOf(
  sessionId: string,
  sessions: readonly SessionView[],
): SessionView[] {
  return sessions.filter((session) => session.parentId === sessionId);
}
