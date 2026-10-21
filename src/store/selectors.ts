import type { RecoveryReceiptView, SessionView } from "../wire/protocol";
import { hasCapability } from "../wire/protocol";
import {
  attentionFor,
  isTerminalStatus,
  sessionLocalKey,
  type AttentionItem,
} from "./model";
import { EMPTY_EVENTS, type DashboardState, type SessionEventsState } from "./types";

/** Derived views over one `DashboardState`. No selector mutates state. */

export function selectedSession(state: DashboardState): SessionView | null {
  if (!state.selection) return null;
  const session = state.sessions[state.selection.id];
  if (!session) return null;
  return session.createdAt === state.selection.createdAt ? session : null;
}

export function eventsFor(
  state: DashboardState,
  sessionId: string | null,
): SessionEventsState {
  if (!sessionId) return EMPTY_EVENTS;
  return state.events[sessionId] ?? EMPTY_EVENTS;
}

export function attentionItems(state: DashboardState): AttentionItem[] {
  return attentionFor(Object.values(state.sessions), state.notices, {
    acknowledged: state.local.acknowledged,
    dismissedNotices: state.local.dismissedNotices,
  });
}

export function canUse(state: DashboardState, capability: string): boolean {
  return state.instance ? hasCapability(state.instance.capabilities, capability) : false;
}

export type OrphanDraft = { key: string; text: string; updatedAt: number };

/** Drafts whose session local key is not present in the live instance. */
export function orphanedDrafts(state: DashboardState): OrphanDraft[] {
  const liveKeys = new Set(
    Object.values(state.sessions).map((session) => sessionLocalKey(session)),
  );
  return Object.entries(state.local.drafts)
    .filter(([key]) => !liveKeys.has(key))
    .map(([key, draft]) => ({ key, text: draft.text, updatedAt: draft.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Recoverable rail rows: unattached receipts matching the local filter. */
export function recoverableReceipts(
  receipts: readonly RecoveryReceiptView[],
  query: string,
): RecoveryReceiptView[] {
  const needle = query.trim().toLowerCase();
  return receipts.filter((receipt) => {
    if (receipt.attached) return false;
    if (needle.length === 0) return true;
    return [
      receipt.name ?? "",
      receipt.childProviderId,
      receipt.backend,
      receipt.cwd,
      receipt.parentHlaoName ?? "",
      receipt.parentHlaoSessionId ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/** Every session that can still run a turn, oldest handle order is caller-owned. */
export function activeSessions(state: DashboardState): SessionView[] {
  return Object.values(state.sessions).filter(
    (session) => !isTerminalStatus(session.status),
  );
}
