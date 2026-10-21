import type { DemoState } from "./types";
import { addSession, recountQueues, setSessionPatch } from "./world";
import {
  ago,
  baseSession,
  HOUR,
  makeEvents,
  MINUTE,
  withEvents,
} from "./support";

/**
 * The demo instance's fixture world: sessions, events, queues, and spawned
 * history. It is data plus small builders; it does not schedule or mutate
 * afterwards. Keeping it separate from the simulator makes the fixture set
 * readable and the engine behavior explicit.
 */
export function seedDemo(state: DemoState): void {
  const now = state.now;

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
  addSession(state, 
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
  state.queues.set("4f2a9c", [
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
  state.active.set("4f2a9c", {
    id: "msg-a7",
    text: "Run the auth tests and report the first failure. Do not change retry semantics.",
    from: "operator",
    queuedAt: now - 8 * MINUTE,
  });
  setSessionPatch(state, "4f2a9c", { queued: 2, settled: false });

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
        queuePosition: 1,
      },
    },
    {
      ago: 34_000,
      type: "permission.requested",
      turn: 2,
      data: {
        requestId: "perm-92",
        toolCallId: "call-read",
        title: "Read .env.production",
        kind: "read",
        options: [
          { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
          { optionId: "deny", name: "Deny", kind: "deny" },
        ],
        requestedAt: ago(now, 34_000),
        queuePosition: 2,
      },
    },
    {
      ago: 1 * MINUTE,
      type: "usage",
      turn: 2,
      data: { used: 76_000, size: 200_000, cost: { amount: 41, currency: "USD" } },
    },
  ]);
  addSession(state, 
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
        pendingPermissions: [
          {
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
          {
            requestId: "perm-92",
            toolCallId: "call-read",
            title: "Read .env.production",
            kind: "read",
            options: [
              { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
              { optionId: "deny", name: "Deny", kind: "deny" },
            ],
            requestedAt: ago(now, 34_000),
          },
        ],
        agentName: "codex-acp",
        agentVersion: "2.2.2",
        processId: 8128,
        agentSessionId: "acp-9101",
      }),
      probeEvents,
    ),
    probeEvents,
  );
  state.active.set("9c1e07", {
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
  addSession(state, 
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
  addSession(state, 
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
  addSession(state, 
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
  addSession(state, 
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
  state.queues.set("e0a4b8", [
    {
      id: "msg-f2",
      text: "Write the one remaining note.",
      from: "operator",
      queuedAt: now - 9 * MINUTE,
    },
  ]);
  setSessionPatch(state, "e0a4b8", { queued: 1, settled: false });
  state.active.set("e0a4b8", {
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
  addSession(state, 
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
  addSession(state, 
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
  addSession(state, 
    withEvents(
      baseSession({
        id: "a1b2c3",
        backend: "gemini",
        cwd: "D:\\work\\retry",
        status: "idle",
        createdAt: ago(now, 70 * MINUTE),
        turn: 2,
        settled: true,
        title: "Investigate flaky retries",
        agentName: "gemini-cli",
        agentVersion: "0.18.2",
        processId: 8154,
      }),
      untitledEvents,
    ),
    untitledEvents,
  );

  recountQueues(state);
}
