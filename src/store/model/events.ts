import type { EventView, SessionView } from "../../wire/protocol";

/* ------------------------------------------------------------------ */
/* Event projection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Append events by seq. Duplicates and out-of-order events are ignored; the
 * caller owns the cursor. A gap is reported only for a forward jump in the
 * accepted range, never inferred from a stale page.
 */
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

/** Merge by seq and keep at most `max` newest events. Used by paged reads. */
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
/* Event payload access                                               */
/* ------------------------------------------------------------------ */

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
export function isEmptyPayload(value: unknown): boolean {
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
export function contentPayload(value: unknown): string | null {
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

export function toolNameFrom(data: Record<string, unknown>): string {
  return stringField(data, ["name", "tool", "toolName"]) ?? "";
}

/**
 * There is no MCP event type on the wire: an MCP call is an ordinary
 * `tool.call`. Adapters name them `mcp__<server>__<tool>` (Claude Code), and
 * some add an explicit marker. Treat any of those as MCP; a plain tool named
 * "mcp" would be mislabeled, which is the honest cost of a name-based hint.
 */
export function toolMcpFrom(data: Record<string, unknown>): boolean {
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

export function toolTitleFrom(data: Record<string, unknown>): string {
  return stringField(data, ["title", "command", "description"]) ?? "";
}

export function toolInputFrom(data: Record<string, unknown>): string | null {
  return payloadField(data, ["input", "rawInput", "arguments"]);
}

export function toolOutputFrom(data: Record<string, unknown>): string | null {
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
