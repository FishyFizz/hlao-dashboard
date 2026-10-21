import type { EventView, SessionView } from "../../wire/protocol";
import type { AttentionItem } from "./attention";
import { stringField } from "./events";
import { displayLabel, isTerminalStatus } from "./identity";

/* ------------------------------------------------------------------ */
/* Grouping, filtering, ordering                                      */
/* ------------------------------------------------------------------ */

export type FleetGroup = "needs" | "running" | "quiet" | "ended";

export type FleetGroups = Record<FleetGroup, SessionView[]>;

export type FleetFilters = {
  query: string;
  showEnded: boolean;
};

export type FleetCounts = {
  live: number;
  running: number;
  quiet: number;
  ended: number;
};

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

/** The local fleet filter. Attention membership is applied by the caller. */
export function matchesFleetFilters(
  session: SessionView,
  filters: FleetFilters,
): boolean {
  if (!matchesQuery(session, filters.query)) return false;
  if (!filters.showEnded && isTerminalStatus(session.status)) return false;
  return true;
}

export function filterFleet(
  sessions: readonly SessionView[],
  filters: FleetFilters,
): SessionView[] {
  return sessions.filter((session) => matchesFleetFilters(session, filters));
}

export function fleetCounts(sessions: readonly SessionView[]): FleetCounts {
  const counts: FleetCounts = { live: 0, running: 0, quiet: 0, ended: 0 };
  for (const session of sessions) {
    if (isTerminalStatus(session.status)) {
      counts.ended += 1;
      continue;
    }
    counts.live += 1;
    if (session.status === "busy" || session.status === "starting") counts.running += 1;
    else if (session.status === "idle") counts.quiet += 1;
  }
  return counts;
}

/**
 * The rail's four groups. Attention membership is the `needs` group and keeps
 * the attention order; every other visible session is grouped by status and
 * sorted inside its group.
 */
export function groupFleet(
  visible: readonly SessionView[],
  attention: readonly AttentionItem[],
  sort: FleetSort,
): FleetGroups {
  const needs = attention.map((item) => item.session);
  const ranked = new Set(needs.map((session) => session.id));
  const groups: FleetGroups = { needs, running: [], quiet: [], ended: [] };
  for (const session of visible) {
    if (ranked.has(session.id)) continue;
    groups[fleetGroupFor(session, undefined)].push(session);
  }
  groups.running = sortSessions(groups.running, sort);
  groups.quiet = sortSessions(groups.quiet, sort);
  groups.ended = sortSessions(groups.ended, sort);
  return groups;
}

/**
 * The home table's order: attention first in attention order, then every
 * other matching session sorted as one list. An attention session stays
 * visible even when "ended" is hidden; attention is not a filter.
 */
export function orderedFleet(
  sessions: readonly SessionView[],
  attention: readonly AttentionItem[],
  filters: FleetFilters,
  sort: FleetSort,
): SessionView[] {
  const ranked = new Set(attention.map((item) => item.session.id));
  const attentionRows = attention
    .map((item) => item.session)
    .filter((session) => matchesQuery(session, filters.query));
  const rest = sortSessions(
    sessions.filter(
      (session) => !ranked.has(session.id) && matchesFleetFilters(session, filters),
    ),
    sort,
  );
  return [...attentionRows, ...rest];
}

/* ------------------------------------------------------------------ */
/* Unread and search                                                  */
/* ------------------------------------------------------------------ */

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
