import type { EventView, ReadResult, SessionView, WireError } from "../wire/protocol";
import { asWireError } from "../wire/protocol";
import type { SupervisorTransport } from "../wire/transport";
import {
  latestNotice,
  mergeEvents,
  sessionLocalKey,
  toolPayloadFromEvents,
  type NoticeRecord,
  type ToolPayload,
} from "./model";
import {
  appendedReadPage,
  eventsStateFromRead,
  mergedOlderPage,
} from "./eventState";
import type { InstanceLocalState } from "./persistence";
import {
  EMPTY_EVENTS,
  type DashboardState,
  type SessionEventsState,
  type Toast,
} from "./types";

/**
 * What the history controller may do to the store. Selection, paging, replay
 * markers, and read markers are the whole responsibility of this module.
 */
export type HistoryHost = {
  getState(): DashboardState;
  getTransport(): SupervisorTransport | null;
  setState(patch: Partial<DashboardState>): void;
  setLocal(local: InstanceLocalState, immediate?: boolean): void;
  addToast(toast: Omit<Toast, "id">): string;
  patchSessionEvents(sessionId: string, patch: Partial<SessionEventsState>): void;
  applySession(view: SessionView): void;
  setNotice(session: SessionView, notice: NoticeRecord): void;
  refreshQueue(sessionId: string): Promise<void>;
  subscribeToFleet(): Promise<void>;
};

/**
 * Selection, transcript paging, and local read/replay markers. Every method
 * preserves the rule that local state is not authority: events are always
 * replaced or appended from a supervisor response.
 */
export class HistoryController {
  private readonly loadTokens = new Map<string, number>();

  constructor(private readonly host: HistoryHost) {}

  selectSession(sessionId: string): void {
    const state = this.host.getState();
    const session = state.sessions[sessionId];
    if (!session) return;
    if (
      state.selection?.id === session.id &&
      state.selection.createdAt === session.createdAt
    ) {
      if (!state.events[sessionId]?.loaded) void this.loadSession(sessionId);
      return;
    }
    const selection = { id: session.id, createdAt: session.createdAt };
    const seen = state.local.lastSeen[sessionLocalKey(session)] ?? 0;
    this.host.setState({
      selection,
      removed: false,
      removedSession: null,
      focus: null,
      queue: state.queue?.session.id === session.id ? state.queue : null,
      ...(seen === 0
        ? { followTail: { ...state.followTail, [session.id]: true } }
        : {}),
    });
    this.host.setLocal({ ...this.host.getState().local, selected: selection }, true);
    void this.afterSelection(session);
  }

  async afterSelection(session: SessionView): Promise<void> {
    const loaded = this.host.getState().events[session.id];
    if (!loaded?.loaded) {
      await this.loadSession(session.id);
    } else if (loaded.lastSeq < session.lastSeq) {
      await this.fillGap(session.id, loaded.lastSeq);
    }
    await this.host.refreshQueue(session.id);
    await this.host.subscribeToFleet();
  }

  backToFleet(): void {
    const state = this.host.getState();
    this.host.setState({
      selection: null,
      removed: false,
      removedSession: null,
      queue: null,
      focus: null,
    });
    this.host.setLocal({ ...state.local, selected: null }, true);
    void this.host.subscribeToFleet();
  }

