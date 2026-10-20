/**
 * A simulated supervisor for the dashboard's demo instance.
 *
 * It exists so the interaction model can be exercised without a running HLAO
 * instance. It is labelled "demo" everywhere in the UI, and it implements the
 * same method shapes as the wire so the client code paths are not special
 * cases. It is not a second protocol and it is never presented as live.
 */

import { descendantsOf, eventTitle } from "../store/model";
import type {
  AgentView,
  BackendsListResult,
  CancelResult,
  CloseResult,
  EventView,
  ForgetResult,
  HelloResult,
  NotificationFrame,
  PermitResult,
  QueueDropResult,
  QueueItemView,
  QueueResult,
  ReadParams,
  ReadResult,
  ReloadResult,
  RenameResult,
  RpcMethod,
  SendParams,
  SendResult,
  SessionView,
  ShutdownResult,
  SpawnParams,
  SpawnResult,
  SubscribeParams,
  SubscribeResult,
  UnsubscribeResult,
  WaitResult,
  WireError,
} from "../wire/protocol";

type Timer = ReturnType<typeof setTimeout>;

type PendingPrompt = {
  id: string;
  text: string;
  from: string;
  queuedAt: number;
};

type Subscription = {
  fleet: boolean;
  sessionIds: Set<string>;
};

type EventSpec = {
  ago: number;
  type: string;
  turn?: number | null;
  data?: Record<string, unknown>;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Seeded demo sessions keep their creation timestamps across a reload in this
 * browser session. Drafts, read markers, and a selected handle+createdAt then
 * behave the way they do against a real supervisor. A new tab/session gets a
 * fresh fixture epoch.
 */
function demoEpoch(): number {
  try {
    if (typeof window !== "undefined" && "sessionStorage" in window) {
      const key = "hlao-demo-epoch";
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      const now = Date.now();
      window.sessionStorage.setItem(key, String(now));
      return now;
    }
  } catch {
    // Session storage can be unavailable; the demo still runs with a fresh epoch.
  }
  return Date.now();
}

function ago(now: number, ms: number): string {
  return new Date(now - ms).toISOString();
}

function wireError(
  code: WireError["code"],
  message: string,
  details?: unknown,
): WireError {
  return { code, message, details };
}

function preview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 200 ? `${compact.slice(0, 197)}…` : compact;
}

function makeEvents(now: number, specs: EventSpec[]): EventView[] {
  return [...specs]
    .sort((a, b) => b.ago - a.ago)
    .map((spec, index) => ({
      seq: index + 1,
      at: ago(now, spec.ago),
      type: spec.type,
      turn: spec.turn ?? null,
      data: spec.data ?? {},
    }));
}

function baseSession(
  input: Pick<SessionView, "id" | "backend" | "cwd" | "status" | "createdAt"> &
    Partial<SessionView>,
): SessionView {
  return {
    id: input.id,
    name: input.name ?? null,
    createdBy: input.createdBy ?? "operator",
    backend: input.backend,
    cwd: input.cwd,
    status: input.status,
    parentId: input.parentId ?? null,
    rootId: input.rootId ?? input.id,
    depth: input.depth ?? 0,
    createdAt: input.createdAt,
    lastActivityAt: input.lastActivityAt ?? input.createdAt,
    endedAt: input.endedAt ?? null,
    turn: input.turn ?? 0,
    turnStartedAt: input.turnStartedAt ?? null,
    queued: input.queued ?? 0,
    settled: input.settled ?? input.status === "idle",
    lastSeq: input.lastSeq ?? 0,
    lastEvent: input.lastEvent ?? null,
    pendingPermission: input.pendingPermission ?? null,
    lastStopReason: input.lastStopReason ?? null,
    agentSessionId: input.agentSessionId ?? null,
    processId: input.processId ?? null,
    exit: input.exit ?? null,
    permissionPolicy: input.permissionPolicy ?? "allow",
    modes: input.modes ?? null,
    configOptions: input.configOptions ?? null,
    usage: input.usage ?? null,
    compaction: input.compaction ?? null,
    plan: input.plan ?? null,
    title: input.title ?? null,
    agentName: input.agentName ?? null,
    agentVersion: input.agentVersion ?? null,
  };
}

function lastProjection(events: EventView[]): SessionView["lastEvent"] {
  const last = events[events.length - 1];
  if (!last) return null;
  return {
    type: last.type,
    title: eventTitle(last) || null,
    at: last.at,
  };
}

function withEvents(
  session: SessionView,
  events: EventView[],
  lastActivityAt?: string,
): SessionView {
  return {
    ...session,
    lastSeq: events.length,
    lastEvent: lastProjection(events),
    lastActivityAt:
      lastActivityAt ??
      events[events.length - 1]?.at ??
      session.lastActivityAt,
  };
}

export class DemoSupervisor {
  private readonly now: number;
  private readonly sessions = new Map<string, SessionView>();
  private readonly events = new Map<string, EventView[]>();
  private readonly queues = new Map<string, PendingPrompt[]>();
  private readonly active = new Map<string, PendingPrompt>();
  private readonly timers = new Map<string, Set<Timer>>();
  private readonly subscriptions = new Map<number, Subscription>();
  private readonly idempotency = new Map<string, string>();
  private nextSubscription = 1;
  private shuttingDown = false;
  private readonly startedAt: string;

  constructor(private readonly notify: (frame: NotificationFrame) => void) {
    this.now = demoEpoch();
    this.startedAt = ago(this.now, 52 * MINUTE);
    this.seed();
  }

  async request<T>(method: RpcMethod, params: unknown): Promise<T> {
    if (this.shuttingDown) {
      throw wireError("supervisor_unavailable", "the demo supervisor has shut down");
    }
    const input = (params ?? {}) as Record<string, unknown>;
    const value = await this.dispatch(method, input);
    return value as T;
  }

  close(): void {
    for (const sessionId of this.timers.keys()) this.clearTimers(sessionId);
    this.subscriptions.clear();
  }

