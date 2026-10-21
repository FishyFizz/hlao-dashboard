import { describe, expect, it } from "vitest";
import type { SessionView } from "../../wire/protocol";
import { attentionFor } from "./attention";
import {
  fleetCounts,
  filterFleet,
  groupFleet,
  orderedFleet,
} from "./fleet";

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

const running = session({
  id: "run001",
  name: "runner",
  status: "busy",
  createdAt: "2026-10-20T10:01:00.000Z",
});
const quiet = session({
  id: "quiet1",
  name: "quiet",
  createdAt: "2026-10-20T10:02:00.000Z",
});
const ended = session({
  id: "end001",
  name: "ended",
  status: "closed",
  createdAt: "2026-10-20T10:03:00.000Z",
});
const failed = session({
  id: "fail01",
  name: "failed",
  status: "failed",
  createdAt: "2026-10-20T10:04:00.000Z",
  endedAt: "2026-10-20T10:05:00.000Z",
});
const permission = session({
  id: "perm01",
  name: "permission",
  status: "waiting_permission",
  createdAt: "2026-10-20T10:05:00.000Z",
  pendingPermissions: [
    {
      requestId: "req-1",
      toolCallId: null,
      title: "Run shell command",
      kind: "execute",
      options: [],
      requestedAt: "2026-10-20T10:06:00.000Z",
    },
  ],
});

const all = [running, quiet, ended, failed, permission];

describe("fleet projections", () => {
  it("counts live, running, quiet, and ended", () => {
    expect(fleetCounts(all)).toEqual({
      live: 3,
      running: 1,
      quiet: 1,
      ended: 2,
    });
  });

  it("filters by query and the ended toggle", () => {
    expect(
      filterFleet(all, { query: "", showEnded: false }).map((item) => item.id),
    ).toEqual(["run001", "quiet1", "perm01"]);
    expect(
      filterFleet(all, { query: "runner", showEnded: true }).map((item) => item.id),
    ).toEqual(["run001"]);
  });

  it("groups attention first and sorts the rest inside their group", () => {
    const attention = attentionFor(
      all,
      {},
      { acknowledged: {}, dismissedNotices: {} },
    );
    const groups = groupFleet(all, attention, "created");
    expect(groups.needs.map((item) => item.id)).toEqual(["perm01", "fail01"]);
    expect(groups.running.map((item) => item.id)).toEqual(["run001"]);
    expect(groups.quiet.map((item) => item.id)).toEqual(["quiet1"]);
    expect(groups.ended.map((item) => item.id)).toEqual(["end001"]);
  });

  it("keeps an attention session visible when ended sessions are hidden", () => {
    const attention = attentionFor(
      all,
      {},
      { acknowledged: {}, dismissedNotices: {} },
    );
    const rows = orderedFleet(
      all,
      attention,
      { query: "", showEnded: false },
      "created",
    );
    expect(rows.map((item) => item.id)).toEqual([
      "perm01",
      "fail01",
      "run001",
      "quiet1",
    ]);
  });
});
