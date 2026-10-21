import type { SessionStatus, SessionView } from "../../wire/protocol";

/** Stable identity helpers shared by every projection. */

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