  private async dispatch(method: RpcMethod, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "hello":
        return this.hello();
      case "backends.list":
        return this.backends();
      case "sessions.list":
        return this.list(params.includeClosed === true);
      case "sessions.get":
        return this.get(String(params.sessionId ?? ""));
      case "sessions.read":
        return this.read(params as unknown as ReadParams);
      case "sessions.queue":
        return this.queue(String(params.sessionId ?? ""));
      case "sessions.send":
        return this.send(params as unknown as SendParams);
      case "sessions.spawn":
        return this.spawn(params as unknown as SpawnParams);
      case "sessions.permit":
        return this.permit(
          String(params.sessionId ?? ""),
          typeof params.optionId === "string" ? params.optionId : undefined,
          params.always === true,
        );
      case "sessions.cancel":
        return this.cancel(
          String(params.sessionId ?? ""),
          params.keepQueue === true,
        );
      case "sessions.close":
        return this.closeSession(String(params.sessionId ?? ""));
      case "sessions.forget":
        return this.forget(String(params.sessionId ?? ""));
      case "sessions.rename":
        return this.rename(
          String(params.sessionId ?? ""),
          typeof params.name === "string" ? params.name : null,
        );
      case "sessions.set_policy":
        return this.setPolicy(
          String(params.sessionId ?? ""),
          params.permissionPolicy as "ask" | "allow" | "deny",
        );
      case "sessions.set_mode":
        return this.setMode(String(params.sessionId ?? ""), String(params.modeId ?? ""));
      case "sessions.set_config_option":
        return this.setConfig(
          String(params.sessionId ?? ""),
          String(params.configId ?? ""),
          params.value as string | boolean,
        );
      case "sessions.queue_drop":
        return this.queueDrop(
          String(params.sessionId ?? ""),
          typeof params.messageId === "string" ? params.messageId : undefined,
          typeof params.position === "number" ? params.position : undefined,
        );
      case "sessions.wait":
        return this.wait(params);
      case "stream.subscribe":
        return this.subscribe(params as unknown as SubscribeParams);
      case "stream.unsubscribe":
        return this.unsubscribe(Number(params.subscription ?? 0));
      case "supervisor.reload":
        return { configHash: "demo-config", configError: null } satisfies ReloadResult;
      case "supervisor.shutdown":
        return this.shutdown();
      default:
        throw wireError("bad_request", `unsupported method ${String(method)}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Seed                                                              */
  /* ---------------------------------------------------------------- */

  private seed(): void {
    const now = this.now;

    const refactorEvents = makeEvents(now, [
      { ago: 46 * MINUTE, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 45.8 * MINUTE,
        type: "session.initialized",
        data: { agentName: "claude-agent-acp", agentVersion: "0.93.0" },
      },
      {
        ago: 44 * MINUTE,
        type: "prompt.sent",
        turn: 1,
        data: {
          text: "Map the auth refresh path. Do not change retry semantics.",
          from: "operator",
          messageId: "msg-a1",
        },
      },
      { ago: 44 * MINUTE, type: "turn.started", turn: 1 },
      {
        ago: 43 * MINUTE,
        type: "agent.message",
        turn: 1,
        data: {
          text: "I'll map the mutex and token write before proposing anything.",
          messageId: "msg-a1-out",
          chunk: false,
        },
      },
      {
        ago: 42 * MINUTE,
        type: "turn.ended",
        turn: 1,
        data: { reason: "end_turn" },
      },
      {
        ago: 8 * MINUTE,
        type: "prompt.sent",
        turn: 7,
        data: {
          text: "Run the auth tests and report the first failure. Do not change retry semantics.",
          from: "operator",
          messageId: "msg-a7",
        },
      },
      { ago: 8 * MINUTE, type: "turn.started", turn: 7 },
      {
        ago: 7.6 * MINUTE,
        type: "agent.thought",
        turn: 7,
        data: {
          text: "Check the refresh mutex before touching the retry path.",
          messageId: "thought-7",
          chunk: false,
        },
      },
      {
        ago: 7.2 * MINUTE,
        type: "tool.call",
        turn: 7,
        data: {
          toolCallId: "call-1",
          name: "Bash",
          title: "npm test -- auth/refresh",
          status: "running",
          input: "npm test -- auth/refresh",
        },
      },
      {
        ago: 6.4 * MINUTE,
        type: "tool.update",
        turn: 7,
        data: {
          toolCallId: "call-1",
          status: "completed",
          output: "✕ refresh mutex releases before the token write (2)",
        },
      },
      {
        ago: 6 * MINUTE,
        type: "agent.message",
        turn: 7,
        data: {
          text: "The failure is a race in the refresh mutex. I can patch it, but the fix changes retry semantics.\n\n",
          messageId: "msg-a7-out",
          chunk: true,
        },
      },
      {
        ago: 5 * MINUTE,
        type: "plan.update",
        turn: 7,
        data: {
          planId: "plan-auth",
          kind: "items",
          entries: [
            { content: "Map the refresh mutex", priority: "high", status: "completed" },
            { content: "Show the race, propose two fixes", priority: "high", status: "in_progress" },
            { content: "Wait for the operator", priority: "low", status: "pending" },
          ],
        },
      },
      {
        ago: 4 * MINUTE,
        type: "prompt.queued",
        turn: 7,
        data: {
          text: "After the fix, run the full suite.",
          from: "operator",
          messageId: "msg-q1",
        },
      },
      {
        ago: 3 * MINUTE,
        type: "prompt.queued",
        turn: 7,
        data: {
          text: "Then update the changelog.",
          from: "operator",
          messageId: "msg-q2",
        },
      },
      {
        ago: 2 * MINUTE,
        type: "session.info",
        turn: 7,
        data: { title: "Fix the auth refresh race" },
      },
      {
        ago: 1 * MINUTE,
        type: "usage",
        turn: 7,
        data: { used: 124_000, size: 200_000, cost: { amount: 184, currency: "USD" } },
      },
      {
        ago: 5_000,
        type: "agent.message",
        turn: 7,
        data: {
          text: "The two queued prompts are waiting behind this turn.",
          messageId: "msg-a7-out",
          chunk: true,
        },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "4f2a9c",
          name: "refactor-auth",
          backend: "claude",
          cwd: "D:\\work\\auth",
          status: "busy",
          createdAt: ago(now, 46 * MINUTE),
          turn: 7,
          turnStartedAt: ago(now, 8 * MINUTE),
          settled: false,
          permissionPolicy: "allow",
          modes: {
            currentModeId: "default",
            availableModes: [
              { id: "default", name: "Default" },
              { id: "plan", name: "Plan", description: "Read-only planning mode" },
              { id: "acceptEdits", name: "Accept edits" },
            ],
          },
          configOptions: [
            {
              id: "model",
              name: "Model",
              category: "model",
              type: "select",
              currentValue: "sonnet",
              values: [
                { value: "sonnet", name: "Claude Sonnet" },
                { value: "opus", name: "Claude Opus" },
              ],
            },
            {
              id: "effort",
              name: "Effort",
              category: "model_config",
              type: "select",
              currentValue: "medium",
              values: [
                { value: "low", name: "Low" },
                { value: "medium", name: "Medium" },
                { value: "high", name: "High" },
              ],
            },
            {
              id: "reasoning",
              name: "Extended reasoning",
              type: "boolean",
              currentValue: true,
              values: [],
            },
          ],
          usage: {
            used: 124_000,
            size: 200_000,
            cost: { amount: 184, currency: "USD" },
            at: ago(now, 1 * MINUTE),
          },
          title: "Fix the auth refresh race",
          agentName: "claude-agent-acp",
          agentVersion: "0.93.0",
          processId: 8124,
          agentSessionId: "acp-8812",
        }),
        refactorEvents,
      ),
      refactorEvents,
    );
    this.queues.set("4f2a9c", [
      {
        id: "msg-q1",
        text: "After the fix, run the full suite.",
        from: "operator",
        queuedAt: now - 4 * MINUTE,
      },
      {
        id: "msg-q2",
        text: "Then update the changelog.",
        from: "operator",
        queuedAt: now - 3 * MINUTE,
      },
    ]);
    this.active.set("4f2a9c", {
      id: "msg-a7",
      text: "Run the auth tests and report the first failure. Do not change retry semantics.",
      from: "operator",
      queuedAt: now - 8 * MINUTE,
    });
    this.setSessionPatch("4f2a9c", { queued: 2, settled: false });

    const probeEvents = makeEvents(now, [
      { ago: 22 * MINUTE, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 21 * MINUTE,
        type: "prompt.sent",
        turn: 1,
        data: {
          text: "Probe the codex backend for a shell tool.",
          from: "operator",
          messageId: "msg-b1",
        },
      },
      { ago: 21 * MINUTE, type: "turn.started", turn: 1 },
      {
        ago: 20 * MINUTE,
        type: "agent.message",
        turn: 1,
        data: {
          text: "The shell tool is available. I need approval before running it.",
          messageId: "msg-b1-out",
          chunk: false,
        },
      },
      { ago: 19 * MINUTE, type: "turn.ended", turn: 1, data: { reason: "end_turn" } },
      {
        ago: 10 * MINUTE,
        type: "prompt.sent",
        turn: 2,
        data: {
          text: "Run the probe command and report the output.",
          from: "operator",
          messageId: "msg-b2",
        },
      },
      { ago: 10 * MINUTE, type: "turn.started", turn: 2 },
      {
        ago: 9 * MINUTE,
        type: "tool.call",
        turn: 2,
        data: {
          toolCallId: "call-perm",
          name: "Bash",
          title: "Run shell command",
          status: "pending",
          input: "codex probe --json",
        },
      },
      {
        ago: 38_000,
        type: "permission.requested",
        turn: 2,
        data: {
          requestId: "perm-91",
          toolCallId: "call-perm",
          title: "Run shell command",
          kind: "execute",
          options: [
            { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
            { optionId: "allow_always", name: "Always allow", kind: "allow_always" },
            { optionId: "deny", name: "Deny", kind: "deny" },
          ],
          requestedAt: ago(now, 38_000),
        },
      },
      {
        ago: 1 * MINUTE,
        type: "usage",
        turn: 2,
        data: { used: 76_000, size: 200_000, cost: { amount: 41, currency: "USD" } },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "9c1e07",
          name: "codex-probe",
          backend: "codex",
          cwd: "D:\\work\\probe",
          status: "waiting_permission",
          createdAt: ago(now, 22 * MINUTE),
          turn: 2,
          turnStartedAt: ago(now, 10 * MINUTE),
          settled: false,
          permissionPolicy: "ask",
          modes: {
            currentModeId: "agent",
            availableModes: [
              { id: "agent", name: "Agent" },
              { id: "read-only", name: "Read only" },
            ],
          },
          configOptions: null,
          usage: {
            used: 76_000,
            size: 200_000,
            cost: { amount: 41, currency: "USD" },
            at: ago(now, 1 * MINUTE),
          },
          pendingPermission: {
            requestId: "perm-91",
            toolCallId: "call-perm",
            title: "Run shell command",
            kind: "execute",
            options: [
              { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
              { optionId: "allow_always", name: "Always allow", kind: "allow_always" },
              { optionId: "deny", name: "Deny", kind: "deny" },
            ],
            requestedAt: ago(now, 38_000),
          },
          agentName: "codex-acp",
          agentVersion: "2.2.2",
          processId: 8128,
          agentSessionId: "acp-9101",
        }),
        probeEvents,
      ),
      probeEvents,
    );
    this.active.set("9c1e07", {
      id: "msg-b2",
      text: "Run the probe command and report the output.",
      from: "operator",
      queuedAt: now - 10 * MINUTE,
    });

    const failedEvents = makeEvents(now, [
      { ago: 38 * MINUTE, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 37 * MINUTE,
        type: "prompt.sent",
        turn: 4,
        data: {
          text: "Triage the failing retry test.",
          from: "operator",
          messageId: "msg-c1",
        },
      },
      { ago: 37 * MINUTE, type: "turn.started", turn: 4 },
      {
        ago: 35 * MINUTE,
        type: "tool.call",
        turn: 4,
        data: {
          toolCallId: "call-c1",
          name: "Bash",
          title: "npm test -- retry",
          status: "running",
        },
      },
      {
        ago: 12 * MINUTE,
        type: "error",
        turn: 4,
        data: { message: "Adapter exited with code 1" },
      },
      {
        ago: 9 * MINUTE,
        type: "session.failed",
        turn: 4,
        data: { reason: "adapter exited", exit: { code: 1, signal: null } },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "2d9f6a",
          name: "flaky-test-triage",
          backend: "claude",
          cwd: "D:\\work\\retry",
          status: "failed",
          createdAt: ago(now, 38 * MINUTE),
          endedAt: ago(now, 9 * MINUTE),
          turn: 4,
          settled: false,
          permissionPolicy: "allow",
          usage: {
            used: 186_000,
            size: 200_000,
            cost: { amount: 207, currency: "USD" },
            at: ago(now, 14 * MINUTE),
          },
          exit: { code: 1, signal: null },
          agentName: "claude-agent-acp",
          agentVersion: "0.93.0",
          processId: 8131,
        }),
        failedEvents,
      ),
      failedEvents,
    );

    const noticeEvents = makeEvents(now, [
      { ago: 30 * MINUTE, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 29 * MINUTE,
        type: "prompt.sent",
        turn: 5,
        data: {
          text: "Migrate the API fixtures to the new schema.",
          from: "operator",
          messageId: "msg-d1",
        },
      },
      { ago: 29 * MINUTE, type: "turn.started", turn: 5 },
      {
        ago: 26 * MINUTE,
        type: "agent.message",
        turn: 5,
        data: {
          text: [
            "## Fixture rewrite",
            "",
            "The fixture rewrite is **in progress**.",
            "",
            "- `auth` fixtures migrated",
            "- `payments` fixtures pending",
            "",
            "> Context is getting large.",
            "",
            "```ts",
            'const schema = "v2";',
            "```",
            "",
            "See [the migration notes](https://example.com/migration).",
          ].join("\n"),
          messageId: "msg-d1-out",
          chunk: false,
        },
      },
      {
        ago: 2 * MINUTE,
        type: "usage",
        turn: 5,
        data: { used: 188_000, size: 200_000, cost: { amount: 312, currency: "USD" } },
      },
      {
        ago: 1 * MINUTE,
        type: "notice",
        turn: 5,
        data: {
          severity: "error",
          text: "Context at 90%. The provider may compact at the next turn.",
        },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "a81c3d",
          name: "api-migration",
          backend: "claude",
          cwd: "D:\\work\\api",
          status: "busy",
          createdAt: ago(now, 30 * MINUTE),
          turn: 5,
          turnStartedAt: ago(now, 29 * MINUTE),
          settled: false,
          permissionPolicy: "allow",
          usage: {
            used: 188_000,
            size: 200_000,
            cost: { amount: 312, currency: "USD" },
            at: ago(now, 2 * MINUTE),
          },
          title: "Migrate API fixtures",
          agentName: "claude-agent-acp",
          agentVersion: "0.93.0",
          processId: 8136,
        }),
        noticeEvents,
      ),
      noticeEvents,
    );

    const observerEvents = makeEvents(now, [
      { ago: 4 * HOUR, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 3.8 * HOUR,
        type: "prompt.sent",
        turn: 12,
        data: {
          text: "Watch the fleet and report anything unusual.",
          from: "operator",
          messageId: "msg-e1",
        },
      },
      { ago: 3.8 * HOUR, type: "turn.started", turn: 12 },
      {
        ago: 1 * MINUTE,
        type: "agent.message",
        turn: 12,
        data: {
          text: "Fleet is stable; two sessions idle, one waiting for permission.",
          messageId: "msg-e1-out",
          chunk: false,
        },
      },
      { ago: 1 * MINUTE, type: "turn.ended", turn: 12, data: { reason: "end_turn" } },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "b73d11",
          name: "fleet-observer",
          backend: "claude",
          cwd: "D:\\work\\hlao",
          status: "idle",
          createdAt: ago(now, 4 * HOUR),
          turn: 12,
          settled: true,
          permissionPolicy: "allow",
          usage: {
            used: 82_000,
            size: 200_000,
            cost: { amount: 96, currency: "USD" },
            at: ago(now, 1.2 * HOUR),
          },
          title: "Fleet observer",
          agentName: "claude-agent-acp",
          agentVersion: "0.93.0",
          processId: 8140,
        }),
        observerEvents,
      ),
      observerEvents,
    );

    const auditEvents = makeEvents(now, [
      { ago: 3.5 * HOUR, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 3.4 * HOUR,
        type: "prompt.sent",
        turn: 5,
        data: {
          text: "Audit the protocol notes for contradictions.",
          from: "operator",
          messageId: "msg-f1",
        },
      },
      { ago: 3.4 * HOUR, type: "turn.started", turn: 5 },
      {
        ago: 20 * MINUTE,
        type: "compaction",
        turn: 5,
        data: {
          compactionId: "compact-f1",
          status: "completed",
          summary:
            "The audit is complete. No contradictions remain in the methods section.",
        },
      },
      {
        ago: 18 * MINUTE,
        type: "plan.update",
        turn: 5,
        data: {
          planId: "plan-docs",
          kind: "markdown",
          content:
            "# Audit plan\n\n- Read every method\n- Compare the CLI output\n- File one note per contradiction",
        },
      },
      {
        ago: 17 * MINUTE,
        type: "provider.metric",
        turn: 5,
        data: { name: "tokens/cached", value: 18_320, unit: "tokens" },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "e0a4b8",
          name: "docs-audit",
          backend: "gemini",
          cwd: "D:\\work\\docs",
          status: "idle",
          createdAt: ago(now, 3.5 * HOUR),
          turn: 5,
          settled: false,
          permissionPolicy: "ask",
          usage: {
            used: 154_000,
            size: 200_000,
            cost: { amount: 72, currency: "USD" },
            at: ago(now, 22 * MINUTE),
          },
          plan: {
            planId: "plan-docs",
            kind: "markdown",
            content:
              "# Audit plan\n\n- Read every method\n- Compare the CLI output\n- File one note per contradiction",
            updatedAt: ago(now, 18 * MINUTE),
          },
          compaction: {
            id: "compact-f1",
            status: "completed",
            summary:
              "The audit is complete. No contradictions remain in the methods section.",
            error: null,
            updatedAt: ago(now, 20 * MINUTE),
          },
          title: "Audit the protocol notes",
          agentName: "gemini-cli",
          agentVersion: "0.18.2",
          processId: 8144,
        }),
        auditEvents,
      ),
      auditEvents,
    );
    this.queues.set("e0a4b8", [
      {
        id: "msg-f2",
        text: "Write the one remaining note.",
        from: "operator",
        queuedAt: now - 9 * MINUTE,
      },
    ]);
    this.setSessionPatch("e0a4b8", { queued: 1, settled: false });
    this.active.set("e0a4b8", {
      id: "msg-f1",
      text: "Audit the protocol notes for contradictions.",
      from: "operator",
      queuedAt: now - 3.4 * HOUR,
    });

    const closedEvents = makeEvents(now, [
      { ago: 2 * HOUR, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 1.9 * HOUR,
        type: "prompt.sent",
        turn: 3,
        data: {
          text: "Run the last migration check.",
          from: "operator",
          messageId: "msg-g1",
        },
      },
      { ago: 1.9 * HOUR, type: "turn.started", turn: 3 },
      {
        ago: 1.7 * HOUR,
        type: "turn.ended",
        turn: 3,
        data: { reason: "end_turn" },
      },
      {
        ago: 14 * MINUTE,
        type: "session.closed",
        turn: 3,
        data: { by: "operator" },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "7c3e52",
          name: "old-runner",
          backend: "codex",
          cwd: "D:\\work\\legacy",
          status: "closed",
          createdAt: ago(now, 2 * HOUR),
          endedAt: ago(now, 14 * MINUTE),
          turn: 3,
          settled: true,
          permissionPolicy: "allow",
          lastStopReason: "end_turn",
          usage: {
            used: 110_000,
            size: 200_000,
            cost: { amount: 72, currency: "USD" },
            at: ago(now, 1.6 * HOUR),
          },
          agentName: "codex-acp",
          agentVersion: "2.2.2",
          processId: 8147,
        }),
        closedEvents,
      ),
      closedEvents,
    );

    const childEvents = makeEvents(now, [
      { ago: 40 * MINUTE, type: "session.created", data: { createdBy: "4f2a9c" } },
      {
        ago: 39 * MINUTE,
        type: "prompt.sent",
        turn: 3,
        data: {
          text: "Run the auth tests in isolation.",
          from: "4f2a9c",
          messageId: "msg-h1",
        },
      },
      { ago: 39 * MINUTE, type: "turn.started", turn: 3 },
      {
        ago: 30 * MINUTE,
        type: "agent.message",
        turn: 3,
        data: {
          text: "Isolated run passes; the race only appears under concurrency.",
          messageId: "msg-h1-out",
          chunk: false,
        },
      },
      { ago: 29 * MINUTE, type: "turn.ended", turn: 3, data: { reason: "end_turn" } },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "c4e1d2",
          name: "auth-tests",
          backend: "claude",
          cwd: "D:\\work\\auth",
          status: "idle",
          parentId: "4f2a9c",
          rootId: "4f2a9c",
          depth: 1,
          createdBy: "4f2a9c",
          createdAt: ago(now, 40 * MINUTE),
          turn: 3,
          settled: true,
          permissionPolicy: "allow",
          usage: {
            used: 58_000,
            size: 200_000,
            cost: { amount: 31, currency: "USD" },
            at: ago(now, 30 * MINUTE),
          },
          agentName: "claude-agent-acp",
          agentVersion: "0.93.0",
          processId: 8151,
        }),
        childEvents,
      ),
      childEvents,
    );

    const untitledEvents = makeEvents(now, [
      { ago: 70 * MINUTE, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 69 * MINUTE,
        type: "prompt.sent",
        turn: 2,
        data: {
          text: "Investigate the flaky retry behavior.",
          from: "operator",
          messageId: "msg-i1",
        },
      },
      { ago: 69 * MINUTE, type: "turn.started", turn: 2 },
      {
        ago: 62 * MINUTE,
        type: "session.info",
        turn: 2,
        data: { title: "Investigate flaky retries" },
      },
      {
        ago: 61 * MINUTE,
        type: "turn.ended",
        turn: 2,
        data: { reason: "end_turn" },
      },
    ]);
    this.addSession(
      withEvents(
        baseSession({
          id: "a1b2c3",
          backend: "gemini",
          cwd: "D:\\work\\retry",
          status: "idle",
          createdAt: ago(now, 70 * MINUTE),
          turn: 2,
          settled: true,
          permissionPolicy: "allow",
          title: "Investigate flaky retries",
          agentName: "gemini-cli",
          agentVersion: "0.18.2",
          processId: 8154,
        }),
        untitledEvents,
      ),
      untitledEvents,
    );

    this.recountQueues();
  }

  private addSession(session: SessionView, events: EventView[]): void {
    this.sessions.set(session.id, session);
    this.events.set(session.id, events);
  }

  /* ---------------------------------------------------------------- */
  /* Reads                                                             */
  /* ---------------------------------------------------------------- */

  private hello(): HelloResult {
    return {
      protocolVersion: { major: 2, minor: 5 },
      capabilities: [
        "backends.list",
        "session.usage",
        "read.filters",
        "read.before",
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
        "spawn.idempotency",
        "spawn.createdBy",
        "supervisor.lastCrash",
        "prompt.injected",
        "session.compaction",
        "session.notices",
        "session.plan",
        "session.title",
        "session.agent",
        "session.messages",
      ],
      pid: 4242,
      startedAt: this.startedAt,
      version: "0.11.0-demo",
      sessions: this.sessions.size,
      configHash: "demo-config",
      stream: { persistent: true },
    };
  }

  private backends(): BackendsListResult {
    const backends: AgentView[] = [
      {
        name: "claude",
        source: "builtin",
        command: "claude-agent-acp",
        args: [],
        envKeys: ["ANTHROPIC_API_KEY"],
        description: "Claude Agent ACP",
        available: true,
      },
      {
        name: "codex",
        source: "builtin",
        command: "codex-acp",
        args: [],
        envKeys: ["OPENAI_API_KEY"],
        description: "Codex ACP",
        available: true,
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
      },
    ];
    return { backends };
  }

  private list(includeClosed: boolean): { sessions: SessionView[] } {
    const sessions = [...this.sessions.values()]
      .filter((session) => includeClosed || !this.isTerminal(session))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return { sessions };
  }

  private get(sessionId: string): { session: SessionView } {
    return { session: this.requireSession(sessionId) };
  }

  private read(params: ReadParams): ReadResult {
    const session = this.requireSession(params.sessionId);
    const all = this.events.get(session.id) ?? [];
    const earliestRetainedSeq = 1;
    const lastSeq = all.length;
    const limit = Math.min(1000, Math.max(1, params.limit ?? 100));
    const filtered = all.filter((event) => {
      if (params.types && params.types.length > 0 && !params.types.includes(event.type)) {
        return false;
      }
      if (params.turn !== undefined && event.turn !== params.turn) return false;
      if (typeof params.grep === "string" && params.grep.trim().length > 0) {
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

    return {
      session,
      events,
      earliestRetainedSeq,
      lastSeq,
      nextSeq,
      nextBefore,
      hasMore,
      truncated,
    };
  }

  private queue(sessionId: string): QueueResult {
    const session = this.requireSession(sessionId);
    const active = this.active.get(session.id) ?? null;
    const queued = this.queues.get(session.id) ?? [];
    return {
      session,
      active: active ? this.queueView(active, null, session.turn) : null,
      queue: queued.map((prompt, index) =>
        this.queueView(prompt, index + 1, session.turn),
      ),
    };
  }

  private queueView(
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

  private wait(params: Record<string, unknown>): WaitResult {
    const until = String(params.until ?? "settled");
    const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
    const sessionIds = Array.isArray(params.sessionIds)
      ? (params.sessionIds as string[])
      : sessionId
        ? [sessionId]
        : [];
    const results = sessionIds.map((id) => {
      const session = this.requireSession(id);
      const satisfied = this.conditionSatisfied(session, until);
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

  private conditionSatisfied(session: SessionView, until: string): boolean {
    if (until === "idle") return session.status === "idle";
    if (until === "settled") return session.settled || session.status === "waiting_permission" || this.isTerminal(session);
    if (until === "permission") return session.status === "waiting_permission";
    if (until === "exit") return this.isTerminal(session);
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Writes                                                            */
  /* ---------------------------------------------------------------- */

  private async send(params: SendParams): Promise<SendResult> {
    const session = this.requireSession(params.sessionId);
    if (this.isTerminal(session)) {
      throw wireError("session_closed", "the session is closed or failed");
    }
    if (!params.text.trim()) throw wireError("bad_request", "text is required");
    const key = params.idempotencyKey ? `send:${params.idempotencyKey}` : null;
    if (key) {
      const existing = this.idempotency.get(key);
      if (existing) {
        const existingSession = this.sessions.get(existing);
        if (existingSession) {
          return {
            session: existingSession,
            messageId: existing,
            queued: existingSession.queued > 0,
            turn: existingSession.turn,
            completed: false,
            timedOut: false,
            duplicate: true,
          };
        }
      }
    }
    const messageId = params.messageId ?? this.makeId("msg");
    const prompt: PendingPrompt = {
      id: messageId,
      text: params.text,
      from: "operator",
      queuedAt: Date.now(),
    };
    if (key) this.idempotency.set(key, messageId);

    if (session.status === "busy" || session.status === "waiting_permission" || session.queued > 0) {
      this.enqueue(session.id, prompt);
      return {
        session: this.requireSession(session.id),
        messageId,
        queued: true,
        turn: null,
        completed: false,
        timedOut: false,
      };
    }

    const turn = this.startTurn(session.id, prompt);
    return {
      session: this.requireSession(session.id),
      messageId,
      queued: false,
      turn,
      completed: false,
      timedOut: false,
    };
  }

  private async spawn(params: SpawnParams): Promise<SpawnResult> {
    const backend = params.backend?.trim();
    if (!backend) throw wireError("bad_request", "backend is required");
    const available = this.backends().backends.find((item) => item.name === backend);
    if (!available) throw wireError("backend_not_found", `no backend named ${backend}`);
    if (!available.available) {
      throw wireError(
        "backend_unavailable",
        available.unavailableReason ?? `${backend} is unavailable`,
      );
    }
    if (params.idempotencyKey) {
      const existingId = this.idempotency.get(`spawn:${params.idempotencyKey}`);
      if (existingId) {
        const existing = this.sessions.get(existingId);
        if (existing) {
          return { session: existing, nextSeq: existing.lastSeq, duplicate: true };
        }
      }
    }

    const id = this.makeHandle();
    const now = Date.now();
    const parent = params.parentSessionId
      ? this.sessions.get(params.parentSessionId)
      : null;
    const session = baseSession({
      id,
      name: params.name?.trim() || null,
      backend,
      cwd: params.cwd?.trim() || "D:\\work\\hlao",
      status: "starting",
      parentId: parent?.id ?? null,
      rootId: parent?.rootId ?? id,
      depth: parent ? parent.depth + 1 : 0,
      createdAt: new Date(now).toISOString(),
      createdBy: "operator",
      permissionPolicy: params.permissionPolicy ?? "allow",
      agentName: backend === "claude" ? "claude-agent-acp" : backend === "codex" ? "codex-acp" : "gemini-cli",
      agentVersion: "demo",
      processId: 8200 + this.sessions.size,
    });
    const created = makeEvents(now, [
      { ago: 0, type: "session.created", data: { createdBy: "operator" } },
      {
        ago: 0,
        type: "session.initialized",
        data: { agentName: session.agentName, agentVersion: "demo" },
      },
    ]);
    this.addSession(withEvents(session, created), created);
    if (params.idempotencyKey) this.idempotency.set(`spawn:${params.idempotencyKey}`, id);
    this.notifySession(this.requireSession(id));

    const timer = setTimeout(() => {
      const current = this.sessions.get(id);
      if (!current || this.isTerminal(current)) return;
      const next = { ...current, status: "idle" as const, settled: true };
      this.sessions.set(id, next);
      this.notifySession(next);
      if (params.prompt?.trim()) {
        const prompt: PendingPrompt = {
          id: this.makeId("msg"),
          text: params.prompt,
          from: "operator",
          queuedAt: Date.now(),
        };
        this.startTurn(id, prompt);
      }
    }, 500);
    this.schedule(id, timer);

    return {
      session: this.requireSession(id),
      nextSeq: created.length,
      createdBy: "operator",
    };
  }

  private async permit(
    sessionId: string,
    optionId: string | undefined,
    always: boolean,
  ): Promise<PermitResult> {
    const session = this.requireSession(sessionId);
    const pending = session.pendingPermission;
    if (!pending) throw wireError("no_pending_permission", "no permission is pending");
    const option =
      pending.options.find((candidate) => candidate.optionId === optionId) ??
      (always
        ? pending.options.find((candidate) => candidate.kind === "allow_always")
        : pending.options.find((candidate) => candidate.kind === "allow_once")) ??
      pending.options.find((candidate) => candidate.kind !== "deny");
    if (!option) throw wireError("bad_option", "no matching permission option");
    if (optionId && !pending.options.some((candidate) => candidate.optionId === optionId)) {
      throw wireError("bad_option", `option ${optionId} is not offered`);
    }

    this.clearTimers(sessionId);
    const next: SessionView = {
      ...session,
      pendingPermission: null,
      status: "busy",
      lastStopReason: null,
      permissionPolicy: always ? "allow" : session.permissionPolicy,
    };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "permission.resolved", {
      requestId: pending.requestId,
      optionId: option.optionId,
      by: "operator",
    });
    if (always) {
      this.emit(sessionId, "policy.changed", {
        permissionPolicy: "allow",
        by: "operator",
      });
    }
    this.notifySession(this.requireSession(sessionId));

    const timer = setTimeout(() => {
      const current = this.sessions.get(sessionId);
      if (!current || this.isTerminal(current)) return;
      this.emit(sessionId, "agent.message", {
        text: "The probe completed. The output is in the transcript.",
        messageId: "msg-perm-out",
        chunk: false,
      });
      this.finishTurn(sessionId, "end_turn");
    }, 1200);
    this.schedule(sessionId, timer);

    return {
      session: this.requireSession(sessionId),
      requestId: pending.requestId,
      optionId: option.optionId,
      by: "operator",
    };
  }

  private cancel(sessionId: string, keepQueue: boolean): CancelResult {
    const session = this.requireSession(sessionId);
    if (this.isTerminal(session)) throw wireError("session_closed", "the session is closed");
    this.clearTimers(sessionId);
    const active = this.active.get(sessionId);
    let discarded = 0;
    if (active) {
      this.emit(sessionId, "cancel.requested", {
        by: "operator",
        keepQueue,
      });
    }
    if (!keepQueue) discarded = this.discardQueue(sessionId, "cancel");
    this.finishTurn(sessionId, "cancelled", true);
    if (keepQueue) this.startNextQueued(sessionId);
    return { session: this.requireSession(sessionId), discarded };
  }

  private closeSession(sessionId: string): CloseResult {
    const session = this.requireSession(sessionId);
    const wasTerminal = this.isTerminal(session);
    if (wasTerminal) return { session, killed: false, wasTerminal };
    this.clearTimers(sessionId);
    this.discardQueue(sessionId, "close");
    this.active.delete(sessionId);
    const next: SessionView = {
      ...session,
      status: "closed",
      endedAt: new Date().toISOString(),
      turnStartedAt: null,
      settled: true,
      pendingPermission: null,
      queued: 0,
    };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "session.closed", { by: "operator" });
    this.notifySession(this.requireSession(sessionId));
    return { session: this.requireSession(sessionId), killed: false, wasTerminal };
  }

  private forget(sessionId: string): ForgetResult {
    const session = this.requireSession(sessionId);
    if (!this.isTerminal(session)) {
      throw wireError("bad_request", "only terminal sessions can be forgotten");
    }
    const descendants = descendantsOf(sessionId, [...this.sessions.values()]);
    if (descendants.length > 0) {
      throw wireError("bad_request", "terminal session still has retained descendants");
    }
    this.sessions.delete(sessionId);
    this.events.delete(sessionId);
    this.queues.delete(sessionId);
    this.active.delete(sessionId);
    this.notifyRemoved(sessionId);
    return { sessionId, forgotten: true };
  }

  private rename(sessionId: string, name: string | null): RenameResult {
    const session = this.requireSession(sessionId);
    const next = { ...session, name: name?.trim() ? name.trim() : null };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "session.renamed", { name: next.name, by: "operator" });
    this.notifySession(this.requireSession(sessionId));
    return { session: this.requireSession(sessionId) };
  }

  private setPolicy(
    sessionId: string,
    policy: "ask" | "allow" | "deny",
  ): { session: SessionView } {
    const session = this.requireSession(sessionId);
    if (!["ask", "allow", "deny"].includes(policy)) {
      throw wireError("bad_request", "permissionPolicy must be ask, allow, or deny");
    }
    const next = { ...session, permissionPolicy: policy };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "policy.changed", { permissionPolicy: policy, by: "operator" });
    this.notifySession(this.requireSession(sessionId));
    return { session: this.requireSession(sessionId) };
  }

  private setMode(sessionId: string, modeId: string): { session: SessionView } {
    const session = this.requireSession(sessionId);
    if (!session.modes) throw wireError("bad_request", "this backend advertises no modes");
    if (!session.modes.availableModes.some((mode) => mode.id === modeId)) {
      throw wireError("bad_option", `mode ${modeId} is not offered`);
    }
    const next: SessionView = {
      ...session,
      modes: { ...session.modes, currentModeId: modeId },
    };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "mode", { modeId, by: "operator" });
    this.notifySession(this.requireSession(sessionId));
    return { session: this.requireSession(sessionId) };
  }

  private setConfig(
    sessionId: string,
    configId: string,
    value: string | boolean,
  ): { session: SessionView } {
    const session = this.requireSession(sessionId);
    const option = session.configOptions?.find((candidate) => candidate.id === configId);
    if (!option) throw wireError("bad_request", `config option ${configId} is not advertised`);
    let nextValue = value;
    if (option.type === "boolean") {
      nextValue = value === true || value === "true";
    } else {
      const stringValue = String(value);
      if (!option.values.some((candidate) => candidate.value === stringValue)) {
        throw wireError("bad_option", `value ${stringValue} is not offered`);
      }
      nextValue = stringValue;
    }
    const next: SessionView = {
      ...session,
      configOptions:
        session.configOptions?.map((candidate) =>
          candidate.id === configId ? { ...candidate, currentValue: nextValue } : candidate,
        ) ?? null,
    };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "config", { configId, value: nextValue, by: "operator" });
    this.notifySession(this.requireSession(sessionId));
    return { session: this.requireSession(sessionId) };
  }

  private queueDrop(
    sessionId: string,
    messageId?: string,
    position?: number,
  ): QueueDropResult {
    const session = this.requireSession(sessionId);
    const queue = this.queues.get(sessionId) ?? [];
    let index = -1;
    if (messageId) index = queue.findIndex((item) => item.id === messageId);
    else if (position) index = position - 1;
    if (index < 0 || index >= queue.length) {
      throw wireError("bad_request", "no queued prompt matches that target");
    }
    const [dropped] = queue.splice(index, 1);
    this.queues.set(sessionId, queue);
    const next = { ...session, queued: queue.length, settled: false };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "prompt.discarded", {
      messageId: dropped!.id,
      textPreview: preview(dropped!.text),
      position: index + 1,
      reason: "dropped",
      from: dropped!.from,
      by: "operator",
    });
    this.notifySession(this.requireSession(sessionId));
    return {
      session: this.requireSession(sessionId),
      dropped: this.queueView(dropped!, index + 1, session.turn),
      discarded: 1,
    };
  }

  private async shutdown(): Promise<ShutdownResult> {
    let sessionsClosed = 0;
    let retainedDiscarded = 0;
    for (const session of this.sessions.values()) {
      if (this.isTerminal(session)) retainedDiscarded += 1;
      else {
        sessionsClosed += 1;
        this.clearTimers(session.id);
      }
    }
    for (const sessionId of [...this.sessions.keys()]) {
      this.sessions.delete(sessionId);
      this.notifyRemoved(sessionId);
    }
    this.shuttingDown = true;
    return { sessionsClosed, retainedDiscarded };
  }

  private subscribe(params: SubscribeParams): SubscribeResult {
    if (!params.fleet && (!params.sessionIds || params.sessionIds.length === 0)) {
      throw wireError("bad_request", "a subscription needs fleet or sessionIds");
    }
    const subscription = this.nextSubscription++;
    const sessionIds = new Set(params.sessionIds ?? []);
    this.subscriptions.set(subscription, { fleet: params.fleet === true, sessionIds });
    const scoped = params.fleet
      ? [...this.sessions.values()]
      : [...this.sessions.values()].filter((session) => sessionIds.has(session.id));
    const cursors: Record<string, number> = {};
    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session) cursors[id] = session.lastSeq;
    }
    const truncated: string[] = [];
    if (params.since) {
      for (const [id, cursor] of Object.entries(params.since)) {
        const session = this.sessions.get(id);
        if (!session) continue;
        const all = this.events.get(id) ?? [];
        if (cursor + 1 < 1) truncated.push(id);
        const replay = all.filter((event) => event.seq > cursor);
        if (replay.length > 0) {
          setTimeout(() => {
            this.notify({
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

  private unsubscribe(subscription: number): UnsubscribeResult {
    if (!this.subscriptions.delete(subscription)) {
      throw wireError("not_found", `no subscription ${subscription}`);
    }
    return { subscription, removed: true };
  }

  /* ---------------------------------------------------------------- */
  /* Turn simulation                                                   */
  /* ---------------------------------------------------------------- */

  private startTurn(sessionId: string, prompt: PendingPrompt): number {
    const session = this.requireSession(sessionId);
    const turn = session.turn + 1;
    this.active.set(sessionId, { ...prompt, queuedAt: Date.now() });
    const next: SessionView = {
      ...session,
      status: "busy",
      turn,
      turnStartedAt: new Date().toISOString(),
      settled: false,
      lastStopReason: null,
      pendingPermission: null,
    };
    this.sessions.set(sessionId, next);
    this.emit(sessionId, "prompt.sent", {
      text: prompt.text,
      from: prompt.from,
      messageId: prompt.id,
    });
    this.emit(sessionId, "turn.started", {});
    this.notifySession(this.requireSession(sessionId));

    this.schedule(
      sessionId,
      setTimeout(() => {
        this.emit(sessionId, "agent.thought", {
          text: "Read the request, then act.",
          messageId: `thought-${turn}`,
          chunk: false,
        });
      }, 350),
    );
    this.schedule(
      sessionId,
      setTimeout(() => {
        this.emit(sessionId, "tool.call", {
          toolCallId: `call-${turn}`,
          name: "Bash",
          title: "npm test",
          status: "running",
          input: "npm test",
        });
      }, 850),
    );
    this.schedule(
      sessionId,
      setTimeout(() => {
        this.emit(sessionId, "tool.update", {
          toolCallId: `call-${turn}`,
          status: "completed",
          output: "tests passed",
        });
      }, 1_450),
    );
    this.schedule(
      sessionId,
      setTimeout(() => {
        this.emit(sessionId, "agent.message", {
          text: "The requested step completed. ",
          messageId: `msg-${turn}-out`,
          chunk: true,
        });
      }, 2_000),
    );
    this.schedule(
      sessionId,
      setTimeout(() => {
        this.emit(sessionId, "agent.message", {
          text: "Queue another prompt if you want the next step.",
          messageId: `msg-${turn}-out`,
          chunk: true,
        });
        this.finishTurn(sessionId, "end_turn");
      }, 2_700),
    );
    return turn;
  }

  private finishTurn(sessionId: string, stopReason: string, cancelled = false): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.emit(sessionId, "turn.ended", { reason: stopReason });
    const queue = this.queues.get(sessionId) ?? [];
    const next: SessionView = {
      ...session,
      status: "idle",
      turnStartedAt: null,
      settled: queue.length === 0,
      queued: queue.length,
      lastStopReason: stopReason === "cancelled" ? "cancelled" : "end_turn",
      pendingPermission: null,
    };
    this.sessions.set(sessionId, next);
    this.active.delete(sessionId);
    this.notifySession(this.requireSession(sessionId));
    if (!cancelled && queue.length > 0) this.startNextQueued(sessionId);
  }

  private startNextQueued(sessionId: string): void {
    const queue = this.queues.get(sessionId) ?? [];
    const [next, ...rest] = queue;
    if (!next) return;
    this.queues.set(sessionId, rest);
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.set(sessionId, { ...session, queued: rest.length, settled: false });
    this.startTurn(sessionId, next);
  }

  private enqueue(sessionId: string, prompt: PendingPrompt): void {
    const queue = this.queues.get(sessionId) ?? [];
    queue.push(prompt);
    this.queues.set(sessionId, queue);
    const session = this.requireSession(sessionId);
    this.sessions.set(sessionId, { ...session, queued: queue.length, settled: false });
    this.emit(sessionId, "prompt.queued", {
      text: prompt.text,
      from: prompt.from,
      messageId: prompt.id,
    });
    this.notifySession(this.requireSession(sessionId));
  }

  private discardQueue(sessionId: string, reason: string): number {
    const queue = this.queues.get(sessionId) ?? [];
    if (queue.length === 0) return 0;
    this.queues.set(sessionId, []);
    const session = this.requireSession(sessionId);
    this.sessions.set(sessionId, { ...session, queued: 0, settled: session.status === "idle" });
    for (const [index, prompt] of queue.entries()) {
      this.emit(sessionId, "prompt.discarded", {
        messageId: prompt.id,
        textPreview: preview(prompt.text),
        position: index + 1,
        reason,
        from: prompt.from,
        by: "operator",
      });
    }
    this.notifySession(this.requireSession(sessionId));
    return queue.length;
  }

  /* ---------------------------------------------------------------- */
  /* Notifications                                                     */
  /* ---------------------------------------------------------------- */

  private emit(sessionId: string, type: string, data: Record<string, unknown>): EventView {
    const session = this.requireSession(sessionId);
    const all = this.events.get(sessionId) ?? [];
    const event: EventView = {
      seq: all.length + 1,
      at: new Date().toISOString(),
      type,
      turn: session.turn,
      data,
    };
    const nextEvents = [...all, event];
    this.events.set(sessionId, nextEvents);
    const next: SessionView = {
      ...session,
      lastSeq: event.seq,
      lastEvent: { type: event.type, title: eventTitle(event) || null, at: event.at },
      lastActivityAt: event.at,
    };
    this.sessions.set(sessionId, next);
    for (const [subscription, scope] of this.subscriptions) {
      if (!scope.sessionIds.has(sessionId)) continue;
      this.notify({
        type: "notification",
        subscription,
        kind: "event",
        sessionId,
        events: [event],
        cursor: event.seq,
        truncated: false,
      });
    }
    this.notifySession(next);
    return event;
  }

  private notifySession(session: SessionView): void {
    for (const [subscription, scope] of this.subscriptions) {
      if (!scope.fleet && !scope.sessionIds.has(session.id)) continue;
      this.notify({
        type: "notification",
        subscription,
        kind: "session",
        session,
      });
    }
  }

  private notifyRemoved(sessionId: string): void {
    for (const [subscription, scope] of this.subscriptions) {
      if (!scope.fleet && !scope.sessionIds.has(sessionId)) continue;
      this.notify({
        type: "notification",
        subscription,
        kind: "session.removed",
        sessionId,
      });
    }
  }

  private setSessionPatch(sessionId: string, patch: Partial<SessionView>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.set(sessionId, { ...session, ...patch });
  }

  private recountQueues(): void {
    for (const [sessionId, queue] of this.queues) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.set(sessionId, {
          ...session,
          queued: queue.length,
          settled: session.status === "idle" && queue.length === 0,
        });
      }
    }
  }

  private requireSession(sessionId: string): SessionView {
    const session = this.sessions.get(sessionId);
    if (!session) throw wireError("not_found", `no session ${sessionId}`);
    return session;
  }

  private isTerminal(session: SessionView): boolean {
    return session.status === "closed" || session.status === "failed";
  }

  private schedule(sessionId: string, timer: Timer): void {
    const set = this.timers.get(sessionId) ?? new Set<Timer>();
    set.add(timer);
    this.timers.set(sessionId, set);
  }

  private clearTimers(sessionId: string): void {
    const set = this.timers.get(sessionId);
    if (!set) return;
    for (const timer of set) clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  private makeHandle(): string {
    let id = "";
    do {
      id = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    } while (this.sessions.has(id));
    return id;
  }

  private makeId(prefix: string): string {
    return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Transport                                                          */
/* ------------------------------------------------------------------ */

export type DemoEventSink = {
  onNotification(frame: NotificationFrame): void;
};

export class DemoTransport {
  readonly kind = "demo" as const;
  private supervisor: DemoSupervisor | null = null;
  private sink: DemoEventSink | null = null;

  async start(sink: DemoEventSink): Promise<{
    home: string;
    hello: HelloResult | null;
    error: WireError | null;
  }> {
    this.sink = sink;
    this.supervisor = new DemoSupervisor((frame) => this.sink?.onNotification(frame));
    const hello = await this.supervisor.request<HelloResult>("hello", {});
    return { home: "demo://hlao", hello, error: null };
  }

  async request<T>(method: RpcMethod, params?: unknown): Promise<T> {
    if (!this.supervisor) {
      throw wireError("supervisor_unavailable", "the demo instance is not connected");
    }
    return this.supervisor.request<T>(method, params);
  }

  close(): void {
    this.supervisor?.close();
    this.supervisor = null;
  }
}
