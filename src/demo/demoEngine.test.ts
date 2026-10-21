import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CancelResult,
  NotificationFrame,
  QueueDropResult,
  QueueResult,
  SendResult,
  SessionView,
  SpawnResult,
} from "../wire/protocol";
import { DemoSupervisor } from "./demoSupervisor";

function viewOf(supervisor: DemoSupervisor, sessionId: string) {
  return supervisor.request<{ session: SessionView }>("sessions.get", {
    sessionId,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("demo engine turns and queue", () => {
  it("runs a prompt, queues behind it, then starts the queued turn", async () => {
    vi.useFakeTimers();
    const supervisor = new DemoSupervisor(() => {});

    const first = await supervisor.request<SendResult>("sessions.send", {
      sessionId: "b73d11",
      text: "hello",
    });
    expect(first.queued).toBe(false);
    expect(first.turn).toBe(13);

    const busy = await viewOf(supervisor, "b73d11");
    expect(busy.session.status).toBe("busy");

    const second = await supervisor.request<SendResult>("sessions.send", {
      sessionId: "b73d11",
      text: "queued next",
    });
    expect(second.queued).toBe(true);

    const queue = await supervisor.request<QueueResult>("sessions.queue", {
      sessionId: "b73d11",
    });
    expect(queue.active?.textPreview).toBe("hello");
    expect(queue.queue.map((item) => item.position)).toEqual([1]);

    vi.advanceTimersByTime(2_700);
    const nextTurn = await viewOf(supervisor, "b73d11");
    expect(nextTurn.session.status).toBe("busy");
    expect(nextTurn.session.turn).toBe(14);

    const cancelled = await supervisor.request<CancelResult>("sessions.cancel", {
      sessionId: "b73d11",
      keepQueue: false,
    });
    expect(cancelled.session.status).toBe("idle");
    expect(cancelled.discarded).toBe(0);
    supervisor.close();
  });

  it("drops one queued prompt without touching the active turn", async () => {
    vi.useFakeTimers();
    const supervisor = new DemoSupervisor(() => {});
    await supervisor.request<SendResult>("sessions.send", {
      sessionId: "b73d11",
      text: "active",
    });
    const queued = await supervisor.request<SendResult>("sessions.send", {
      sessionId: "b73d11",
      text: "drop me",
    });

    const dropped = await supervisor.request<QueueDropResult>("sessions.queue_drop", {
      sessionId: "b73d11",
      messageId: queued.messageId,
    });
    expect(dropped.dropped.id).toBe(queued.messageId);
    expect(dropped.session.queued).toBe(0);

    const queue = await supervisor.request<QueueResult>("sessions.queue", {
      sessionId: "b73d11",
    });
    expect(queue.active?.textPreview).toBe("active");
    expect(queue.queue).toEqual([]);
    supervisor.close();
  });

  it("spawns a session and runs the first prompt after initialization", async () => {
    vi.useFakeTimers();
    const supervisor = new DemoSupervisor(() => {});
    const spawned = await supervisor.request<SpawnResult>("sessions.spawn", {
      backend: "claude",
      name: "engine-test",
      prompt: "first work",
    });
    expect(spawned.session.status).toBe("starting");

    vi.advanceTimersByTime(500);
    const running = await viewOf(supervisor, spawned.session.id);
    expect(running.session.status).toBe("busy");
    expect(running.session.turn).toBe(1);
    supervisor.close();
  });
});

describe("demo engine notifications", () => {
  it("fans session and event frames out to a scoped subscriber", async () => {
    const frames: NotificationFrame[] = [];
    const supervisor = new DemoSupervisor((frame) => frames.push(frame));
    const subscription = await supervisor.request<{ subscription: number }>(
      "stream.subscribe",
      { fleet: true, sessionIds: ["b73d11"] },
    );
    expect(subscription.subscription).toBeGreaterThan(0);

    await supervisor.request<SendResult>("sessions.send", {
      sessionId: "b73d11",
      text: "notify",
    });
    expect(frames.some((frame) => frame.kind === "event")).toBe(true);
    expect(frames.some((frame) => frame.kind === "session")).toBe(true);
    for (const frame of frames) {
      expect(frame.subscription).toBe(subscription.subscription);
      if (frame.kind === "event") {
        expect(frame.sessionId).toBe("b73d11");
        expect(frame.events.length).toBe(1);
      }
    }
    supervisor.close();
  });
});
