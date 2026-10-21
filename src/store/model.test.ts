import { describe, expect, it } from "vitest";
import { DemoSupervisor } from "../demo/demoSupervisor";
import {
  appendEvents,
  attentionFor,
  attentionKey,
  buildRenderItems,
  buildTranscriptRows,
  countNewAgentMessages,
  lastThoughtLine,
  nextAttentionSession,
  resolveTarget,
  sessionLocalKey,
  toolPayloadFromEvents,
  unreadFor,
  type NoticeRecord,
} from "./model";
import type {
  AgentView,
  EventView,
  HelloResult,
  ProviderSessionsResult,
  SessionView,
} from "../wire/protocol";

function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: "abc123",
    name: "test",
    createdBy: "operator",
    backend: "fake",
    cwd: "/tmp",
    status: "idle",
    parentId: null,
    rootId: "abc123",
    depth: 0,
    createdAt: "2026-10-20T10:00:00.000Z",
    lastActivityAt: "2026-10-20T10:00:00.000Z",
    endedAt: null,
    turn: 0,
    turnStartedAt: null,
    queued: 0,
    settled: true,
    lastSeq: 0,
    lastEvent: null,
    pendingPermissions: [],
    lastStopReason: null,
    agentSessionId: null,
    processId: null,
    exit: null,
    modes: null,
    configOptions: null,
    usage: null,
    ...overrides,
  };
}

function event(
  seq: number,
  type: string,
  data: Record<string, unknown> = {},
  turn: number | null = null,
): EventView {
  return {
    seq,
    at: `2026-10-20T10:00:0${Math.min(seq, 9)}.000Z`,
    type,
    turn,
    data,
  };
}