  async loadSession(sessionId: string): Promise<void> {
    const transport = this.host.getTransport();
    const state = this.host.getState();
    const session = state.sessions[sessionId];
    if (!transport || !session) return;
    const current = state.events[sessionId];
    if (current?.loading) return;
    const token = (this.loadTokens.get(sessionId) ?? 0) + 1;
    this.loadTokens.set(sessionId, token);
    this.host.patchSessionEvents(sessionId, { loading: true });

    try {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        limit: 100,
      });
      if (this.loadTokens.get(sessionId) !== token) return;
      this.host.applySession(result.session);
      const notice = latestNotice(result.events);
      this.host.patchSessionEvents(sessionId, eventsStateFromRead(result));
      this.markReplayBoundary(sessionId, result.events);
      if (notice) this.host.setNotice(result.session, notice);
      if (this.host.getState().selection?.id === sessionId) {
        await this.host.refreshQueue(sessionId);
      }
    } catch (error) {
      this.host.patchSessionEvents(sessionId, { loading: false });
      this.host.addToast({
        tone: "danger",
        title: "Could not load the transcript",
        text: asWireError(error).message,
      });
    }
  }

  async loadOlder(sessionId: string): Promise<void> {
    const transport = this.host.getTransport();
    const current = this.host.getState().events[sessionId];
    if (!transport || !current?.loaded || current.loadingOlder || !current.nextBefore) {
      return;
    }
    this.host.patchSessionEvents(sessionId, { loadingOlder: true });
    try {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        before: current.nextBefore,
        limit: 100,
      });
      this.host.patchSessionEvents(sessionId, mergedOlderPage(current, result));
    } catch (error) {
      this.host.patchSessionEvents(sessionId, { loadingOlder: false });
      this.host.addToast({
        tone: "danger",
        title: "Could not load older events",
        text: asWireError(error).message,
      });
    }
  }

  /**
   * Live events and ordinary pages carry no private ACP payloads, so the
   * transcript cannot render a tool's parameters until it asks for them.
   * Fetch the raw events for one call when the operator opens its row.
   */
  async loadToolPayload(
    sessionId: string,
    toolCallId: string,
    fromSeq: number,
    toSeq: number,
  ): Promise<ToolPayload> {
    const transport = this.host.getTransport();
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    const events: EventView[] = [];
    let since = Math.max(0, fromSeq - 1);
    for (let page = 0; page < 10; page += 1) {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        since,
        limit: 200,
        raw: true,
        types: ["tool.call", "tool.update"],
        grep: toolCallId,
      });
      events.push(...result.events);
      if (!result.hasMore || result.nextSeq <= since || result.nextSeq >= toSeq) break;
      since = result.nextSeq;
    }
    return toolPayloadFromEvents(events, toolCallId);
  }

  async fillGap(sessionId: string, since: number): Promise<void> {
    const transport = this.host.getTransport();
    if (!transport) return;
    let cursor = since;
    try {
      for (let page = 0; page < 10; page += 1) {
        const result = await transport.request<ReadResult>("sessions.read", {
          sessionId,
          since: cursor,
          limit: 200,
        });
        this.host.applySession(result.session);
        this.applyRead(sessionId, result);
        if (!result.hasMore) return;
        const next = result.nextSeq;
        if (next <= cursor) return;
        cursor = next;
      }
    } catch {
      // The subscription will retry; do not replace history with a guess.
    }
  }

  /** Apply a forward page from polling, catch-up, or fillGap. */
  applyRead(sessionId: string, result: ReadResult): void {
    const state = this.host.getState();
    const current = state.events[sessionId] ?? EMPTY_EVENTS;
    const outcome = appendedReadPage(current, result);
    this.host.patchSessionEvents(sessionId, outcome.state);
    if (
      current.loaded &&
      outcome.added > 0 &&
      state.selection?.id === sessionId &&
      state.followTail[sessionId]
    ) {
      this.markSeen(sessionId, outcome.lastSeq);
    }
    this.markReplayBoundary(sessionId, result.events);
    const notice = latestNotice(result.events);
    if (notice) this.host.setNotice(result.session, notice);
  }

  async catchUp(sessionId: string): Promise<void> {
    const state = this.host.getState();
    const current = state.events[sessionId];
    const session = state.sessions[sessionId];
    if (!current?.loaded) {
      await this.loadSession(sessionId);
      return;
    }
    if (session && current.lastSeq < session.lastSeq) {
      await this.fillGap(sessionId, current.lastSeq);
    }
  }

  async openAtSeq(sessionId: string, seq: number): Promise<void> {
    this.selectSession(sessionId);
    const current = this.host.getState().events[sessionId];
    if (!current?.loaded) await this.loadSession(sessionId);
    const loaded = this.host.getState().events[sessionId];
    if (loaded?.loaded && !loaded.events.some((event) => event.seq === seq)) {
      const transport = this.host.getTransport();
      if (transport) {
        try {
          const result = await transport.request<ReadResult>("sessions.read", {
            sessionId,
            before: seq + 1,
            limit: 50,
          });
          const merged = mergeEvents(loaded.events, result.events);
          this.host.patchSessionEvents(sessionId, {
            events: merged.events,
            nextBefore: result.nextBefore ?? loaded.nextBefore,
            hasMoreOlder: true,
          });
        } catch {
          // The event may have been evicted; the transcript will show the gap.
        }
      }
    }
    this.host.setState({ focus: { sessionId, seq } });
  }

  clearFocus(): void {
    this.host.setState({ focus: null });
  }

  /**
   * Restored history is not new activity. A `session.resumed`/`session.forked`
   * event closes the replay block, so moving the read marker to it keeps the
   * fleet badge honest without hiding later live events.
   */
  markReplayBoundary(sessionId: string, events: readonly EventView[]): void {
    let boundary = 0;
    for (const event of events) {
      if (
        event.type === "session.resumed" ||
        event.type === "session.forked"
      ) {
        boundary = Math.max(boundary, event.seq);
      }
    }
    if (boundary > 0) this.markSeen(sessionId, boundary);
  }

  markSeen(sessionId: string, seq: number): void {
    const state = this.host.getState();
    const session = state.sessions[sessionId];
    if (!session || !Number.isFinite(seq)) return;
    const key = sessionLocalKey(session);
    const current = state.local.lastSeen[key] ?? 0;
    if (seq <= current) return;
    this.host.setLocal({
      ...state.local,
      lastSeen: { ...state.local.lastSeen, [key]: seq },
    });
  }

  setFollowTail(sessionId: string, value: boolean): void {
    const state = this.host.getState();
    if ((state.followTail[sessionId] ?? false) === value) {
      if (value) {
        const session = state.sessions[sessionId];
        if (session) this.markSeen(sessionId, session.lastSeq);
      }
      return;
    }
    const followTail = { ...state.followTail, [sessionId]: value };
    this.host.setState({ followTail });
    if (value) {
      const session = state.sessions[sessionId];
      if (session) this.markSeen(sessionId, session.lastSeq);
    }
  }
}
