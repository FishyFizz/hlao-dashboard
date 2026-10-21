/**
 * Wire protocol 3.0 — the subset this client speaks.
 *
 * This is a pinned projection of `contracts/protocol.md`, not a second
 * protocol. Method semantics live on the supervisor; these types only shape
 * the frames the bridge forwards and the demo supervisor emits.
 *
 * 3.0 removes the HLAO permission policy. The provider's mode is the policy
 * layer, every provider ask is relayed to the operator through a bounded
 * pending queue, and `sessions.permit` answers one request by id.
 */

export type ProtocolVersion = { major: number; minor: number };

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "version_mismatch"
  | "not_found"
  | "ambiguous_id"
  | "forbidden"
  | "operator_only"
  | "backend_not_found"
  | "backend_unavailable"
  | "spawn_failed"
  | "session_closed"
  | "session_not_ready"
  | "no_pending_permission"
  | "bad_option"
  | "config_invalid"
  | "session_failed"
  | "timeout"
  | "too_many_requests"
  | "supervisor_unavailable"
  | "internal";

export type WireError = {
  code: ErrorCode | "bridge_unavailable";
  message: string;
  details?: unknown;
};

export type SessionStatus =
  | "starting"
  | "idle"
  | "busy"
  | "waiting_permission"
  | "closed"
  | "failed";
export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

export const EVENT_TYPES = [
  "session.created",
  "session.initialized",
  "session.resumed",
  "session.forked",
  "session.closed",
  "session.failed",
  "session.renamed",
  "prompt.sent",
  "prompt.queued",
  "prompt.steered",
  "prompt.discarded",
  "turn.started",
  "turn.ended",
  "cancel.requested",
  "agent.message",
  "agent.thought",
  "user.message",
  "session.message",
  "tool.call",
  "tool.update",
  "plan",
  "plan.update",
  "permission.requested",
  "permission.resolved",
  "notice",
  "usage",
  "mode",
  "config",
  "commands",
  "session.info",
  "compaction",
  "subagent",
  "stderr",
  "error",
  "raw",
] as const;

/** Known types are named; unknown types still flow through and render generically. */
export type EventType = (typeof EVENT_TYPES)[number] | (string & {});

export type PermissionView = {
  requestId: string;
  toolCallId: string | null;
  title: string;
  kind: string | null;
  options: { optionId: string; name: string; kind: string }[];
  requestedAt: string;
};

/**
 * `permission.requested` event data (3.0). The view does not carry a queue
 * position; the FIFO order of `pendingPermissions` is the position.
 */
export type PermissionRequestedData = {
  requestId: string;
  toolCallId: string | null;
  title: string;
  kind: string | null;
  options: { optionId: string; name: string; kind: string }[];
  outsideTurn: boolean;
  /** 1-based FIFO position; present for a queued request. */
  queuePosition?: number;
};

/** `permission.resolved` event data (3.0). */
export type PermissionResolvedData = {
  requestId: string;
  optionId: string | null;
  optionName?: string;
  by: string;
  reason?: string;
  note?: string;
};

export type SessionModeOption = {
  id: string;
  name: string;
  description?: string;
};

export type SessionConfigValueView = {
  value: string;
  name: string;
  description?: string;
  group?: string;
};

export type SessionConfigOptionView = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: "select" | "boolean";
  currentValue: string | boolean;
  values: SessionConfigValueView[];
};

export type SessionModes = {
  currentModeId: string;
  availableModes: SessionModeOption[];
};

export type SessionUsageView = {
  used: number;
  size: number;
  cost: { amount: number; currency: string } | null;
  at: string;
};

export type SessionCompactionView = {
  id: string;
  status: string;
  summary: string | null;
  error: string | null;
  updatedAt: string;
};

export type SessionPlanEntryView = {
  content: string;
  priority: string;
  status: string;
};

export type SessionPlanView = {
  planId: string | null;
  kind: "items" | "file" | "markdown";
  entries?: SessionPlanEntryView[];
  uri?: string;
  content?: string;
  updatedAt: string;
};