describe("attention", () => {
  it("ranks permission, failure, and notice structurally", () => {
    const permission = session({
      id: "perm01",
      name: "permission",
      status: "waiting_permission",
      pendingPermissions: [
        {
          requestId: "req-1",
          toolCallId: null,
          title: "Run shell command",
          kind: "execute",
          options: [],
          requestedAt: "2026-10-20T10:05:00.000Z",
        },
      ],
    });
    const failure = session({
      id: "fail01",
      name: "failure",
      status: "failed",
      endedAt: "2026-10-20T10:06:00.000Z",
    });
    const notice = session({
      id: "note01",
      name: "notice",
      status: "busy",
      lastSeq: 3,
      lastActivityAt: "2026-10-20T10:07:00.000Z",
    });
    const notices: Record<string, NoticeRecord> = {
      [sessionLocalKey(notice)]: {
        seq: 3,
        severity: "error",
        text: "Context at 90%",
        at: "2026-10-20T10:07:00.000Z",
      },
    };
    const result = attentionFor(
      [notice, failure, permission],
      notices,
      { acknowledged: {}, dismissedNotices: {} },
    );
    expect(result.map((item) => item.session.id)).toEqual([
      "perm01",
      "fail01",
      "note01",
    ]);
    expect(result.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("removes an acknowledged failure and a dismissed error notice without touching server state", () => {
    const failure = session({
      id: "fail01",
      status: "failed",
      endedAt: "2026-10-20T10:06:00.000Z",
    });
    const notice = session({
      id: "note01",
      status: "busy",
      lastSeq: 4,
      lastActivityAt: "2026-10-20T10:07:00.000Z",
    });
    const notices: Record<string, NoticeRecord> = {
      [sessionLocalKey(notice)]: {
        seq: 4,
        severity: "error",
        text: "Provider error",
        at: "2026-10-20T10:07:00.000Z",
      },
    };
    const result = attentionFor(
      [failure, notice],
      notices,
      {
        acknowledged: { [sessionLocalKey(failure)]: "2026-10-20T10:06:00.000Z" },
        dismissedNotices: { [sessionLocalKey(notice)]: 4 },
      },
    );
    expect(result).toHaveLength(0);
    expect(failure.status).toBe("failed");
    expect(notice.status).toBe("busy");
  });

  it("can acknowledge a failure whose endedAt was not reported", () => {
    const failure = session({
      id: "fail02",
      status: "failed",
      endedAt: null,
      lastActivityAt: "2026-10-20T10:08:00.000Z",
    });
    const unacknowledged = attentionFor(
      [failure],
      {},
      { acknowledged: {}, dismissedNotices: {} },
    );
    expect(unacknowledged).toHaveLength(1);
    const acknowledged = attentionFor(
      [failure],
      {},
      {
        acknowledged: {
          [sessionLocalKey(failure)]: "2026-10-20T10:08:00.000Z",
        },
        dismissedNotices: {},
      },
    );
    expect(acknowledged).toHaveLength(0);
  });
});

describe("unread", () => {
  it("counts from zero without claiming eviction, and marks an evicted range without a count", () => {
    const item = session({ lastSeq: 9 });
    expect(unreadFor(item, 0, 1)).toEqual({
      unread: true,
      count: 9,
      partlyEvicted: false,
    });
    expect(unreadFor(item, 3, 5)).toEqual({
      unread: true,
      count: null,
      partlyEvicted: true,
    });
    expect(unreadFor(item, 9, 1)).toEqual({
      unread: false,
      count: 0,
      partlyEvicted: false,
    });
  });
});

describe("new agent messages", () => {
  it("counts distinct messages after the cursor and ignores other activity", () => {
    const events = [
      event(1, "agent.message", { messageId: "m1", text: "old" }),
      event(2, "tool.call", { toolCallId: "t1" }),
      event(3, "agent.message", { messageId: "m2", text: "one" }),
      event(4, "agent.message", { messageId: "m2", text: " chunk" }),
      event(5, "agent.thought", { messageId: "th1", text: "hmm" }),
      event(6, "tool.update", { toolCallId: "t1" }),
      event(7, "agent.message", { messageId: "m3", text: "two" }),
      event(8, "agent.message", { text: "no id" }),
    ];
    expect(countNewAgentMessages(events, 2)).toBe(3);
    expect(countNewAgentMessages(events, 0)).toBe(4);
    expect(countNewAgentMessages(events, 8)).toBe(0);
  });
});

describe("target resolution", () => {
  it("uses exact handle, then unique name, then unique handle prefix", () => {
    const alpha = session({ id: "aa11bb", name: "alpha" });
    const beta = session({ id: "aa22cc", name: "beta" });
    expect(resolveTarget("aa11bb", [alpha, beta])).toEqual({
      kind: "ok",
      session: alpha,
    });
    expect(resolveTarget("#aa22cc", [alpha, beta])).toEqual({
      kind: "ok",
      session: beta,
    });
    expect(resolveTarget("alpha", [alpha, beta])).toEqual({
      kind: "ok",
      session: alpha,
    });
    expect(resolveTarget("aa", [alpha, beta])).toEqual({
      kind: "ambiguous",
      candidates: [alpha, beta],
    });
  });

  it("does not pick a candidate by substring", () => {
    const alpha = session({ id: "aa11bb", name: "alpha" });
    const beta = session({ id: "aa22cc", name: "alphabet" });
    expect(resolveTarget("alph", [alpha, beta]).kind).toBe("none");
  });
});

describe("event merge", () => {
  it("ignores duplicate and out-of-order stream events and reports a gap", () => {
    const current = [event(1, "session.created"), event(2, "turn.started")];
    const result = appendEvents(
      current,
      [event(2, "turn.started"), event(3, "agent.message"), event(4, "turn.ended")],
      2,
    );
    expect(result.events.map((item) => item.seq)).toEqual([1, 2, 3, 4]);
    expect(result.added).toBe(2);
    expect(result.gap).toBe(false);

    const gapped = appendEvents(current, [event(5, "agent.message")], 2);
    expect(gapped.gap).toBe(true);
  });

  it("pairs permission requests with replies and stringifies object payloads", () => {
    const items = buildRenderItems([
      event(1, "permission.requested", { requestId: "r1", title: "Run shell command" }, 2),
      event(2, "permission.resolved", { requestId: "r1", optionId: "allow", by: "operator" }, 2),
      event(
        3,
        "tool.call",
        {
          toolCallId: "t1",
          name: "Bash",
          status: "running",
          rawInput: { command: "ls -la" },
        },
        2,
      ),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "permission",
      title: "Run shell command",
      resolution: { seq: 2 },
    });
    expect(items[1]).toMatchObject({ kind: "tool" });
    expect((items[1] as { input: string | null }).input).toContain("ls -la");
  });

  it("takes the real tool input from updates instead of the adapter's empty object", () => {
    const items = buildRenderItems([
      event(
        1,
        "tool.call",
        {
          toolCallId: "t1",
          name: "Bash",
          title: "Terminal",
          status: "pending",
          rawInput: {},
        },
        3,
      ),
      event(
        2,
        "tool.update",
        {
          toolCallId: "t1",
          title: "npm test -- auth",
          status: "in_progress",
          rawInput: { command: "npm test -- auth" },
          content: [],
        },
        3,
      ),
      event(
        3,
        "tool.update",
        {
          toolCallId: "t1",
          status: "completed",
          content: [
            { type: "content", content: { type: "text", text: "2 passing" } },
          ],
        },
        3,
      ),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "tool", title: "npm test -- auth" });
    const tool = items[0] as { input: string | null; output: string | null };
    expect(tool.input).toContain("npm test -- auth");
    expect(tool.output).toBe("2 passing");
  });

  it("prefers the final plain output over an earlier content block", () => {
    const items = buildRenderItems([
      event(1, "tool.call", { toolCallId: "t1", name: "Bash", status: "pending" }, 1),
      event(
        2,
        "tool.update",
        {
          toolCallId: "t1",
          content: [{ type: "content", content: { type: "text", text: "partial" } }],
        },
        1,
      ),
      event(3, "tool.update", { toolCallId: "t1", status: "completed", rawOutput: "final" }, 1),
    ]);
    expect(items[0]).toMatchObject({ kind: "tool", output: "final" });
  });

  it("builds one tool payload from a raw event slice", () => {
    const payload = toolPayloadFromEvents(
      [
        event(
          10,
          "tool.call",
          { toolCallId: "t1", title: "Terminal", rawInput: {} },
          2,
        ),
        event(
          14,
          "tool.update",
          { toolCallId: "t1", title: "git status", rawInput: { command: "git status" } },
          2,
        ),
        event(18, "tool.update", { toolCallId: "t2", rawInput: { command: "other" } }, 2),
        event(20, "tool.update", { toolCallId: "t1", status: "completed", rawOutput: "clean" }, 2),
      ],
      "t1",
    );
    expect(payload.title).toBe("git status");
    expect(payload.input).toContain("git status");
    expect(payload.output).toBe("clean");
  });

  it("coalesces message chunks and tool updates by their ids", () => {
    const items = buildRenderItems([
      event(1, "agent.message", { messageId: "m1", text: "one ", chunk: true }, 1),
      event(2, "agent.message", { messageId: "m1", text: "two", chunk: true }, 1),
      event(3, "tool.call", { toolCallId: "t1", name: "Bash", status: "running" }, 1),
      event(4, "tool.update", { toolCallId: "t1", status: "completed", output: "ok" }, 1),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "message", text: "one two" });
    expect(items[1]).toMatchObject({ kind: "tool", status: "completed", output: "ok" });
  });

  it("coalesces unkeyed thought chunks into one continuous thought", () => {
    const items = buildRenderItems([
      event(1, "agent.thought", { text: "one " }, 1),
      event(2, "agent.thought", { text: "two" }, 1),
      event(3, "tool.call", { toolCallId: "t1", name: "Bash" }, 1),
      event(4, "agent.thought", { text: "three" }, 1),
    ]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      kind: "message",
      type: "agent.thought",
      text: "one two",
    });
    expect(items[1]).toMatchObject({ kind: "tool" });
    expect(items[2]).toMatchObject({ kind: "message", text: "three" });
  });

  it("preserves whitespace-only message chunks for markdown structure", () => {
    const items = buildRenderItems([
      event(1, "agent.message", { messageId: "m1", text: "# Result", chunk: true }, 1),
      event(2, "agent.message", { messageId: "m1", text: "\n\n", chunk: true }, 1),
      event(3, "agent.message", { messageId: "m1", text: "Body", chunk: true }, 1),
    ]);
    expect(items[0]).toMatchObject({
      kind: "message",
      text: "# Result\n\nBody",
    });
  });
});

describe("minimal transcript mode", () => {
  it("shows the latest readable line of a streamed thought", () => {
    expect(lastThoughtLine("first line\n\nsecond line\n")).toBe("second line");
    expect(lastThoughtLine("- point\n> latest detail")).toBe("latest detail");
    expect(lastThoughtLine("before\n```\nconst x = 1;\n```\n")).toBe("const x = 1;");
    expect(lastThoughtLine(" \n\n")).toBe("");

    const preview = lastThoughtLine(`start ${"x".repeat(300)}`, 40);
    expect(preview).toHaveLength(40);
    expect(preview.startsWith("…")).toBe(true);
    expect(preview.endsWith("x")).toBe(true);
  });

  it("collapses work between messages and counts tools, MCP calls, and thoughts", () => {
    const items = buildRenderItems([
      event(1, "prompt.sent", { text: "go", messageId: "p1" }, 1),
      event(2, "agent.thought", { text: "Check the mutex.", messageId: "th1" }, 1),
      event(3, "tool.call", { toolCallId: "t1", name: "Bash", title: "npm test" }, 1),
      event(
        4,
        "tool.call",
        { toolCallId: "m1", name: "mcp__repo__lookup", title: "lookup" },
        1,
      ),
      event(5, "agent.message", { text: "First finding.", messageId: "a1" }, 1),
      event(6, "agent.thought", { text: "line one\nlast thought", messageId: "th2" }, 1),
      event(7, "tool.call", { toolCallId: "t2", name: "Read", title: "README.md" }, 1),
      event(8, "agent.message", { text: "Done.", messageId: "a2" }, 1),
    ]);
    const rows = buildTranscriptRows(items, true);

    expect(rows.map((row) => row.kind)).toEqual([
      "item",
      "activity",
      "item",
      "activity",
      "item",
    ]);
    expect(rows[1]).toMatchObject({
      tools: 1,
      mcp: 1,
      thoughts: 1,
      last: { kind: "tool", name: "mcp__repo__lookup", mcp: true },
    });
    expect(rows[3]).toMatchObject({
      tools: 1,
      mcp: 0,
      thoughts: 1,
      last: { kind: "tool", name: "Read" },
    });
  });

  it("keeps the streamed thought line when the thought is the latest activity", () => {
    const items = buildRenderItems([
      event(1, "tool.call", { toolCallId: "t1", name: "Bash", title: "ls" }, 1),
      event(2, "agent.thought", { text: "first\nchecking the retry path", messageId: "th1" }, 1),
      event(3, "agent.message", { text: "Result.", messageId: "a1" }, 1),
    ]);
    const rows = buildTranscriptRows(items, true);
    expect(rows[0]).toMatchObject({
      kind: "activity",
      thoughts: 1,
      last: { kind: "thought", text: "checking the retry path" },
    });
  });

  it("does not collapse failures, notices, or prompts", () => {
    const items = buildRenderItems([
      event(1, "tool.call", { toolCallId: "t1", name: "Bash" }, 1),
      event(2, "error", { text: "adapter failed" }, 1),
      event(3, "tool.call", { toolCallId: "t2", name: "Read" }, 2),
      event(4, "notice", { text: "heads up", severity: "warning" }, 2),
      event(5, "prompt.sent", { text: "continue", messageId: "p1" }, 2),
      event(6, "session.failed", { reason: "process exited" }, 2),
    ]);
    const rows = buildTranscriptRows(items, true);
    expect(rows.map((row) => (row.kind === "item" ? row.item.kind : "activity"))).toEqual([
      "activity",
      "event",
      "activity",
      "event",
      "event",
      "event",
    ]);
  });

  it("drops structural-only runs instead of showing a contentless row", () => {
    const items = buildRenderItems([
      event(1, "session.created", { createdBy: "operator" }),
      event(2, "turn.ended", { reason: "end_turn" }, 1),
      event(3, "agent.message", { text: "hi", messageId: "a1" }, 1),
    ]);
    const rows = buildTranscriptRows(items, true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("item");
  });

  it("leaves the transcript unchanged outside minimal mode", () => {
    const items = buildRenderItems([
      event(1, "agent.thought", { text: "hmm", messageId: "th1" }, 1),
      event(2, "agent.message", { text: "hi", messageId: "a1" }, 1),
    ]);
    const rows = buildTranscriptRows(items, false);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === "item")).toBe(true);
  });
});

describe("attention navigation", () => {
  it("cycles and wraps, starting at the first item when nothing is selected", () => {
    const permission = session({
      id: "perm01",
      status: "waiting_permission",
      pendingPermissions: [
        {
          requestId: "req-1",
          toolCallId: null,
          title: "Run shell command",
          kind: "execute",
          options: [],
          requestedAt: "2026-10-20T10:05:00.000Z",
        },
      ],
    });
    const failure = session({
      id: "fail01",
      status: "failed",
      endedAt: "2026-10-20T10:06:00.000Z",
    });
    const items = attentionFor(
      [permission, failure],
      {},
      { acknowledged: {}, dismissedNotices: {} },
    );

    expect(nextAttentionSession(items, null, 1)?.id).toBe("perm01");
    expect(nextAttentionSession(items, "perm01", 1)?.id).toBe("fail01");
    expect(nextAttentionSession(items, "fail01", 1)?.id).toBe("perm01");
    expect(nextAttentionSession(items, "perm01", -1)?.id).toBe("fail01");
    expect(nextAttentionSession([], null, 1)).toBeNull();
    expect(attentionKey(items[0]!)).toBe("perm01:permission:req-1");
  });
});

describe("demo supervisor", () => {
  it("reports protocol 3.1 capabilities and per-backend default modes", async () => {
    const supervisor = new DemoSupervisor(() => {});
    const hello = await supervisor.request<HelloResult>("hello", {});
    expect(hello.protocolVersion).toEqual({ major: 3, minor: 1 });
    expect(hello.capabilities).toContain("session.pendingPermissions");
    expect(hello.capabilities).toContain("permit.request");
    expect(hello.capabilities).toContain("backends.sessions");

    const providers = await supervisor.request<ProviderSessionsResult>(
      "backends.sessions",
      { backend: "claude" },
    );
    expect(providers.backend).toBe("claude");
    expect(providers.sessions.some((row) => row.attached)).toBe(true);
    expect(providers.sessions.some((row) => !row.attached)).toBe(true);
    const live = providers.sessions.find((row) => row.attached);
    expect(live?.hlaoSessionId).toBeTruthy();
    expect(live?.sessionId).toBeTruthy();

    const backends = await supervisor.request<{ backends: AgentView[] }>(
      "backends.list",
      {},
    );
    expect(
      backends.backends.find((item) => item.name === "claude")?.defaultMode,
    ).toBe("default");
    expect(
      backends.backends.find((item) => item.name === "codex")?.defaultMode,
    ).toBe("agent");

    // The removed policy method is an unknown method in 3.0.
    await expect(
      supervisor.request("sessions.set_policy" as never, {
        sessionId: "9c1e07",
        permissionPolicy: "allow",
      }),
    ).rejects.toMatchObject({ code: "bad_request" });
    supervisor.close();
  });

  it("serves a parallel permission queue and answers each request by id", async () => {
    const supervisor = new DemoSupervisor(() => {});
    const list = await supervisor.request<{ sessions: SessionView[] }>(
      "sessions.list",
      { includeClosed: true },
    );
    expect(list.sessions).toHaveLength(9);
    const gate = list.sessions.find((item) => item.id === "9c1e07")!;
    expect(gate.status).toBe("waiting_permission");
    expect(gate.pendingPermissions.map((item) => item.requestId)).toEqual([
      "perm-91",
      "perm-92",
    ]);

    const page = await supervisor.request<{
      events: EventView[];
      lastSeq: number;
    }>("sessions.read", { sessionId: "9c1e07", limit: 100 });
    expect(page.events.length).toBe(page.lastSeq);

    await expect(
      supervisor.request("sessions.permit", {
        sessionId: "9c1e07",
        optionId: "allow_once",
      }),
    ).rejects.toMatchObject({ code: "bad_request" });

    await expect(
      supervisor.request("sessions.permit", {
        sessionId: "9c1e07",
        requestId: "missing",
        optionId: "allow_once",
      }),
    ).rejects.toMatchObject({ code: "no_pending_permission" });

    const first = await supervisor.request<{ session: SessionView }>(
      "sessions.permit",
      { sessionId: "9c1e07", requestId: "perm-91", optionId: "allow_once" },
    );
    expect(first.session.pendingPermissions.map((item) => item.requestId)).toEqual([
      "perm-92",
    ]);
    expect(first.session.status).toBe("waiting_permission");

    const second = await supervisor.request<{ session: SessionView }>(
      "sessions.permit",
      { sessionId: "9c1e07", optionId: "deny" },
    );
    expect(second.session.pendingPermissions).toEqual([]);
    expect(second.session.status).toBe("busy");
    supervisor.close();
  });
});

describe("replay provenance", () => {
  it("survives render grouping and append merges", () => {
    const events: EventView[] = [
      {
        seq: 1,
        at: "2026-10-21T00:00:00.000Z",
        type: "agent.message",
        turn: null,
        data: { text: "restored", messageId: "m1" },
        replay: true,
      },
      {
        seq: 2,
        at: "2026-10-21T00:00:01.000Z",
        type: "session.resumed",
        turn: null,
        data: { agentSessionId: "provider-1", historyEvents: 1 },
      },
    ];
    const items = buildRenderItems(events);
    const first = items[0];
    expect(first?.kind).toBe("message");
    if (first?.kind === "message") {
      expect(first.events[0]?.replay).toBe(true);
    }
    const merged = appendEvents([], events, 0);
    expect(merged.events[0]?.replay).toBe(true);
    expect(merged.events[1]?.replay).toBeUndefined();
  });
});
