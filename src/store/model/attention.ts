import type { EventView, PermissionView, SessionView } from "../../wire/protocol";
import { stringField } from "./events";
import { isTerminalStatus, sessionLocalKey } from "./identity";

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

/**
 * Attention is structural: a non-empty permission queue, an unacknowledged
 * failure, or an error notice. Nothing here depends on elapsed time or
 * message content.
 */
export function attentionFor(
  sessions: readonly SessionView[],
  notices: Record<string, NoticeRecord>,
  local: LocalReadingState,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const session of sessions) {
    const key = sessionLocalKey(session);

    if (
      session.status === "waiting_permission" &&
      session.pendingPermissions.length > 0
    ) {
      // One attention card per session, anchored on the oldest queued request.
      // The lens gate lists every request; this is the fleet-level pointer.
      const permission = session.pendingPermissions[0]!;
      const queued =
        session.pendingPermissions.length > 1
          ? ` · ${session.pendingPermissions.length} queued`
          : "";
      items.push({
        session,
        rank: 1,
        kind: "permission",
        reason: `${permission.title} · ${permission.kind ?? "permission"}${queued}`,
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
