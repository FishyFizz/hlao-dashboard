import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronUp, Search, WifiOff } from "lucide-react";
import { Button } from "../components/Button";
import { Handle } from "../components/Status";
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
  const initialized = useRef<string | null>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const key = sessionLocalKey(session);
  const lastSeen = state.local.lastSeen[key] ?? 0;
  const items = useMemo(
    () =>
      buildRenderItems(eventsState.events).filter(
        (item) => !(item.kind === "event" && item.event.type === "turn.started"),
      ),
    [eventsState.events],
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

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 36;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    store.setFollowTail(session.id, bottom);
    if (bottom) store.markSeen(session.id, eventsState.lastSeq);
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
      <div className="transcript-wrap">
        <div className="transcript-loading">Loading the latest bounded page…</div>
      </div>
    );
  }

  return (
    <div className="transcript-wrap">
      <div className="transcript">
        <div className="transcript__bar">
          <span className="transcript__title">
            <span
              className={`lamp ${live ? "lamp--accent" : "lamp--off"}`}
              aria-hidden="true"
            />
            <strong>
              {state.removed
                ? "Local snapshot"
                : live
                  ? "Live"
                  : state.connection === "reconnecting"
                    ? "Reconnecting"
                    : "Stale"}
            </strong>
            <Handle id={session.id} />
            <span className="event__sep">/</span>
            <span>
              {eventsState.loaded
                ? `${eventsState.earliestRetainedSeq}–${eventsState.lastSeq} · ${count} loaded`
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
          role="log"
          aria-label={`Transcript for ${session.name ?? session.id}`}
          aria-live="off"
        >
          {eventsState.hasMoreOlder && canPageBack ? (
            <div className="transcript__older">
              <Button
                size="sm"
                variant="ghost"
                isDisabled={eventsState.loadingOlder}
                onPress={() => void store.loadOlder(session.id)}
              >
                <ChevronUp className="btn__icon icon" />
                {eventsState.loadingOlder ? "Loading older…" : "Load older events"}
              </Button>
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="transcript-empty">
              <span className="transcript-empty__title">No events yet.</span>
              <span className="transcript-empty__text">
                {canUseLocal(state, "session.lastEvent")
                  ? "The supervisor reports no events for this session."
                  : "This supervisor does not report the last event."}
              </span>
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
                      onFocusGate={() =>
                        document
                          .querySelector(".permission-gate")
                          ?.scrollIntoView({ block: "center" })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="transcript__foot">
          <span className="caption">
            {eventsState.loaded
              ? `${eventsState.earliestRetainedSeq}–${eventsState.lastSeq} · ${formatDateTime(
                  eventsState.events[eventsState.events.length - 1]?.at ?? new Date().toISOString(),
                )}`
              : "no page loaded"}
          </span>
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
      </div>
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
