import type {
  AgentView,
  BackendsListResult,
  EventView,
  HelloResult,
  ProviderSessionView,
  ProviderSessionsResult,
  QueueItemView,
  QueueResult,
  ReadParams,
  ReadResult,
  RecoveryReceiptView,
  RecoveryReceiptsResult,
  SessionView,
  SubscribeParams,
  SubscribeResult,
  UnsubscribeResult,
  WaitResult,
} from "../wire/protocol";
import { ago, HOUR, MINUTE, preview, wireError, type PendingPrompt } from "./support";
import type { DemoState } from "./types";
import { isTerminal, requireSession } from "./world";

/** Read-only projections and subscriptions over the demo world. */

export function hello(state: DemoState): HelloResult {
  return {
    protocolVersion: { major: 3, minor: 1 },
    capabilities: [
      "backends.list",
      "backends.sessions",
      "session.pendingPermissions",
      "permit.request",
      "session.usage",
      "read.filters",
      "read.before",
      "read.time",
      "read.regex",
      "read.context",
      "wait.multi",
      "stream.persistent",
      "stream.subscribe",
      "stream.resume",
      "wait.settled",
      "wait.filters",
      "session.settled",
      "session.lastEvent",
      "send.messageId",
      "send.idempotency",
      "send.steering",
      "spawn.idempotency",
      "spawn.createdBy",
      "supervisor.lastCrash",
      "prompt.injected",
      "session.compaction",
      "session.notices",
      "session.plan",
      "session.title",
      "session.firstPrompt",
      "session.agent",
      "session.messages",
      "spawn.resume",
      "spawn.fork",
      "recovery.receipts",
    ],
    pid: 4242,
    startedAt: state.startedAt,
    version: "0.16.0-demo",
    sessions: state.sessions.size,
    configHash: "demo-config",
    stream: { persistent: true },
  };
}

export function providerSessions(
  state: DemoState,
  backend: string,
  cwd: string | null,
): ProviderSessionsResult {
  const rows: ProviderSessionView[] = [];
  for (const session of state.sessions.values()) {
    if (session.backend !== backend || !session.agentSessionId) continue;
    rows.push({
      sessionId: session.agentSessionId,
      cwd: session.cwd,
      title: session.title ?? null,
      updatedAt: session.lastActivityAt,
      attached:
        session.status !== "closed" && session.status !== "failed",
      hlaoSessionId: session.id,
      hlaoName: session.name,
      hlaoStatus: session.status,
      loadable: true,
      forkable: true,
    });
  }
  const backendCwd = rows[0]?.cwd ?? "D:\\work\\svc";
  rows.push({
    sessionId: `demo-provider-${backend || "unknown"}-1`,
    cwd: backendCwd,
    title: "Earlier investigation",
    updatedAt: ago(state.now, 3 * HOUR),
    attached: false,
    hlaoSessionId: null,
    hlaoName: null,
    hlaoStatus: null,
    loadable: true,
    forkable: true,
  });
  return {
    backend,
    cwd,
    agentName: "demo-agent",
    agentVersion: "1.0.0",
    sessions:
      cwd === null ? rows : rows.filter((row) => row.cwd === cwd),
    nextCursor: null,
  };
}

export function recoveryReceipts(state: DemoState): RecoveryReceiptsResult {
  const live = (providerId: string, backend?: string): SessionView | null =>
    [...state.sessions.values()].find(
      (session) =>
        session.agentSessionId === providerId &&
        (backend === undefined || session.backend === backend) &&
        session.status !== "closed" &&
        session.status !== "failed",
    ) ?? null;
  const seeds = [
    {
      parentProviderId: "acp-8812",
      parentSessionId: "old-refactor",
      childProviderId: "demo-provider-claude-1",
      childSessionId: "old-auth-tests",
      backend: "claude",
      cwd: "D:\\work\\auth",
      name: "auth-tests",
      recordedAt: ago(state.now, 2 * HOUR),
    },
    {
      parentProviderId: "acp-9101",
      parentSessionId: "old-probe",
      childProviderId: "demo-provider-codex-1",
      childSessionId: "old-probe-helper",
      backend: "codex",
      cwd: "D:\\work\\svc",
      name: "probe-helper",
      recordedAt: ago(state.now, 3 * HOUR),
    },
    {
      parentProviderId: "acp-8812",
      parentSessionId: "old-refactor",
      childProviderId: "acp-9101",
      childSessionId: "old-codex-probe",
      backend: "codex",
      cwd: "D:\\work\\svc",
      name: "codex-probe",
      recordedAt: ago(state.now, 30 * MINUTE),
    },
  ];
  const receipts: RecoveryReceiptView[] = seeds
    .map((seed) => {
      const child = live(seed.childProviderId, seed.backend);
      const parent = live(seed.parentProviderId);
      return {
        ...seed,
        attached: child !== null,
        hlaoSessionId: child?.id ?? null,
        hlaoName: child?.name ?? null,
        hlaoStatus: child?.status ?? null,
        parentHlaoSessionId: parent?.id ?? null,
        parentHlaoName: parent?.name ?? null,
        parentHlaoStatus: parent?.status ?? null,
      };
    })
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  return { receipts };
}