export type SessionView = {
  id: string;
  name: string | null;
  createdBy: string | null;
  backend: string;
  cwd: string;
  status: SessionStatus;
  parentId: string | null;
  rootId: string;
  depth: number;
  createdAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  turn: number;
  turnStartedAt: string | null;
  queued: number;
  settled: boolean;
  lastSeq: number;
  lastEvent: {
    type: EventType;
    title: string | null;
    at: string;
  } | null;
  /** FIFO queue keyed by requestId; bounded by the supervisor (wire 3.0). */
  pendingPermissions: PermissionView[];
  lastStopReason: StopReason | null;
  agentSessionId: string | null;
  forkedFrom?: string | null;
  processId: number | null;
  exit: { code: number | null; signal: string | null } | null;
  modes: SessionModes | null;
  configOptions: SessionConfigOptionView[] | null;
  usage: SessionUsageView | null;
  compaction?: SessionCompactionView | null;
  plan?: SessionPlanView | null;
  title?: string | null;
  /** Bounded, display-only preview of the first prompt (2.8). */
  firstPrompt?: string | null;
  agentName?: string | null;
  agentVersion?: string | null;
  /** The adapter accepts mid-turn steering (`_session/steering`). (2.9) */
  steeringSupported?: boolean;
};

export type EventView = {
  seq: number;
  at: string;
  type: EventType;
  turn: number | null;
  data: Record<string, unknown>;
  /** Restored by ACP session/load, not observed live. */
  replay?: true;
};

export type AgentView = {
  name: string;
  source: "builtin" | "user" | "project";
  command: string;
  args: string[];
  envKeys: string[];
  description?: string;
  configPath?: string;
  available: boolean;
  unavailableReason?: string;
  /** Operator default provider mode from the backend manifest (3.0). */
  defaultMode?: string;
};

export type LastCrash = {
  pid: number;
  version: string;
  startedAt: string;
  detectedAt: string;
};

export type HelloResult = {
  protocolVersion: ProtocolVersion;
  capabilities: string[];
  pid: number;
  startedAt: string;
  version: string;
  sessions: number;
  configHash: string;
  configError?: string;
  lastCrash?: LastCrash;
  stream?: { persistent: boolean };
};

export type SessionNotification =
  | {
      type: "notification";
      subscription: number;
      kind: "session";
      session: SessionView;
    }
  | {
      type: "notification";
      subscription: number;
      kind: "session.removed";
      sessionId: string;
    }
  | {
      type: "notification";
      subscription: number;
      kind: "event";
      sessionId: string;
      events: EventView[];
      cursor: number;
      truncated: boolean;
    };

export type NotificationFrame = SessionNotification;

export type SubscribeParams = {
  sessionIds?: string[];
  fleet?: boolean;
  since?: Record<string, number>;
};

export type SubscribeResult = {
  subscription: number;
  sessions: SessionView[];
  cursors: Record<string, number>;
  truncated: string[];
};

export type SendParams = {
  sessionId: string;
  text: string;
  wait?: boolean;
  timeoutMs?: number;
  messageId?: string;
  idempotencyKey?: string;
  /** Inject into the running turn when the session and adapter support it (2.9). */
  steer?: boolean;
};

export type UnsubscribeResult = { subscription: number; removed: true };

export type WaitResult = {
  satisfied: boolean;
  reason: "idle" | "settled" | "permission" | "exit" | "change" | "timeout";
  waitedMs: number;
  results: {
    session: SessionView;
    satisfied: boolean;
    reason:
      | "idle"
      | "settled"
      | "permission"
      | "exit"
      | "change"
      | "timeout"
      | "pending";
  }[];
  session?: SessionView;
};

export type ReadParams = {
  sessionId: string;
  since?: number;
  before?: number;
  limit?: number;
  raw?: boolean;
  types?: EventType[];
  turn?: number;
  grep?: string;
  afterAt?: string;
  beforeAt?: string;
  regex?: boolean;
  context?: number;
};

export type ReadResult = {
  session: SessionView;
  events: EventView[];
  earliestRetainedSeq: number;
  lastSeq: number;
  nextSeq: number;
  nextBefore: number | null;
  hasMore: boolean;
  truncated: boolean;
  /** Present when context was requested: the seqs that matched. */
  matchedSeqs?: number[];
};

export type QueueItemView = {
  position: number | null;
  textPreview: string;
  textLength: number;
  id: string;
  from: string;
  queuedMs: number;
  turn: number | null;
};

export type QueueResult = {
  session: SessionView;
  active: QueueItemView | null;
  queue: QueueItemView[];
};

export type SendResult = {
  session: SessionView;
  messageId: string;
  queued: boolean;
  /** Injected into the running turn. (2.9) */
  steered?: boolean;
  turn: number | null;
  completed: boolean;
  timedOut: boolean;
  stopReason?: StopReason;
  text?: string;
  outcome?: "completed" | "cancelled" | "timed_out";
  duplicate?: boolean;
};

export type SpawnParams = {
  backend: string;
  cwd?: string;
  name?: string;
  prompt?: string;
  wait?: boolean;
  timeoutMs?: number;
  mode?: string;
  model?: string;
  config?: Record<string, string | boolean>;
  parentSessionId?: string;
  env?: Record<string, string>;
  skill?: boolean;
  idempotencyKey?: string;
  resumeSessionId?: string;
  forkSessionId?: string;
};

