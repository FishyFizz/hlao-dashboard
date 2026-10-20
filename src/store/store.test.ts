import { describe, expect, it, vi } from "vitest";
import type { EventView, NotificationFrame } from "../wire/protocol";
import { DashboardStore } from "./store";

function event(seq: number): EventView {
  return {
    seq,
    at: "2026-10-20T12:00:00.000Z",
    type: "agent.message",
    turn: 1,
    data: { messageId: "m1", text: `chunk ${seq}` },
  };
}

function notification(seq: number): NotificationFrame {
  return {
    type: "notification",
    subscription: 1,
    kind: "event",
    sessionId: "sess",
    events: [event(seq)],
    cursor: seq,
    truncated: false,
  };
}

describe("notification batching", () => {
  it("coalesces a live burst into one listener pass", () => {
    vi.useFakeTimers();
    const store = new DashboardStore();
    let passes = 0;
    const unsubscribe = store.subscribe(() => {
      passes += 1;
    });
    const handle = (
      store as unknown as {
        handleNotification: (frame: NotificationFrame) => void;
      }
    ).handleNotification.bind(store);

    for (let seq = 1; seq <= 100; seq += 1) handle(notification(seq));
    expect(passes).toBe(0);

    vi.advanceTimersByTime(60);

    expect(passes).toBe(1);
    expect(store.getSnapshot().events.sess?.events).toHaveLength(100);
    expect(store.getSnapshot().events.sess?.lastSeq).toBe(100);
    unsubscribe();
    vi.useRealTimers();
  });
});