export function backends(): BackendsListResult {
  const list: AgentView[] = [
    {
      name: "claude",
      source: "builtin",
      command: "claude-agent-acp",
      args: [],
      envKeys: ["ANTHROPIC_API_KEY"],
      description: "Claude Agent ACP",
      available: true,
      defaultMode: "default",
    },
    {
      name: "codex",
      source: "builtin",
      command: "codex-acp",
      args: [],
      envKeys: ["OPENAI_API_KEY"],
      description: "Codex ACP",
      available: true,
      defaultMode: "agent",
    },
    {
      name: "gemini",
      source: "user",
      command: "gemini-cli",
      args: ["--acp"],
      envKeys: ["GEMINI_API_KEY"],
      description: "Gemini CLI",
      configPath: "~/.hlao/agents.json",
      available: true,
      defaultMode: "default",
    },
    {
      name: "amp",
      source: "project",
      command: "amp-acp",
      args: [],
      envKeys: [],
      description: "Project backend",
      configPath: "D:\\work\\.hlao\\agents.json",
      available: false,
      unavailableReason: "command not found: amp-acp",
      defaultMode: "default",
    },
  ];
  return { backends: list };
}

export function list(state: DemoState, includeClosed: boolean): { sessions: SessionView[] } {
  const sessions = [...state.sessions.values()]
    .filter((session) => includeClosed || !isTerminal(session))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { sessions };
}

export function get(state: DemoState, sessionId: string): { session: SessionView } {
  return { session: requireSession(state, sessionId) };
}

