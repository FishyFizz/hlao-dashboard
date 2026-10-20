import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { ArrowDown, Search, WifiOff } from "lucide-react";
import { Button } from "../components/Button";
import {
  buildRenderItems,
  formatAge,
  formatDateTime,
  sessionLocalKey,
  type RenderItem,
} from "../store/model";
import {
  canUse,
  eventsFor,
  store,
  type DashboardState,
} from "../store/store";
import type { SessionView } from "../wire/protocol";
import { EventRow } from "./EventRow";

const SYSTEM_EVENT_TYPES = new Set([
  "usage",
  "plan",
  "plan.update",
  "commands",
  "stderr",
  "session.initialized",
  "session.info",
]);

function isSystemItem(item: RenderItem): boolean {
  if (item.kind === "compaction") {
    return item.status === "completed" && !item.error;
  }
  return item.kind === "event" && SYSTEM_EVENT_TYPES.has(item.event.type);
}

export function Transcript({
  state,
  session,
  onSearch,
  onOpenSession,
}: {
  state: DashboardState;
  session: SessionView;
  onSearch: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const eventsState = eventsFor(state, session.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderRef = useRef<HTMLDivElement>(null);
  const initialized = useRef<string | null>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const key = sessionLocalKey(session);
  const lastSeen = state.local.lastSeen[key] ?? 0;
  const [showSystem, setShowSystem] = useState(false);
  const renderItems = useMemo(
    () =>
      buildRenderItems(eventsState.events).filter(
        (item) => !(item.kind === "event" && item.event.type === "turn.started"),
      ),
    [eventsState.events],
  );
  const hiddenSystemCount = useMemo(
    () => renderItems.filter(isSystemItem).length,
    [renderItems],
  );
  const items = useMemo(
    () =>
      showSystem ? renderItems : renderItems.filter((item) => !isSystemItem(item)),
    [renderItems, showSystem],
  );
  const count = eventsState.events.length;
  const live = state.connection === "open" && !state.removed;
  const canPageBack = canUse(state, "read.before");
  const follow = atBottom;
  const unseen = Math.max(
    state.newEvents[session.id] ?? 0,
    Math.max(0, session.lastSeq - lastSeen),
  );
  const lastReadVisible =
    lastSeen > 0 && lastSeen < eventsState.lastSeq && lastSeen >= eventsState.earliestRetainedSeq;
  const lastReadEvicted = lastSeen > 0 && lastSeen < eventsState.earliestRetainedSeq;
  const gap = eventsState.gap;
  const showFoot = lastReadVisible || !atBottom || unseen > 0;

  const scrollToBottom = (markSeen = true) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
    store.setFollowTail(session.id, true);
    if (markSeen) store.markSeen(session.id, eventsState.lastSeq);
  };

  const scrollToEvent = (seq: number) => {
    const element = document.getElementById(`event-${seq}`);
    if (!element) return false;
    element.scrollIntoView({ block: "center" });
    return true;
  };

  useEffect(() => {
    if (!eventsState.loaded) return;
    if (initialized.current === session.id) return;
    initialized.current = session.id;
    const focus = state.focus;
    requestAnimationFrame(() => {
      if (focus?.sessionId === session.id && scrollToEvent(focus.seq)) return;
      if (lastReadVisible) {
        const divider = document.getElementById("last-read");
        if (divider) {
          divider.scrollIntoView({ block: "center" });
          atBottomRef.current = false;
          setAtBottom(false);
          store.setFollowTail(session.id, false);
          return;
        }
      }
      scrollToBottom(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, eventsState.loaded, lastReadVisible]);

  useEffect(() => {
    if (!state.focus || state.focus.sessionId !== session.id) return;
    let timer: number | null = null;
    const frame = requestAnimationFrame(() => {
      scrollToEvent(state.focus!.seq);
      timer = window.setTimeout(() => store.clearFocus(), 2_500);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [state.focus, session.id]);

  useEffect(() => {
    if (atBottomRef.current) {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    }
  }, [count]);

  const pauseFollow = () => {
    if (!atBottomRef.current) return;
    atBottomRef.current = false;
    setAtBottom(false);
    store.setFollowTail(session.id, false);
  };

  const loadOlderPage = (force = false) => {
    if (
      (!force && atBottomRef.current) ||
      !canPageBack ||
      !eventsState.hasMoreOlder ||
      eventsState.loadingOlder
    ) {
      return;
    }
    const element = scrollRef.current;
    const anchor = element ? { height: element.scrollHeight } : null;
    void store.loadOlder(session.id).then(() => {
      requestAnimationFrame(() => {
        const current = scrollRef.current;
        if (!current || !anchor) return;
        const delta = current.scrollHeight - anchor.height;
        if (delta > 0) current.scrollTop += delta;
      });
    });
  };

  useEffect(() => {
    if (!canPageBack || !eventsState.hasMoreOlder) return;
    const root = scrollRef.current;
    const target = olderRef.current;
    if (!root || !target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadOlderPage();
      },
      { root, rootMargin: "160px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
    // The observer should be rebuilt when the page or loading state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPageBack, eventsState.hasMoreOlder, eventsState.loadingOlder, session.id]);

  useEffect(() => {
    if (!canPageBack || !eventsState.hasMoreOlder || eventsState.loadingOlder) {
      return;
    }
    const element = scrollRef.current;
    if (!element) return;
    if (element.scrollHeight <= element.clientHeight + 80) {
      loadOlderPage(true);
    }
    // Fill a short tail page so the first screen is not a dead end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canPageBack,
    eventsState.events.length,
    eventsState.hasMoreOlder,
    session.id,
  ]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 36;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
      store.setFollowTail(session.id, bottom);
      if (bottom) store.markSeen(session.id, eventsState.lastSeq);
    }
    if (element.scrollTop < 80) loadOlderPage();
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) pauseFollow();
  };

  const onTouchMove = () => {
    pauseFollow();
  };

  const jumpToLatest = () => {
    scrollToBottom(true);
    void store.catchUp(session.id);
    store.clearFocus();
  };

  const jumpToLastRead = () => {
    const divider = document.getElementById("last-read");
    if (divider) {
      divider.scrollIntoView({ block: "center" });
      atBottomRef.current = false;
      setAtBottom(false);
      store.setFollowTail(session.id, false);
    }
  };

  if (!eventsState.loaded && eventsState.loading) {
    return (
      <div className="transcript-loading">Loading the latest bounded page…</div>
    );
  }

  return (
    <div className="transcript">
      <div className="transcript__bar">
          <span className="transcript__title">
            <span>
              {eventsState.loaded
                ? `${eventsState.earliestRetainedSeq} - ${eventsState.lastSeq} / ${count} loaded`
                : "not loaded"}
            </span>
            {state.removed ? (
              <span className="transcript__stale">
                <WifiOff className="icon" /> not live
              </span>
            ) : null}
          </span>
          <span className="transcript__actions">
            {!live ? (
              <span className="caption" title="Live events stop when the connection or session stops">
                events paused
              </span>
            ) : null}
            {hiddenSystemCount > 0 ? (
              <Button
                size="sm"
                variant={showSystem ? "secondary" : "ghost"}
                aria-pressed={showSystem}
                aria-label="Show or hide system events"
                title={`${hiddenSystemCount} hidden system events: usage, plan, compaction, commands, stderr, and session metadata`}
                onPress={() => setShowSystem((value) => !value)}
              >
                System
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onPress={onSearch}>
              <Search className="btn__icon icon" />
              Find
            </Button>
            <span className="caption" title="Follow the live edge">
              {follow ? "following" : "paused"}
            </span>
          </span>
        </div>

        {eventsState.truncated ? (
          <div className="banner banner--warn transcript-banner">
            <span className="banner__text">
              History begins at seq {eventsState.earliestRetainedSeq}. Earlier events
              were evicted by the supervisor; this view does not claim completeness.
            </span>
          </div>
        ) : null}
        {lastReadEvicted ? (
          <div className="banner transcript-banner">
            <span className="banner__text">
              The last read marker (seq {lastSeen}) was evicted. The view clamps to
              seq {eventsState.earliestRetainedSeq}.
            </span>
          </div>
        ) : null}

        <div
          className="transcript__scroll"
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          role="log"
          aria-label={`Transcript for ${session.name ?? session.id}`}
          aria-live="off"
        >
          {eventsState.viewCapped ? (
            <div className="transcript__older">
              <span className="caption">
                Local transcript limit reached; earlier events remain on the
                supervisor.
              </span>
            </div>
          ) : eventsState.hasMoreOlder && canPageBack ? (
            <div className="transcript__older" ref={olderRef} role="status">
              <span className="caption">
                {eventsState.loadingOlder
                  ? "Loading earlier events..."
                  : "Earlier events load automatically"}
              </span>
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="transcript-empty">
              {hiddenSystemCount > 0 ? (
                <>
                  <span className="transcript-empty__title">
                    System events are hidden.
                  </span>
                  <span className="transcript-empty__text">
                    Usage, plan, compaction, commands, stderr, and session
                    metadata are available via System. This session has no other
                    loaded events.
                  </span>
                  <Button size="sm" onPress={() => setShowSystem(true)}>
                    Show system events
                  </Button>
                </>
              ) : (
                <>
                  <span className="transcript-empty__title">No events yet.</span>
                  <span className="transcript-empty__text">
                    {canUseLocal(state, "session.lastEvent")
                      ? "The supervisor reports no events for this session."
                      : "This supervisor does not report the last event."}
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="transcript__list">
              {items.map((item, index) => {
                const turn = itemTurn(item);
                const previous = index > 0 ? itemTurn(items[index - 1]!) : null;
                const showTurn = turn !== null && turn !== previous;
                const seq = itemSeq(item);
                const showRead =
                  lastReadVisible &&
                  lastSeen < seq &&
                  (index === 0 || lastSeen >= previousSeq(items, index));
                const showGap =
                  gap !== null &&
                  seq > gap.to &&
                  (index === 0 || previousSeq(items, index) <= gap.to);
                return (
                  <div key={item.id}>
                    {showTurn ? (
                      <div className="event event--divider transcript-turn">
                        <span>Turn {turn}</span>
                        <span>{formatDateTime(itemStart(item))}</span>
                      </div>
                    ) : null}
                    {showGap && gap ? (
                      <div className="event event--divider event--gap">
                        <span>
                          History gap · seq {gap.from}–{gap.to} not retained
                        </span>
                        <span>{formatDateTime(itemStart(item))}</span>
                      </div>
                    ) : null}
                    {showRead ? (
                      <div className="event event--divider" id="last-read">
                        <span>
                          Last read · seq {lastSeen}
                          {atBottom ? null : (
                            <button type="button" className="transcript__link" onClick={jumpToLatest}>
                              jump to latest
                            </button>
                          )}
                        </span>
                        <span>{formatAge(itemStart(item), Date.now())} after</span>
                      </div>
                    ) : null}
                    <EventRow
                      item={item}
                      session={session}
                      focused={
                        state.focus?.sessionId === session.id &&
                        state.focus.seq === seq
                      }
                      onOpenSession={onOpenSession}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showFoot ? (
          <div className="transcript__foot">
            <span className="transcript__foot-actions">
              {lastReadVisible ? (
                <Button size="sm" variant="ghost" onPress={jumpToLastRead}>
                  Last read
                </Button>
              ) : null}
              {!atBottom ? (
                <Button size="sm" onPress={jumpToLatest}>
                  <ArrowDown className="btn__icon icon" />
                  Jump to latest
                </Button>
              ) : null}
              {unseen > 0 ? (
                <Button size="sm" variant="primary" onPress={jumpToLatest}>
                  {unseen} new event{unseen === 1 ? "" : "s"}
                </Button>
              ) : null}
            </span>
          </div>
        ) : null}
    </div>
  );
}

function canUseLocal(state: DashboardState, capability: string): boolean {
  return canUse(state, capability);
}

function itemTurn(item: RenderItem): number | null {
  return item.kind === "event" ? item.event.turn : item.turn;
}

function itemSeq(item: RenderItem): number {
  return item.kind === "event" ? item.event.seq : item.seq;
}

function previousSeq(items: RenderItem[], index: number): number {
  for (let i = index - 1; i >= 0; i -= 1) {
    return itemSeq(items[i]!);
  }
  return 0;
}

function itemStart(item: RenderItem): string {
  return item.kind === "event" ? item.event.at : item.at;
}