export type SpawnResult = {
  session: SessionView;
  nextSeq: number;
  firstTurn?: { stopReason?: StopReason; text: string; timedOut: boolean };
  messageId?: string;
  duplicate?: boolean;
  resumed?: boolean;
  forked?: boolean;
  createdBy?: string;
};

export type PermitParams = {
  sessionId: string;
  /** Required when more than one request is pending. */
  requestId?: string;
  optionId: string;
};
export type CancelResult = { session: SessionView; discarded: number };
export type CloseResult = {
  session: SessionView;
  killed: boolean;
  wasTerminal: boolean;
};
export type PermitResult = {
  session: SessionView;
  requestId: string;
  optionId: string;
  by: "operator";
};
export type RenameResult = { session: SessionView };
export type ForgetResult = { sessionId: string; forgotten: true };
export type QueueDropResult = {
  session: SessionView;
  dropped: QueueItemView;
  discarded: number;
};
export type BackendsListResult = { backends: AgentView[] };

/** A provider-owned session row, live-joined to this instance (wire 3.1). */
export type ProviderSessionView = {
  sessionId: string;
  cwd: string;
  title: string | null;
  updatedAt: string | null;
  attached: boolean;
  hlaoSessionId: string | null;
  hlaoName: string | null;
  hlaoStatus: SessionStatus | null;
  loadable: boolean;
  forkable: boolean;
};

export type ProviderSessionsParams = {
  backend: string;
  cwd?: string;
  cursor?: string;
};

export type ProviderSessionsResult = {
  backend: string;
  cwd: string | null;
  agentName: string | null;
  agentVersion: string | null;
  sessions: ProviderSessionView[];
  nextCursor: string | null;
};
export type ReloadResult = { configHash: string; configError: string | null };
export type ShutdownResult = {
  sessionsClosed: number;
  retainedDiscarded: number;
};

export type RpcMethod =
  | "hello"
  | "backends.list"
  | "backends.sessions"
  | "sessions.spawn"
  | "sessions.list"
  | "sessions.get"
  | "sessions.send"
  | "sessions.read"
  | "sessions.wait"
  | "sessions.cancel"
  | "sessions.close"
  | "sessions.permit"
  | "sessions.set_mode"
  | "sessions.set_config_option"
  | "sessions.queue"
  | "sessions.queue_drop"
  | "sessions.rename"
  | "sessions.forget"
  | "stream.subscribe"
  | "stream.unsubscribe"
  | "supervisor.reload"
  | "supervisor.shutdown"
  | "dashboard.fs.list";

export const WIRE_MAJOR = 3;
export const WIRE_MINOR = 1;

/** The live hello's version, or the version this client speaks when offline. */
export function wireVersionLabel(version?: ProtocolVersion | null): string {
  return version ? `${version.major}.${version.minor}` : `${WIRE_MAJOR}.${WIRE_MINOR}`;
}

export const CAPABILITIES = {
  backendsList: "backends.list",
  providerSessions: "backends.sessions",
  pendingPermissions: "session.pendingPermissions",
  permitRequest: "permit.request",
  usage: "session.usage",
  readFilters: "read.filters",
  readBefore: "read.before",
  readTime: "read.time",
  readRegex: "read.regex",
  readContext: "read.context",
  streamPersistent: "stream.persistent",
  streamSubscribe: "stream.subscribe",
  streamResume: "stream.resume",
  settled: "session.settled",
  lastEvent: "session.lastEvent",
  sendMessageId: "send.messageId",
  sendIdempotency: "send.idempotency",
  sendSteering: "send.steering",
  spawnIdempotency: "spawn.idempotency",
  lastCrash: "supervisor.lastCrash",
  compaction: "session.compaction",
  notices: "session.notices",
  plan: "session.plan",
  title: "session.title",
  firstPrompt: "session.firstPrompt",
  agent: "session.agent",
  messages: "session.messages",
  spawnResume: "spawn.resume",
  spawnFork: "spawn.fork",
} as const;

export function hasCapability(
  capabilities: readonly string[],
  capability: string,
): boolean {
  return capabilities.includes(capability);
}

export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case "starting":
      return "Starting";
    case "idle":
      return "Idle";
    case "busy":
      return "Running";
    case "waiting_permission":
      return "Waiting for permission";
    case "closed":
      return "Closed";
    case "failed":
      return "Failed";
  }
}

export function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function asWireError(error: unknown): WireError {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return error as WireError;
  }
  return { code: "internal", message: errorText(error) };
}
