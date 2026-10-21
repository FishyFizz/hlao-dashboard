import type { EventView } from "../../wire/protocol";
import {
  eventText,
  stringField,
  toolInputFrom,
  toolMcpFrom,
  toolNameFrom,
  toolOutputFrom,
  toolTitleFrom,
} from "./events";

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
    type === "prompt.steered" ||
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
