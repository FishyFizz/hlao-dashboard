import { describe, expect, it } from "vitest";
import { DemoSupervisor } from "../demo/demoSupervisor";
import {
  appendEvents,
  attentionFor,
  attentionKey,
  buildRenderItems,
  nextAttentionSession,
  resolveTarget,
  sessionLocalKey,
  toolPayloadFromEvents,
  unreadFor,
  type NoticeRecord,
} from "./model";
import type { EventView, SessionView } from "../wire/protocol";

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
    pendingPermission: null,
    lastStopReason: null,
    agentSessionId: null,
    processId: null,
    exit: null,
    permissionPolicy: "allow",
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
      pendingPermission: {
        requestId: "req-1",
        toolCallId: null,
        title: "Run shell command",
        kind: "execute",
        options: [],
        requestedAt: "2026-10-20T10:05:00.000Z",
      },
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

describe("attention navigation", () => {
  it("cycles and wraps, starting at the first item when nothing is selected", () => {
    const permission = session({
      id: "perm01",
      status: "waiting_permission",
      pendingPermission: {
        requestId: "req-1",
        toolCallId: null,
        title: "Run shell command",
        kind: "execute",
        options: [],
        requestedAt: "2026-10-20T10:05:00.000Z",
      },
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
  it("serves a fleet, reads a page, and resolves a permission without changing provider mode", async () => {
    const supervisor = new DemoSupervisor(() => {});
    const list = await supervisor.request<{ sessions: SessionView[] }>(
      "sessions.list",
      { includeClosed: true },
    );
    expect(list.sessions).toHaveLength(9);
    const gate = list.sessions.find((item) => item.id === "9c1e07")!;
    expect(gate.status).toBe("waiting_permission");

    const page = await supervisor.request<{
      events: EventView[];
      lastSeq: number;
    }>("sessions.read", { sessionId: "9c1e07", limit: 100 });
    expect(page.events.length).toBe(page.lastSeq);

    const result = await supervisor.request<{ session: SessionView }>(
      "sessions.permit",
      { sessionId: "9c1e07", optionId: "allow_once" },
    );
    expect(result.session.pendingPermission).toBeNull();
    expect(result.session.permissionPolicy).toBe("ask");
    expect(result.session.status).toBe("busy");
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