export function read(state: DemoState, params: ReadParams): ReadResult {
  const session = requireSession(state, params.sessionId);
  const all = state.events.get(session.id) ?? [];
  const earliestRetainedSeq = 1;
  const lastSeq = all.length;
  const limit = Math.min(1000, Math.max(1, params.limit ?? 100));
  const afterAt = params.afterAt === undefined ? undefined : Date.parse(params.afterAt);
  const beforeAt = params.beforeAt === undefined ? undefined : Date.parse(params.beforeAt);
  let grepRegex: RegExp | null = null;
  if (params.regex === true && typeof params.grep === "string" && params.grep.length > 0) {
    try {
      grepRegex = new RegExp(params.grep, "i");
    } catch {
      grepRegex = null;
    }
  }
  const filtered = all.filter((event) => {
    if (params.types && params.types.length > 0 && !params.types.includes(event.type)) {
      return false;
    }
    if (params.turn !== undefined && event.turn !== params.turn) return false;
    const at = Date.parse(event.at);
    if (afterAt !== undefined && at < afterAt) return false;
    if (beforeAt !== undefined && at >= beforeAt) return false;
    if (grepRegex !== null) {
      const haystack = `${event.type} ${JSON.stringify(event.data)}`;
      if (!grepRegex.test(haystack)) return false;
    } else if (typeof params.grep === "string" && params.grep.trim().length > 0) {
      const needle = params.grep.toLowerCase();
      const haystack = `${event.type} ${JSON.stringify(event.data)}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  let events: EventView[];
  let nextSeq = lastSeq;
  let nextBefore: number | null = null;
  let hasMore = false;
  let truncated = false;

  if (params.since !== undefined) {
    const since = Math.max(0, params.since);
    const forward = filtered.filter((event) => event.seq > since);
    events = forward.slice(0, limit);
    nextSeq = events.length > 0 ? events[events.length - 1]!.seq : since;
    hasMore = forward.length > events.length;
    truncated = since + 1 < earliestRetainedSeq;
  } else if (params.before !== undefined) {
    const before = params.before;
    const backward = filtered.filter((event) => event.seq < before);
    events = backward.slice(Math.max(0, backward.length - limit));
    hasMore = backward.length > events.length;
    nextBefore = events.length > 0 ? events[0]!.seq : null;
    nextSeq = lastSeq;
    truncated = earliestRetainedSeq > 1;
  } else {
    events = filtered.slice(Math.max(0, filtered.length - limit));
    nextSeq = lastSeq;
    nextBefore = events.length > 0 ? events[0]!.seq : null;
    hasMore = false;
    truncated = earliestRetainedSeq > 1;
  }

  let matchedSeqs: number[] | undefined;
  const context = Math.max(0, Math.min(20, params.context ?? 0));
  if (context > 0 && events.length > 0) {
    matchedSeqs = events.map((event) => event.seq);
    const bySeq = new Map<number, EventView>();
    for (const event of events) bySeq.set(event.seq, event);
    for (const match of events) {
      for (const event of all) {
        if (event.seq >= match.seq - context && event.seq <= match.seq + context) {
          bySeq.set(event.seq, event);
        }
      }
    }
    events = [...bySeq.values()].sort((left, right) => left.seq - right.seq);
  }

  return {
    session,
    events,
    earliestRetainedSeq,
    lastSeq,
    nextSeq,
    nextBefore,
    hasMore,
    truncated,
    ...(matchedSeqs !== undefined ? { matchedSeqs } : {}),
  };
}

export function queue(state: DemoState, sessionId: string): QueueResult {
  const session = requireSession(state, sessionId);
  const active = state.active.get(session.id) ?? null;
  const queued = state.queues.get(session.id) ?? [];
  return {
    session,
    active: active ? queueView(active, null, session.turn) : null,
    queue: queued.map((prompt, index) =>
      queueView(prompt, index + 1, session.turn),
    ),
  };
}

export function queueView(
  prompt: PendingPrompt,
  position: number | null,
  turn: number | null,
): QueueItemView {
  return {
    position,
    textPreview: preview(prompt.text),
    textLength: prompt.text.length,
    id: prompt.id,
    from: prompt.from,
    queuedMs: Math.max(0, Date.now() - prompt.queuedAt),
    turn,
  };
}

export function wait(state: DemoState, params: Record<string, unknown>): WaitResult {
  const until = String(params.until ?? "settled");
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  const sessionIds = Array.isArray(params.sessionIds)
    ? params.sessionIds.filter((id): id is string => typeof id === "string")
    : sessionId
      ? [sessionId]
      : [];
  const results = sessionIds.map((id) => {
    const session = requireSession(state, id);
    const satisfied = conditionSatisfied(session, until);
    return {
      session,
      satisfied,
      reason: satisfied ? (until as WaitResult["reason"]) : ("pending" as const),
    };
  });
  return {
    satisfied: results.length > 0 && results.every((result) => result.satisfied),
    reason: results.length > 0 && results.every((result) => result.satisfied)
      ? (until as WaitResult["reason"])
      : "timeout",
    waitedMs: 0,
    results,
    ...(sessionId && results[0] ? { session: results[0].session } : {}),
  };
}

export function conditionSatisfied(session: SessionView, until: string): boolean {
  if (until === "idle") return session.status === "idle";
  if (until === "settled") return session.settled || session.status === "waiting_permission" || isTerminal(session);
  if (until === "permission") return session.pendingPermissions.length > 0;
  if (until === "exit") return isTerminal(session);
  return false;
}

export function subscribe(state: DemoState, params: SubscribeParams): SubscribeResult {
  if (!params.fleet && (!params.sessionIds || params.sessionIds.length === 0)) {
    throw wireError("bad_request", "a subscription needs fleet or sessionIds");
  }
  const subscription = state.nextSubscription++;
  const sessionIds = new Set(params.sessionIds ?? []);
  state.subscriptions.set(subscription, { fleet: params.fleet === true, sessionIds });
  const scoped = params.fleet
    ? [...state.sessions.values()]
    : [...state.sessions.values()].filter((session) => sessionIds.has(session.id));
  const cursors: Record<string, number> = {};
  for (const id of sessionIds) {
    const session = state.sessions.get(id);
    if (session) cursors[id] = session.lastSeq;
  }
  const truncated: string[] = [];
  if (params.since) {
    for (const [id, cursor] of Object.entries(params.since)) {
      const session = state.sessions.get(id);
      if (!session) continue;
      const all = state.events.get(id) ?? [];
      if (cursor + 1 < 1) truncated.push(id);
      const replay = all.filter((event) => event.seq > cursor);
      if (replay.length > 0) {
        setTimeout(() => {
          state.notify({
            type: "notification",
            subscription,
            kind: "event",
            sessionId: id,
            events: replay,
            cursor: replay[replay.length - 1]!.seq,
            truncated: cursor + 1 < 1,
          });
        }, 0);
      }
    }
  }
  return { subscription, sessions: scoped, cursors, truncated };
}

export function unsubscribe(state: DemoState, subscription: number): UnsubscribeResult {
  if (!state.subscriptions.delete(subscription)) {
    throw wireError("not_found", `no subscription ${subscription}`);
  }
  return { subscription, removed: true };
}
