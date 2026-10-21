import type { EventView, NotificationFrame, ReadResult } from "../wire/protocol";
import { appendEvents, mergeEvents } from "./model";
import type { Gap, SessionEventsState } from "./types";

/**
 * Pure event-history transitions. The store owns cursors and side effects;
 * these functions decide what a page or notification does to one session's
 * local event state.
 */

/** Draw a gap only where the server reports eviction; never infer one. */
export function gapFor(
  current: SessionEventsState,
  incoming: readonly EventView[],
  truncated: boolean,
): Gap | null {
  const first = incoming[0];
  return truncated && first && first.seq > current.lastSeq + 1
    ? { from: current.lastSeq + 1, to: first.seq - 1 }
    : current.gap;
}

export function eventsStateFromRead(result: ReadResult): SessionEventsState {
  return {
    events: result.events,
    earliestRetainedSeq: result.earliestRetainedSeq,
    lastSeq: result.lastSeq,
    nextBefore: result.nextBefore,
    hasMoreOlder: result.nextBefore !== null,
    truncated: result.truncated,
    viewCapped: false,
    loading: false,
    loadingOlder: false,
    loaded: true,
    gap: null,
  };
}

export function mergedOlderPage(
  current: SessionEventsState,
  result: ReadResult,
): SessionEventsState {
  const merged = mergeEvents(current.events, result.events, 10_000);
  const viewCapped = current.viewCapped || merged.dropped > 0;
  return {
    ...current,
    events: merged.events,
    earliestRetainedSeq:
      merged.dropped > 0 && merged.events[0]
        ? merged.events[0].seq
        : Math.min(current.earliestRetainedSeq, result.earliestRetainedSeq),
    nextBefore: result.nextBefore,
    hasMoreOlder: viewCapped ? false : result.nextBefore !== null,
    truncated: current.truncated || result.truncated,
    viewCapped,
    loadingOlder: false,
  };
}

export type AppendOutcome = {
  state: SessionEventsState;
  added: number;
  lastSeq: number;
};

/** A forward `sessions.read { since }` page. */
export function appendedReadPage(
  current: SessionEventsState,
  result: ReadResult,
): AppendOutcome {
  const nextCursor = result.hasMore ? result.nextSeq : result.lastSeq;
  if (!current.loaded) {
    return {
      state: {
        ...current,
        events: result.events,
        earliestRetainedSeq: result.earliestRetainedSeq,
        lastSeq: nextCursor,
        nextBefore: result.nextBefore,
        hasMoreOlder: result.nextBefore !== null,
        truncated: result.truncated,
        loaded: true,
        loading: false,
        gap: null,
      },
      added: result.events.length,
      lastSeq: nextCursor,
    };
  }
  const appended = appendEvents(current.events, result.events, current.lastSeq);
  const lastSeq = Math.max(current.lastSeq, nextCursor);
  return {
    state: {
      ...current,
      events: appended.events,
      lastSeq,
      earliestRetainedSeq: result.truncated
        ? result.earliestRetainedSeq
        : current.earliestRetainedSeq,
      truncated: current.truncated || result.truncated,
      gap: gapFor(current, result.events, result.truncated),
    },
    added: appended.added,
    lastSeq,
  };
}

export type EventNotification = Extract<NotificationFrame, { kind: "event" }>;

/** One live `event` notification. */
export function appendedLiveEvents(
  current: SessionEventsState,
  frame: EventNotification,
): AppendOutcome {
  const first = frame.events[0];
  const appended = appendEvents(current.events, frame.events, current.lastSeq);
  const lastSeq = Math.max(
    current.lastSeq,
    frame.cursor,
    frame.events[frame.events.length - 1]?.seq ?? 0,
  );
  return {
    state: {
      ...current,
      events: appended.events,
      lastSeq,
      earliestRetainedSeq: frame.truncated
        ? (first?.seq ?? current.earliestRetainedSeq)
        : current.earliestRetainedSeq,
      truncated: current.truncated || frame.truncated,
      gap: gapFor(current, frame.events, frame.truncated),
    },
    added: appended.added,
    lastSeq,
  };
}
