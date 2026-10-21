import { describe, expect, it } from "vitest";
import type { EventView, ReadResult } from "../wire/protocol";
import {
  appendedLiveEvents,
  appendedReadPage,
  eventsStateFromRead,
  gapFor,
  mergedOlderPage,
} from "./eventState";
import { EMPTY_EVENTS, type SessionEventsState } from "./types";

function event(seq: number, type = "agent.message"): EventView {
  return {
    seq,
    at: `2026-10-20T12:00:0${seq}.000Z`,
    type,
    turn: 1,
    data: { text: `event ${seq}` },
  };
}

function readResult(overrides: Partial<ReadResult> = {}): ReadResult {
  return {
    session: {} as ReadResult["session"],
    events: [event(1), event(2)],
    earliestRetainedSeq: 1,
    lastSeq: 2,
    nextSeq: 2,
    nextBefore: 1,
    hasMore: false,
    truncated: false,
    ...overrides,
  };
}

function loaded(overrides: Partial<SessionEventsState> = {}): SessionEventsState {
  return { ...EMPTY_EVENTS, events: [event(1)], lastSeq: 1, loaded: true, ...overrides };
}

describe("event state transitions", () => {
  it("builds a loaded state from the tail page", () => {
    const state = eventsStateFromRead(readResult());
    expect(state.loaded).toBe(true);
    expect(state.events.map((item) => item.seq)).toEqual([1, 2]);
    expect(state.hasMoreOlder).toBe(true);
    expect(state.nextBefore).toBe(1);
  });

  it("appends only new seqs and reports a forward gap once", () => {
    const current = loaded();
    const outcome = appendedReadPage(current, readResult({
      events: [event(3), event(4)],
      lastSeq: 4,
      truncated: true,
      earliestRetainedSeq: 3,
    }));
    expect(outcome.added).toBe(2);
    expect(outcome.state.events.map((item) => item.seq)).toEqual([1, 3, 4]);
    expect(outcome.state.gap).toEqual({ from: 2, to: 2 });
    expect(outcome.state.earliestRetainedSeq).toBe(3);
    expect(outcome.state.truncated).toBe(true);
  });

  it("keeps the existing cursor when a page has no new events", () => {
    const current = loaded({ lastSeq: 1 });
    const outcome = appendedReadPage(current, readResult({
      events: [event(1)],
      lastSeq: 1,
    }));
    expect(outcome.added).toBe(0);
    expect(outcome.lastSeq).toBe(1);
    expect(outcome.state.gap).toBeNull();
  });

  it("takes the maximum cursor from a live frame", () => {
    const outcome = appendedLiveEvents(loaded(), {
      type: "notification",
      subscription: 1,
      kind: "event",
      sessionId: "s1",
      events: [event(2), event(3)],
      cursor: 5,
      truncated: false,
    });
    expect(outcome.added).toBe(2);
    expect(outcome.lastSeq).toBe(5);
  });

  it("draws a gap only when the server reports truncation", () => {
    expect(gapFor(loaded(), [event(4)], false)).toBeNull();
    expect(gapFor(loaded(), [event(4)], true)).toEqual({ from: 2, to: 3 });
  });

  it("caps an older page and stops advertising more history", () => {
    const current = loaded({ events: [event(5)], lastSeq: 5 });
    const result = readResult({
      events: [event(5), event(4), event(3)],
      nextBefore: 3,
      hasMore: true,
    });
    const merged = mergedOlderPage(current, result);
    expect(merged.events.map((item) => item.seq)).toEqual([3, 4, 5]);
    expect(merged.hasMoreOlder).toBe(true);
    expect(merged.viewCapped).toBe(false);
  });
});
