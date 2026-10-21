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

/** Stable identity for one attention episode; a new request or failure is a new key. */
export function attentionKey(item: AttentionItem): string {
  if (item.kind === "permission") {
    return `${item.session.id}:permission:${item.permission?.requestId ?? ""}`;
  }
  if (item.kind === "failure") {
    return `${item.session.id}:failure:${item.session.endedAt ?? ""}`;
  }
  return `${item.session.id}:notice:${item.noticeSeq ?? ""}`;
}

/**
 * Cycle through the attention queue. With nothing selected, both directions
 * start at the first item; otherwise the walk wraps.
 */
export function nextAttentionSession(
  items: readonly AttentionItem[],
  currentId: string | null,
  direction: 1 | -1,
): SessionView | null {
  if (items.length === 0) return null;
  const index = items.findIndex((item) => item.session.id === currentId);
  if (index === -1) return items[0]!.session;
  return items[(index + direction + items.length) % items.length]!.session;
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

/** The newest notice in a batch; a notice is a reported signal, not attention by itself. */
export function latestNotice(events: readonly EventView[]): NoticeRecord | null {
  let latest: NoticeRecord | null = null;
  for (const event of events) {
    const notice = noticeFromEvent(event);
    if (notice && (!latest || notice.seq > latest.seq)) latest = notice;
  }
  return latest;
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
    session.firstPrompt ?? "",
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

/**
 * Agent messages after the local read cursor. A streamed message can span many
 * `agent.message` events, so chunks that share a message id count once; a
 * provider that sends no id counts each event. Tool calls, thoughts, usage, and
 * other activity are deliberately excluded: the sequence delta is noise, the
 * messages are what the operator has not read.
 */
export function countNewAgentMessages(
  events: readonly EventView[],
  afterSeq: number,
): number {
  const messages = new Set<string>();
  let anonymous = 0;
  for (const event of events) {
    if (event.seq <= afterSeq || event.type !== "agent.message") continue;
    const id = stringField(event.data, ["messageId", "id"]);
    if (id) messages.add(id);
    else anonymous += 1;
  }
  return messages.size + anonymous;
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
      /** The provider reports MCP tools by name or by an explicit marker. */
      mcp: boolean;
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

/**
 * Message chunks may be whitespace-only. Keep them: they carry the spaces
 * between words and the blank lines that separate Markdown blocks.
 */
function messageChunk(data: Record<string, unknown>): string {
  for (const key of ["text", "delta", "content"]) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export function buildRenderItems(events: readonly EventView[]): RenderItem[] {
  const items: RenderItem[] = [];
  const messageIndex = new Map<string, number>();
  const toolIndex = new Map<string, number>();
  const compactionIndex = new Map<string, number>();
  const permissionIndex = new Map<string, number>();
  // A provider may stream a thought without a message id. Consecutive chunks
  // are one continuous thought, so keep extending the open item; a keyed
  // thought or any other event closes the run.
  let openThought: number | null = null;

  for (const event of events) {
    if (event.type !== "agent.thought") openThought = null;
    const messageId = stringField(event.data, ["messageId", "id"]);
    if (MESSAGE_TYPES.has(event.type)) {
      const text = messageChunk(event.data);
      if (event.type === "agent.thought" && !messageId && openThought !== null) {
        const item = items[openThought];
        if (item && item.kind === "message") {
          item.text += text;
          item.events.push(event);
          continue;
        }
      }
      const key = `${event.type}:${messageId ?? event.seq}`;
      const existing = messageIndex.get(key);
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
      openThought =
        event.type === "agent.thought" && !messageId ? items.length - 1 : null;
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
          // Later events carry the real values. `??` on the old value would
          // keep the adapter's initial `{}` input and the first partial
          // output forever, so take the newest non-empty payload instead.
          item.name = toolNameFrom(event.data) || item.name;
          item.title = toolTitleFrom(event.data) || item.title;
          item.status = stringField(event.data, ["status", "state"]) ?? item.status;
          item.mcp = item.mcp || toolMcpFrom(event.data);
          item.input = toolInputFrom(event.data) ?? item.input;
          item.output = toolOutputFrom(event.data) ?? item.output;
          item.at = event.at;
          item.events.push(event);
        }
      } else {
        toolIndex.set(callId, items.length);
        items.push({
          kind: "tool",
          id: callId,
          name: toolNameFrom(event.data) || "tool",
          title: toolTitleFrom(event.data),
          status: stringField(event.data, ["status", "state"]) ?? "running",
          mcp: toolMcpFrom(event.data),
          input: toolInputFrom(event.data),
          output: toolOutputFrom(event.data),
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

/* ------------------------------------------------------------------ */
/* Transcript view modes                                              */
/* ------------------------------------------------------------------ */

/** Events that belong to the provider's machinery, not the conversation. */
const SYSTEM_EVENT_TYPES = new Set([
  "usage",
  "plan",
  "plan.update",
  "commands",
  "stderr",
  "session.initialized",
  "session.info",
]);

export function isSystemItem(item: RenderItem): boolean {
  if (item.kind === "compaction") {
    return item.status === "completed" && !item.error;
  }
  return item.kind === "event" && SYSTEM_EVENT_TYPES.has(item.event.type);
}

/**
 * The last line of a streamed thought, as one line suitable for a collapsed
 * summary. The tail is kept when a line is too long: that is the text the
 * agent is currently producing.
 */
export function lastThoughtLine(text: string, max = 160): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let line = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index]!
      .trim()
      .replace(/^(?:#{1,6}\s+|>\s?|[-*+]\s+)/, "")
      .replace(/\s+/g, " ");
    if (!candidate) continue;
    if (/^`{3,}$/.test(candidate) || /^[-*_]{3,}$/.test(candidate)) continue;
    line = candidate;
    break;
  }
  if (line.length <= max) return line;
  return `…${line.slice(line.length - (max - 1))}`;
}

/** MCP names are namespaced by the adapter; the summary does not need the prefix. */
export function mcpToolLabel(name: string): string {
  return name.replace(/^mcp[_:/-]+/i, "").replace(/__/g, " · ");
}

export function renderItemSeq(item: RenderItem): number {
  return item.kind === "event" ? item.event.seq : item.seq;
}

export function renderItemTurn(item: RenderItem): number | null {
  return item.kind === "event" ? item.event.turn : item.turn;
}

export function renderItemAt(item: RenderItem): string {
  return item.kind === "event" ? item.event.at : item.at;
}

export type ActivityLine =
  | { kind: "tool"; name: string; title: string; mcp: boolean }
  | { kind: "thought"; text: string };

/** One collapsed run of activity between conversation messages. */
export type ActivityGroupRow = {
  kind: "activity";
  id: string;
  items: RenderItem[];
  tools: number;
  mcp: number;
  thoughts: number;
  last: ActivityLine | null;
  at: string;
  turn: number | null;
  seq: number;
  endSeq: number;
};

export type TranscriptRow = { kind: "item"; item: RenderItem } | ActivityGroupRow;

/**
 * Minimal mode keeps the conversation anchors and collapses the work between
 * them into one row. Failures, notices, discarded prompts, and terminal
 * markers stay visible: a compact view must not hide a decision or a problem.
 */
function isMinimalAnchor(item: RenderItem): boolean {
  if (item.kind === "message") return item.type !== "agent.thought";
  if (item.kind === "compaction") {
    return item.error !== null || item.status === "failed" || item.status === "error";
  }
  if (item.kind !== "event") return false;
  const type = item.event.type;
  return (
    type === "prompt.sent" ||
    type === "prompt.queued" ||
    type === "prompt.discarded" ||
    type === "notice" ||
    type === "error" ||
    type === "session.failed" ||
    type === "session.closed"
  );
}

export function buildTranscriptRows(
  items: readonly RenderItem[],
  minimal: boolean,
): TranscriptRow[] {
  if (!minimal) return items.map((item) => ({ kind: "item", item }));

  const rows: TranscriptRow[] = [];
  let pending: RenderItem[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    let tools = 0;
    let mcp = 0;
    let thoughts = 0;
    let last: ActivityLine | null = null;
    for (const item of pending) {
      if (item.kind === "tool") {
        if (item.mcp) mcp += 1;
        else tools += 1;
        last = { kind: "tool", name: item.name, title: item.title, mcp: item.mcp };
      } else if (item.kind === "message" && item.type === "agent.thought") {
        thoughts += 1;
        const text = lastThoughtLine(item.text);
        if (text) last = { kind: "thought", text };
      }
    }
    // Minimal mode is about the work between messages. A run of structural
    // or provider-state events with no tool, MCP call, or thought would render
    // as a contentless "N events" row; leave it to Default/System instead.
    if (tools + mcp + thoughts === 0) {
      pending = [];
      return;
    }
    const first = pending[0]!;
    const lastItem = pending[pending.length - 1]!;
    rows.push({
      kind: "activity",
      id: `activity-${renderItemSeq(first)}`,
      items: pending,
      tools,
      mcp,
      thoughts,
      last,
      at: renderItemAt(first),
      turn: renderItemTurn(first),
      seq: renderItemSeq(first),
      endSeq: renderItemSeq(lastItem),
    });
    pending = [];
  };

  for (const item of items) {
    if (isMinimalAnchor(item)) {
      flush();
      rows.push({ kind: "item", item });
    } else {
      pending.push(item);
    }
  }
  flush();
  return rows;
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

/** An empty object/array/string is what adapters send before the real value. */
function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function payloadField(
  data: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (isEmptyPayload(value)) continue;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      // Fall through to the next candidate.
    }
  }
  return null;
}

/**
 * ACP `ToolCallContent` is an array of content blocks, not a string. Render
 * text blocks as text; keep diffs and anything else as readable JSON rather
 * than dumping the wrapper object.
 */
function contentPayload(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts: string[] = [];
  for (const block of value) {
    if (block === null || typeof block !== "object") continue;
    const record = block as Record<string, unknown>;
    if (record.type === "content" && record.content !== null && typeof record.content === "object") {
      const inner = record.content as Record<string, unknown>;
      if (typeof inner.text === "string" && inner.text.length > 0) {
        parts.push(inner.text);
        continue;
      }
    }
    if (record.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
      continue;
    }
    if (record.type === "diff") {
      const path = typeof record.path === "string" ? record.path : "diff";
      const before = typeof record.oldText === "string" ? record.oldText : "";
      const after = typeof record.newText === "string" ? record.newText : "";
      parts.push(`${path}\n--- before\n${before}\n+++ after\n${after}`);
      continue;
    }
    parts.push(JSON.stringify(record, null, 2));
  }
  const text = parts.join("\n").trim();
  return text.length > 0 ? text : null;
}

function toolNameFrom(data: Record<string, unknown>): string {
  return stringField(data, ["name", "tool", "toolName"]) ?? "";
}

/**
 * There is no MCP event type on the wire: an MCP call is an ordinary
 * `tool.call`. Adapters name them `mcp__<server>__<tool>` (Claude Code), and
 * some add an explicit marker. Treat any of those as MCP; a plain tool named
 * "mcp" would be mislabeled, which is the honest cost of a name-based hint.
 */
function toolMcpFrom(data: Record<string, unknown>): boolean {
  if (data.mcp === true || data.isMcp === true || data.kind === "mcp") return true;
  if (
    typeof data.mcpServer === "string" ||
    typeof data.mcpServerName === "string" ||
    typeof data.serverName === "string"
  ) {
    return true;
  }
  return /^mcp(?:[_:/-]|$)/i.test(toolNameFrom(data));
}

function toolTitleFrom(data: Record<string, unknown>): string {
  return stringField(data, ["title", "command", "description"]) ?? "";
}

function toolInputFrom(data: Record<string, unknown>): string | null {
  return payloadField(data, ["input", "rawInput", "arguments"]);
}

function toolOutputFrom(data: Record<string, unknown>): string | null {
  return (
    payloadField(data, ["output", "rawOutput", "text"]) ??
    contentPayload(data.content)
  );
}

export type ToolPayload = {
  title: string;
  input: string | null;
  output: string | null;
};

/**
 * Fold raw `tool.call`/`tool.update` events into the payload a tool row
 * shows. The transcript receives redacted events live, so the dashboard
 * fetches this with `raw: true` when the operator opens a row.
 */
export function toolPayloadFromEvents(
  events: readonly EventView[],
  toolCallId: string,
): ToolPayload {
  let title = "";
  let input: string | null = null;
  let output: string | null = null;
  for (const event of events) {
    if (event.type !== "tool.call" && event.type !== "tool.update") continue;
    const id = stringField(event.data, ["toolCallId", "callId", "id"]);
    if (id !== toolCallId) continue;
    title = toolTitleFrom(event.data) || title;
    input = toolInputFrom(event.data) ?? input;
    output = toolOutputFrom(event.data) ?? output;
  }
  return { title, input, output };
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
