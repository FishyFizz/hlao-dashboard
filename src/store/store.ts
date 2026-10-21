import { DemoTransport } from "../demo/demoSupervisor";
import {
  appendEvents,
  attentionFor,
  descendantsOf,
  eventText,
  isTerminalStatus,
  latestNotice,
  mergeEvents,
  normalizeHome,
  resolveTarget,
  sessionLocalKey,
  toolPayloadFromEvents,
  type AttentionItem,
  type LocalReadingState,
  type NoticeRecord,
  type TargetResolution,
  type ToolPayload,
} from "./model";
import {
  emptyInstanceState,
  loadPersistence,
  savePersistence,
  saveTheme,
  type InstanceLocalState,
  type PersistedState,
  type Theme,
} from "./persistence";
import {
  BridgeTransport,
  type ConnectionStatus,
  type SupervisorTransport,
  type TransportSink,
} from "../wire/transport";
import type {
  BackendsListResult,
  CancelResult,
  CloseResult,
  EventView,
  HelloResult,
  LastCrash,
  NotificationFrame,
  PermitParams,
  PermitResult,
  ProviderSessionsResult,
  QueueDropResult,
  QueueResult,
  ReadResult,
  ReloadResult,
  SendResult,
  SessionView,
  ShutdownResult,
  SpawnParams,
  SpawnResult,
  SubscribeResult,
  WireError,
} from "../wire/protocol";
import {
  asWireError,
  CAPABILITIES,
  hasCapability,
  WIRE_MAJOR,
} from "../wire/protocol";
import { newId } from "../lib/id";

export type Phase = "boot" | "connecting" | "setup" | "live";
export type Mode = "bridge" | "demo";

export type Selection = { id: string; createdAt: string };

export type Gap = { from: number; to: number };

export type SessionEventsState = {
  events: EventView[];
  earliestRetainedSeq: number;
  lastSeq: number;
  nextBefore: number | null;
  hasMoreOlder: boolean;
  truncated: boolean;
  viewCapped: boolean;
  loading: boolean;
  loadingOlder: boolean;
  loaded: boolean;
  gap: Gap | null;
};

export type ToastTone = "info" | "ok" | "danger";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  text?: string;
};

export type RestartNotice = {
  at: string;
  previousPid: number;
  previousStartedAt: string;
  nextPid: number;
  nextStartedAt: string;
};

export type DashboardState = {
  phase: Phase;
  mode: Mode | null;
  connection: ConnectionStatus;
  home: string;
  instance: HelloResult | null;
  connectError: WireError | null;
  lastUpdatedAt: string | null;
  fleetLoaded: boolean;
  sessions: Record<string, SessionView>;
  removedIds: Record<string, true>;
  events: Record<string, SessionEventsState>;
  notices: Record<string, NoticeRecord>;
  selection: Selection | null;
  removed: boolean;
  removedSession: SessionView | null;
  subscription: number | null;
  transportKind: "stream" | "poll" | null;
  queue: QueueResult | null;
  queueLoading: boolean;
  followTail: Record<string, boolean>;
  focus: { sessionId: string; seq: number } | null;
  local: InstanceLocalState;
  pending: Record<string, boolean>;
  actionError: Record<string, string>;
  toasts: Toast[];
  crashNotice: LastCrash | null;
  restartNotice: RestartNotice | null;
  theme: Theme;
  notifications: boolean;
  introSeen: boolean;
};

export type SearchScope = "session" | "instance";
export type SearchOptions = {
  query: string;
  scope: SearchScope;
  includeClosed: boolean;
  raw: boolean;
  regex?: boolean;
};
export type SearchHit = {
  session: SessionView;
  event: EventView;
  snippet: string;
};
export type SearchOutcome = {
  hits: SearchHit[];
  scannedSessions: number;
  totalSessions: number;
  capped: boolean;
  truncated: boolean;
  asOf: string;
  cancelled: boolean;
  errors: string[];
};

export type ExportResult = {
  events: EventView[];
  truncated: boolean;
  capped: boolean;
  pages: number;
};

export type DirectoryListing = {
  path: string;
  parent: string | null;
  entries: Array<{ name: string; path: string }>;
  roots: string[];
};

/** Most mutations echo the full session view; the client never merges a patch. */
type SessionResult = { session: SessionView };

const EMPTY_EVENTS: SessionEventsState = {
  events: [],
  earliestRetainedSeq: 1,
  lastSeq: 0,
  nextBefore: null,
  hasMoreOlder: false,
  truncated: false,
  viewCapped: false,
  loading: false,
  loadingOlder: false,
  loaded: false,
  gap: null,
};

/** Draw a gap only where the server reports eviction; never infer one. */
function gapFor(
  current: SessionEventsState,
  incoming: readonly EventView[],
  truncated: boolean,
): Gap | null {
  const first = incoming[0];
  return truncated && first && first.seq > current.lastSeq + 1
    ? { from: current.lastSeq + 1, to: first.seq - 1 }
    : current.gap;
}

export function selectedSession(state: DashboardState): SessionView | null {
  if (!state.selection) return null;
  const session = state.sessions[state.selection.id];
  if (!session) return null;
  return session.createdAt === state.selection.createdAt ? session : null;
}

export function eventsFor(
  state: DashboardState,
  sessionId: string | null,
): SessionEventsState {
  if (!sessionId) return EMPTY_EVENTS;
  return state.events[sessionId] ?? EMPTY_EVENTS;
}

export function attentionItems(state: DashboardState): AttentionItem[] {
  const local: LocalReadingState = {
    acknowledged: state.local.acknowledged,
    dismissedNotices: state.local.dismissedNotices,
  };
  return attentionFor(Object.values(state.sessions), state.notices, local);
}

export function canUse(
  state: DashboardState,
  capability: string,
): boolean {
  return state.instance ? hasCapability(state.instance.capabilities, capability) : false;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class DashboardStore {
  private state: DashboardState;
  private listeners = new Set<() => void>();
  private persisted: PersistedState;
  private transport: SupervisorTransport | null = null;
  private bootStarted = false;
  private connectToken = 0;
  private subscribeGeneration = 0;
  private resyncing = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollBusy = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private notificationQueue: NotificationFrame[] = [];
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;
  private batchDepth = 0;
  private batchDirty = false;
  private toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private queueTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private noticeProbes = new Map<string, number>();
  private sendAttempts = new Map<
    string,
    { key: string; messageId: string; text: string }
  >();
  private searchToken = 0;
  private loadTokens = new Map<string, number>();

  constructor() {
    this.persisted = loadPersistence();
    this.state = {
      phase: "boot",
      mode: null,
      connection: "connecting",
      home: "",
      instance: null,
      connectError: null,
      lastUpdatedAt: null,
      fleetLoaded: false,
      sessions: {},
      removedIds: {},
      events: {},
      notices: {},
      selection: null,
      removed: false,
      removedSession: null,
      subscription: null,
      transportKind: null,
      queue: null,
      queueLoading: false,
      followTail: {},
      focus: null,
      local: emptyInstanceState(),
      pending: {},
      actionError: {},
      toasts: [],
      crashNotice: null,
      restartNotice: null,
      theme: this.persisted.theme,
      notifications: this.persisted.notifications,
      introSeen: this.persisted.introSeen,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): DashboardState => this.state;

  private setState(patch: Partial<DashboardState>): void {
    this.state = { ...this.state, ...patch };
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener();
  }

  private setPending(key: string, value: boolean): void {
    const pending = { ...this.state.pending };
    if (value) pending[key] = true;
    else delete pending[key];
    this.setState({ pending });
  }

  private setActionError(key: string, message: string | null): void {
    const actionError = { ...this.state.actionError };
    if (message) actionError[key] = message;
    else delete actionError[key];
    this.setState({ actionError });
  }

  addToast(toast: Omit<Toast, "id">): string {
    const id = newId("toast");
    const next = [...this.state.toasts, { ...toast, id }].slice(-4);
    this.setState({ toasts: next });
    const timer = setTimeout(() => this.dismissToast(id), toast.tone === "danger" ? 9_000 : 6_000);
    this.toastTimers.set(id, timer);
    return id;
  }

  dismissToast(id: string): void {
    const timer = this.toastTimers.get(id);
    if (timer) clearTimeout(timer);
    this.toastTimers.delete(id);
    this.setState({ toasts: this.state.toasts.filter((toast) => toast.id !== id) });
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  async boot(): Promise<void> {
    if (this.bootStarted) return;
    this.bootStarted = true;
    const demo =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1";
    await this.connect(demo ? "demo" : "bridge");
  }

  async connect(mode: Mode): Promise<void> {
    const token = ++this.connectToken;
    this.stopPolling();
    this.clearNotificationQueue();
    this.disposeTransport();
    this.setState({
      phase: "connecting",
      mode,
      connection: "connecting",
      connectError: null,
      fleetLoaded: false,
      restartNotice: null,
    });

    const transport: SupervisorTransport =
      mode === "demo" ? new DemoTransport() : new BridgeTransport();
    this.transport = transport;

    const sink: TransportSink = {
      onHello: (hello, home) => {
        if (this.transport !== transport) return;
        this.handleHello(hello, home);
      },
      onNotification: (frame) => {
        if (this.transport !== transport) return;
        this.handleNotification(frame);
      },
      onConnection: (status, error) => {
        if (this.transport !== transport) return;
        this.handleConnection(status, error);
      },
    };

    try {
      const start = await transport.start(sink);
      if (token !== this.connectToken) return;
      if (!start.hello) {
        this.setState({
          phase: "setup",
          connection: "offline",
          home: start.home,
          instance: null,
          connectError: start.error ?? {
            code: "supervisor_unavailable",
            message: "No HLAO supervisor is reachable.",
          },
        });
        return;
      }
      await this.enterInstance(start.hello, start.home, mode, token);
    } catch (error) {
      if (token !== this.connectToken) return;
      this.setState({
        phase: "setup",
        connection: "offline",
        connectError: asWireError(error),
      });
    }
  }

  async connectDemo(): Promise<void> {
    await this.connect("demo");
  }

  async retry(): Promise<void> {
    await this.connect(this.state.mode ?? "bridge");
  }

  private disposeTransport(): void {
    this.transport?.close();
    this.transport = null;
    this.subscribeGeneration += 1;
    this.setState({ subscription: null, transportKind: null });
  }

  private get selectedId(): string | null {
    return this.state.removed ? null : this.state.selection?.id ?? null;
  }

  private handleConnection(status: ConnectionStatus, error?: WireError): void {
    if (status === "open") {
      this.setState({ connection: "open", connectError: null });
      return;
    }
    if (status === "reconnecting") {
      this.setState({ connection: "reconnecting", connectError: error ?? null });
      return;
    }
    if (status === "offline") {
      this.setState({
        connection: "offline",
        connectError:
          error ?? {
            code: "supervisor_unavailable",
            message: `No HLAO supervisor is reachable at ${this.state.home}.`,
          },
      });
    }
  }

  private handleHello(hello: HelloResult, home: string): void {
    const previous = this.state.instance;
    if (!previous || previous.pid !== hello.pid || previous.startedAt !== hello.startedAt) {
      void this.enterInstance(hello, home, this.state.mode ?? "bridge", this.connectToken);
      return;
    }
    this.setState({
      instance: hello,
      home,
      connection: "open",
      connectError: null,
      lastUpdatedAt: nowIso(),
    });
    void this.resync();
  }

  private async enterInstance(
    hello: HelloResult,
    home: string,
    mode: Mode,
    connectToken: number,
  ): Promise<void> {
    if (hello.protocolVersion?.major !== WIRE_MAJOR) {
      this.setState({
        phase: "setup",
        connection: "offline",
        home,
        mode,
        instance: hello,
        connectError: {
          code: "version_mismatch",
          message: `This dashboard speaks wire major ${WIRE_MAJOR}; the supervisor at ${home} speaks major ${hello.protocolVersion?.major ?? "unknown"}. Stop it with the matching client before starting 3.0.`,
        },
      });
      return;
    }

    const previous = this.state.instance;
    const previousHome = this.state.home;
    const homeChanged =
      previous !== null &&
      normalizeHome(previousHome) !== normalizeHome(home);
    const identityChanged =
      previous !== null &&
      (previous.pid !== hello.pid || previous.startedAt !== hello.startedAt);
    const restarted = previous !== null && !homeChanged && identityChanged;
    const fresh = !previous || homeChanged || restarted;
    if (fresh) this.clearNotificationQueue();
    const local = fresh ? this.loadLocal(home) : this.state.local;
    const localSelected = local.selected;

    this.setState({
      phase: "live",
      mode,
      home,
      instance: hello,
      connection: "open",
      connectError: null,
      lastUpdatedAt: nowIso(),
      fleetLoaded: false,
      local,
      ...(fresh
        ? {
            sessions: {},
            removedIds: {},
            events: {},
            notices: {},
            selection: null,
            removed: false,
            removedSession: null,
            queue: null,
            subscription: null,
            followTail: {},
            focus: null,
            transportKind: null,
            restartNotice: restarted && previous
              ? {
                  at: nowIso(),
                  previousPid: previous.pid,
                  previousStartedAt: previous.startedAt,
                  nextPid: hello.pid,
                  nextStartedAt: hello.startedAt,
                }
              : null,
          }
        : {}),
      crashNotice: hello.lastCrash ?? null,
    });

    try {
      await this.loadFleet();
    } catch (error) {
      if (connectToken === this.connectToken) {
        this.setState({
          phase: "setup",
          connectError: asWireError(error),
          connection: "offline",
        });
      }
      return;
    }
    if (connectToken !== this.connectToken) return;

    let selection: Selection | null = null;
    if (!fresh && this.state.selection) {
      selection = this.state.selection;
    } else if (localSelected) {
      const candidate = this.state.sessions[localSelected.id];
      if (candidate && candidate.createdAt === localSelected.createdAt) {
        selection = localSelected;
      }
    }

    if (selection) {
      this.setState({ selection, removed: false, removedSession: null });
      if (!this.state.events[selection.id]?.loaded) {
        await this.loadSession(selection.id);
      }
    } else if (localSelected) {
      this.setLocal({ ...local, selected: null });
      this.setState({ selection: null, removed: false });
    }

    if (connectToken !== this.connectToken) return;
    await this.subscribeToFleet();
  }

  private loadLocal(home: string): InstanceLocalState {
    const stored = this.persisted.instances[normalizeHome(home)];
    if (!stored) return emptyInstanceState();
    return {
      ...stored,
      drafts: { ...stored.drafts },
      lastSeen: { ...stored.lastSeen },
      acknowledged: { ...stored.acknowledged },
      dismissedNotices: { ...stored.dismissedNotices },
      dismissedEvictions: { ...stored.dismissedEvictions },
      filters: { ...stored.filters },
    };
  }

  private setLocal(local: InstanceLocalState, immediate = false): void {
    this.setState({ local });
    if (immediate) this.persist();
    else this.schedulePersist();
  }

  flushPersistence(): void {
    this.persist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 200);
  }

  private persist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const instances = { ...this.persisted.instances };
    if (this.state.home) {
      instances[normalizeHome(this.state.home)] = this.state.local;
    }
    this.persisted = {
      version: 1,
      theme: this.state.theme,
      notifications: this.state.notifications,
      introSeen: this.state.introSeen,
      instances,
    };
    savePersistence(this.persisted);
  }

  /* ---------------------------------------------------------------- */
  /* Fleet and subscription                                            */
  /* ---------------------------------------------------------------- */

  async loadFleet(): Promise<Record<string, SessionView>> {
    const transport = this.transport;
    if (!transport) return this.state.sessions;
    const result = await transport.request<{ sessions: SessionView[] }>(
      "sessions.list",
      { includeClosed: true },
    );
    const sessions: Record<string, SessionView> = {};
    const removedIds = { ...this.state.removedIds };
    for (const session of result.sessions) {
      sessions[session.id] = session;
      delete removedIds[session.id];
    }
    this.setState({
      sessions,
      removedIds,
      fleetLoaded: true,
      lastUpdatedAt: nowIso(),
    });
    for (const session of result.sessions) {
      if (session.lastEvent?.type === "notice") void this.probeNotice(session);
    }
    this.maybeRefreshQueue();
    return sessions;
  }

  private applySessions(views: readonly SessionView[]): void {
    const sessions = { ...this.state.sessions };
    const removedIds = { ...this.state.removedIds };
    let selection = this.state.selection;
    let removed = this.state.removed;
    let changedSelectedQueue = false;
    const selectedBefore = selectedSession(this.state);

    for (const view of views) {
      const current = sessions[view.id];
      if (selection && selection.id === view.id && selection.createdAt !== view.createdAt) {
        selection = null;
        removed = false;
        this.setLocal({ ...this.state.local, selected: null });
      }
      if (!current && removedIds[view.id]) continue;
      if (current && current.lastSeq > view.lastSeq) continue;
      sessions[view.id] = view;
      delete removedIds[view.id];
      if (view.lastEvent?.type === "notice") void this.probeNotice(view);
    }

    if (selectedBefore) {
      const after = sessions[selectedBefore.id];
      if (after && after.queued !== selectedBefore.queued) changedSelectedQueue = true;
    }

    this.setState({ sessions, removedIds, selection, removed });
    if (changedSelectedQueue) this.maybeRefreshQueue();
  }

  private applySession(view: SessionView): void {
    this.applySessions([view]);
  }

  private async subscribeToFleet(): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    const capabilities = this.state.instance?.capabilities ?? [];
    if (!hasCapability(capabilities, CAPABILITIES.streamSubscribe)) {
      this.startPolling();
      return;
    }

    const generation = ++this.subscribeGeneration;
    const previous = this.state.subscription;
    if (previous !== null) {
      this.setState({ subscription: null });
      try {
        await transport.request("stream.unsubscribe", { subscription: previous });
      } catch {
        // The connection may already be gone; the next subscribe is authoritative.
      }
    }

    const followedId = this.selectedId;
    const sessionIds = followedId ? [followedId] : [];
    const loaded = followedId ? this.state.events[followedId] : null;
    const canResume = hasCapability(capabilities, CAPABILITIES.streamResume);
    const since =
      canResume && followedId && loaded?.loaded && loaded.lastSeq > 0
        ? { [followedId]: loaded.lastSeq }
        : undefined;

    try {
      const result = await transport.request<SubscribeResult>("stream.subscribe", {
        fleet: true,
        ...(sessionIds.length > 0 ? { sessionIds } : {}),
        ...(since ? { since } : {}),
      });
      if (generation !== this.subscribeGeneration) {
        try {
          await transport.request("stream.unsubscribe", {
            subscription: result.subscription,
          });
        } catch {
          // Superseded subscription; nothing else to do.
        }
        return;
      }
      this.setState({
        subscription: result.subscription,
        transportKind: "stream",
        lastUpdatedAt: nowIso(),
      });
      this.applySessions(result.sessions);
      if (followedId) {
        // Catch up between the tail page and the live subscription. A
        // notification and a response may arrive in either order; appending by
        // seq makes the second copy a no-op.
        const latest = this.state.events[followedId];
        void this.fillGap(followedId, latest?.loaded ? latest.lastSeq : 0);
      }
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Live subscription failed",
        text: asWireError(error).message,
      });
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.setState({ transportKind: "poll" });
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, 2_000);
    void this.poll();
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async poll(): Promise<void> {
    if (this.pollBusy || !this.transport) return;
    this.pollBusy = true;
    try {
      await this.loadFleet();
      const selection = this.state.selection;
      if (selection && this.transport) {
        const current = this.state.events[selection.id];
        const since = current?.loaded ? current.lastSeq : 0;
        const result = await this.transport.request<ReadResult>("sessions.read", {
          sessionId: selection.id,
          since,
          limit: 100,
        });
        this.applySession(result.session);
        this.applyReadAppend(selection.id, result);
      }
      this.setState({ connection: "open", connectError: null });
    } catch (error) {
      const wire = asWireError(error);
      this.setState({ connection: "offline", connectError: wire });
    } finally {
      this.pollBusy = false;
    }
  }

  private async resync(): Promise<void> {
    if (this.resyncing || !this.transport) return;
    this.resyncing = true;
    try {
      const previousSelected = this.state.selection
        ? this.state.sessions[this.state.selection.id] ?? null
        : null;
      await this.loadFleet();
      const selection = this.state.selection;
      if (selection) {
        const current = this.state.sessions[selection.id];
        if (!current || current.createdAt !== selection.createdAt) {
          this.setState({
            removed: true,
            removedSession: previousSelected,
            queue: null,
          });
          this.setLocal({ ...this.state.local, selected: null });
        } else {
          const loaded = this.state.events[selection.id];
          if (!loaded?.loaded) {
            await this.loadSession(selection.id);
          } else {
            await this.fillGap(selection.id, loaded.lastSeq);
          }
          await this.refreshQueue(selection.id);
        }
      }
      await this.subscribeToFleet();
    } catch (error) {
      this.setState({ connection: "offline", connectError: asWireError(error) });
    } finally {
      this.resyncing = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Selection and history                                             */
  /* ---------------------------------------------------------------- */

  selectSession(sessionId: string): void {
    const session = this.state.sessions[sessionId];
    if (!session) return;
    if (
      this.state.selection?.id === session.id &&
      this.state.selection.createdAt === session.createdAt
    ) {
      if (!this.state.events[sessionId]?.loaded) void this.loadSession(sessionId);
      return;
    }
    const selection = { id: session.id, createdAt: session.createdAt };
    const seen = this.state.local.lastSeen[sessionLocalKey(session)] ?? 0;
    this.setState({
      selection,
      removed: false,
      removedSession: null,
      focus: null,
      queue: this.state.queue?.session.id === session.id ? this.state.queue : null,
      ...(seen === 0
        ? { followTail: { ...this.state.followTail, [session.id]: true } }
        : {}),
    });
    this.setLocal({ ...this.state.local, selected: selection }, true);
    void this.afterSelection(session);
  }

  private async afterSelection(session: SessionView): Promise<void> {
    const loaded = this.state.events[session.id];
    if (!loaded?.loaded) {
      await this.loadSession(session.id);
    } else if (loaded.lastSeq < session.lastSeq) {
      await this.fillGap(session.id, loaded.lastSeq);
    }
    await this.refreshQueue(session.id);
    await this.subscribeToFleet();
  }

  backToFleet(): void {
    this.setState({
      selection: null,
      removed: false,
      removedSession: null,
      queue: null,
      focus: null,
    });
    this.setLocal({ ...this.state.local, selected: null }, true);
    void this.subscribeToFleet();
  }

  async loadSession(sessionId: string): Promise<void> {
    const transport = this.transport;
    const session = this.state.sessions[sessionId];
    if (!transport || !session) return;
    const current = this.state.events[sessionId];
    if (current?.loading) return;
    const token = (this.loadTokens.get(sessionId) ?? 0) + 1;
    this.loadTokens.set(sessionId, token);
    this.patchSessionEvents(sessionId, { loading: true });

    try {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        limit: 100,
      });
      if (this.loadTokens.get(sessionId) !== token) return;
      this.applySession(result.session);
      const notice = latestNotice(result.events);
      const next: SessionEventsState = {
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
      this.patchSessionEvents(sessionId, next);
      this.markReplayBoundary(sessionId, result.events);
      if (notice) this.setNotice(result.session, notice);
      if (this.state.selection?.id === sessionId) await this.refreshQueue(sessionId);
    } catch (error) {
      this.patchSessionEvents(sessionId, { loading: false });
      this.addToast({
        tone: "danger",
        title: "Could not load the transcript",
        text: asWireError(error).message,
      });
    }
  }

  async loadOlder(sessionId: string): Promise<void> {
    const transport = this.transport;
    const current = this.state.events[sessionId];
    if (!transport || !current?.loaded || current.loadingOlder || !current.nextBefore) {
      return;
    }
    this.patchSessionEvents(sessionId, { loadingOlder: true });
    try {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        before: current.nextBefore,
        limit: 100,
      });
      const merged = mergeEvents(current.events, result.events, 10_000);
      const viewCapped = current.viewCapped || merged.dropped > 0;
      this.patchSessionEvents(sessionId, {
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
      });
    } catch (error) {
      this.patchSessionEvents(sessionId, { loadingOlder: false });
      this.addToast({
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
    const transport = this.transport;
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

  private async fillGap(sessionId: string, since: number): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    let cursor = since;
    try {
      for (let page = 0; page < 10; page += 1) {
        const result = await transport.request<ReadResult>("sessions.read", {
          sessionId,
          since: cursor,
          limit: 200,
        });
        this.applySession(result.session);
        this.applyReadAppend(sessionId, result);
        if (!result.hasMore) return;
        const next = result.nextSeq;
        if (next <= cursor) return;
        cursor = next;
      }
    } catch {
      // The subscription will retry; do not replace history with a guess.
    }
  }

  private applyReadAppend(sessionId: string, result: ReadResult): void {
    const current = this.state.events[sessionId];
    const nextCursor = result.hasMore ? result.nextSeq : result.lastSeq;
    if (!current?.loaded) {
      this.patchSessionEvents(sessionId, {
        events: result.events,
        earliestRetainedSeq: result.earliestRetainedSeq,
        lastSeq: nextCursor,
        nextBefore: result.nextBefore,
        hasMoreOlder: result.nextBefore !== null,
        truncated: result.truncated,
        loaded: true,
        loading: false,
        gap: null,
      });
    } else {
      const appended = appendEvents(current.events, result.events, current.lastSeq);
      const gap = gapFor(current, result.events, result.truncated);
      const nextLastSeq = Math.max(current.lastSeq, nextCursor);
      this.patchSessionEvents(sessionId, {
        events: appended.events,
        lastSeq: nextLastSeq,
        earliestRetainedSeq: result.truncated
          ? result.earliestRetainedSeq
          : current.earliestRetainedSeq,
        truncated: current.truncated || result.truncated,
        gap,
      });
      if (
        appended.added > 0 &&
        this.state.selection?.id === sessionId &&
        this.state.followTail[sessionId]
      ) {
        this.markSeen(sessionId, nextLastSeq);
      }
    }
    this.markReplayBoundary(sessionId, result.events);
    const notice = latestNotice(result.events);
    if (notice) this.setNotice(result.session, notice);
  }

  private patchSessionEvents(
    sessionId: string,
    patch: Partial<SessionEventsState>,
  ): void {
    const current = this.state.events[sessionId] ?? EMPTY_EVENTS;
    this.setState({
      events: {
        ...this.state.events,
        [sessionId]: { ...current, ...patch },
      },
    });
  }

  async catchUp(sessionId: string): Promise<void> {
    const current = this.state.events[sessionId];
    const session = this.state.sessions[sessionId];
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
    const current = this.state.events[sessionId];
    if (!current?.loaded) await this.loadSession(sessionId);
    const loaded = this.state.events[sessionId];
    if (loaded?.loaded && !loaded.events.some((event) => event.seq === seq)) {
      const transport = this.transport;
      if (transport) {
        try {
          const result = await transport.request<ReadResult>("sessions.read", {
            sessionId,
            before: seq + 1,
            limit: 50,
          });
          const merged = mergeEvents(loaded.events, result.events);
          this.patchSessionEvents(sessionId, {
            events: merged.events,
            nextBefore: result.nextBefore ?? loaded.nextBefore,
            hasMoreOlder: true,
          });
        } catch {
          // The event may have been evicted; the transcript will show the gap.
        }
      }
    }
    this.setState({ focus: { sessionId, seq } });
  }

  clearFocus(): void {
    this.setState({ focus: null });
  }

  /**
   * Restored history is not new activity. A `session.resumed`/`session.forked`
   * event closes the replay block, so moving the read marker to it keeps the
   * fleet badge honest without hiding later live events.
   */
  private markReplayBoundary(
    sessionId: string,
    events: readonly EventView[],
  ): void {
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
    const session = this.state.sessions[sessionId];
    if (!session || !Number.isFinite(seq)) return;
    const key = sessionLocalKey(session);
    const current = this.state.local.lastSeen[key] ?? 0;
    if (seq <= current) return;
    this.setLocal({
      ...this.state.local,
      lastSeen: { ...this.state.local.lastSeen, [key]: seq },
    });
  }

  setFollowTail(sessionId: string, value: boolean): void {
    if ((this.state.followTail[sessionId] ?? false) === value) {
      if (value) {
        const session = this.state.sessions[sessionId];
        if (session) this.markSeen(sessionId, session.lastSeq);
      }
      return;
    }
    const followTail = { ...this.state.followTail, [sessionId]: value };
    this.setState({ followTail });
    if (value) {
      const session = this.state.sessions[sessionId];
      if (session) this.markSeen(sessionId, session.lastSeq);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Notifications from the supervisor                                 */
  /* ---------------------------------------------------------------- */

  private handleNotification(frame: NotificationFrame): void {
    this.notificationQueue.push(frame);
    if (this.notificationTimer || this.batchDepth > 0) return;
    this.notificationTimer = setTimeout(() => this.flushNotifications(), 50);
  }

  private clearNotificationQueue(): void {
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = null;
    this.notificationQueue = [];
  }

  private flushNotifications(): void {
    this.notificationTimer = null;
    const frames = this.notificationQueue;
    this.notificationQueue = [];
    if (frames.length === 0) return;
    this.batchDepth += 1;
    try {
      for (const frame of frames) this.applyNotification(frame);
    } finally {
      this.batchDepth -= 1;
      if (this.batchDirty) {
        this.batchDirty = false;
        this.notifyListeners();
      }
    }
    if (this.notificationQueue.length > 0 && !this.notificationTimer) {
      this.notificationTimer = setTimeout(() => this.flushNotifications(), 50);
    }
  }

  private applyNotification(frame: NotificationFrame): void {
    if (frame.kind === "session") {
      this.applySessions([frame.session]);
      return;
    }
    if (frame.kind === "session.removed") {
      this.handleRemoved(frame.sessionId);
      return;
    }
    if (this.state.removedIds[frame.sessionId]) return;

    const current = this.state.events[frame.sessionId] ?? EMPTY_EVENTS;
    const first = frame.events[0];
    const gap = gapFor(current, frame.events, frame.truncated);
    const appended = appendEvents(current.events, frame.events, current.lastSeq);
    const lastSeq = Math.max(
      current.lastSeq,
      frame.cursor,
      frame.events[frame.events.length - 1]?.seq ?? 0,
    );
    this.patchSessionEvents(frame.sessionId, {
      events: appended.events,
      lastSeq,
      earliestRetainedSeq: frame.truncated
        ? (first?.seq ?? current.earliestRetainedSeq)
        : current.earliestRetainedSeq,
      truncated: current.truncated || frame.truncated,
      gap,
      loaded: current.loaded,
    });
    if (
      appended.added > 0 &&
      this.state.selection?.id === frame.sessionId &&
      this.state.followTail[frame.sessionId]
    ) {
      this.markSeen(frame.sessionId, lastSeq);
    }
    this.markReplayBoundary(frame.sessionId, frame.events);
    const notice = latestNotice(frame.events);
    const session = this.state.sessions[frame.sessionId];
    if (notice && session) this.setNotice(session, notice);
    this.setState({ lastUpdatedAt: nowIso() });
  }

  private handleRemoved(sessionId: string): void {
    const selected = this.state.selection?.id === sessionId;
    const removedSession = this.state.sessions[sessionId] ?? this.state.removedSession;
    const sessions = { ...this.state.sessions };
    delete sessions[sessionId];
    const removedIds = { ...this.state.removedIds, [sessionId]: true as const };
    if (selected) {
      this.setState({
        sessions,
        removedIds,
        removed: true,
        removedSession,
        queue: null,
      });
      this.addToast({
        tone: "info",
        title: "Session removed",
        text: `#${sessionId} is no longer in this instance. The loaded transcript is a local snapshot, not live.`,
      });
      void this.subscribeToFleet();
    } else {
      const events = { ...this.state.events };
      delete events[sessionId];
      this.setState({ sessions, removedIds, events });
    }
  }

  private setNotice(session: SessionView, notice: NoticeRecord): void {
    const key = sessionLocalKey(session);
    if (this.state.notices[key]?.seq === notice.seq) return;
    this.setState({
      notices: { ...this.state.notices, [key]: notice },
    });
  }

  private async probeNotice(session: SessionView): Promise<void> {
    if (session.lastEvent?.type !== "notice") return;
    if (this.state.events[session.id]?.events.length) return;
    const key = sessionLocalKey(session);
    if (this.state.notices[key]?.seq === session.lastSeq) return;
    if (this.noticeProbes.get(session.id) === session.lastSeq) return;
    this.noticeProbes.set(session.id, session.lastSeq);
    const transport = this.transport;
    if (!transport) return;
    try {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId: session.id,
        before: session.lastSeq + 1,
        limit: 1,
      });
      const notice = latestNotice(result.events);
      if (notice) this.setNotice(result.session, notice);
    } catch {
      // The fleet row keeps its lastEvent; no invented severity.
    }
  }

  /* ---------------------------------------------------------------- */
  /* Queue                                                             */
  /* ---------------------------------------------------------------- */

  private maybeRefreshQueue(): void {
    const selection = this.state.selection;
    if (!selection) return;
    const existing = this.queueTimers.get(selection.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.queueTimers.delete(selection.id);
      void this.refreshQueue(selection.id);
    }, 120);
    this.queueTimers.set(selection.id, timer);
  }

  async refreshQueue(sessionId: string): Promise<void> {
    const transport = this.transport;
    if (!transport || this.state.selection?.id !== sessionId) return;
    this.setState({ queueLoading: true });
    try {
      const queue = await transport.request<QueueResult>("sessions.queue", {
        sessionId,
      });
      if (this.state.selection?.id === sessionId) {
        this.applySession(queue.session);
        this.setState({ queue, queueLoading: false });
      }
    } catch {
      if (this.state.selection?.id === sessionId) {
        this.setState({ queueLoading: false });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Operator actions                                                  */
  /* ---------------------------------------------------------------- */

  setDraft(text: string): void {
    const session = selectedSession(this.state);
    if (!session) return;
    const key = sessionLocalKey(session);
    const drafts = { ...this.state.local.drafts };
    if (text.length === 0) delete drafts[key];
    else drafts[key] = { text, updatedAt: Date.now() };
    this.setLocal({ ...this.state.local, drafts });
  }

  async sendPrompt(
    text: string,
    options: { steer?: boolean } = {},
  ): Promise<SendResult | null> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return null;
    if (!text.trim()) return null;
    const key = "send";
    if (this.state.pending[key]) return null;
    this.setPending(key, true);
    this.setActionError(`send:${session.id}`, null);

    const capabilities = this.state.instance?.capabilities ?? [];
    const attempt = this.sendAttempts.get(session.id);
    const reuse = attempt && attempt.text === text ? attempt : null;
    const idempotencyKey = hasCapability(capabilities, CAPABILITIES.sendIdempotency)
      ? reuse?.key || newId("send")
      : undefined;
    const messageId = hasCapability(capabilities, CAPABILITIES.sendMessageId)
      ? reuse?.messageId || newId("msg")
      : undefined;

    this.sendAttempts.set(session.id, {
      key: idempotencyKey ?? "",
      messageId: messageId ?? "",
      text,
    });

    try {
      const result = await transport.request<SendResult>("sessions.send", {
        sessionId: session.id,
        text,
        ...(options.steer ? { steer: true } : {}),
        ...(messageId ? { messageId } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      this.applySession(result.session);
      this.sendAttempts.delete(session.id);
      const drafts = { ...this.state.local.drafts };
      delete drafts[sessionLocalKey(session)];
      this.setLocal({ ...this.state.local, drafts });
      this.addToast({
        tone: "ok",
        title: sendOutcomeTitle(result, session),
        text: result.steered
          ? "It was injected into the running turn."
          : result.queued
            ? "It runs after the current turn. The queue snapshot shows its position."
            : undefined,
      });
      void this.refreshQueue(session.id);
      return result;
    } catch (error) {
      const wire = asWireError(error);
      this.setActionError(`send:${session.id}`, wire.message);
      this.addToast({
        tone: "danger",
        title: "Prompt not accepted",
        text: `${wire.message} The draft is preserved; retry uses the same key.`,
      });
      if (wire.code === "session_closed" || wire.code === "not_found") {
        void this.refreshSession(session.id);
      }
      return null;
    } finally {
      this.setPending(key, false);
    }
  }

  /**
   * Answer one pending provider request as the operator. The dashboard is an
   * operator client: it never sends a caller session id, and the answer is
   * always one of the provider's own options for that request.
   */
  async permit(requestId: string | undefined, optionId: string): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    const permission =
      requestId !== undefined
        ? session.pendingPermissions.find((item) => item.requestId === requestId)
        : session.pendingPermissions.length === 1
          ? session.pendingPermissions[0]
          : undefined;
    if (!permission) return;
    const key = `permit:${permission.requestId}`;
    if (this.state.pending[key]) return;
    this.setPending(key, true);
    const optionName =
      permission.options.find((option) => option.optionId === optionId)?.name ??
      optionId;
    try {
      const result = await transport.request<PermitResult>(
        "sessions.permit",
        {
          sessionId: session.id,
          requestId: permission.requestId,
          optionId,
        } satisfies PermitParams,
      );
      this.applySession(result.session);
      const remaining = result.session.pendingPermissions.length;
      this.addToast({
        tone: "ok",
        title: `Permission answered · ${optionName}`,
        text:
          remaining > 0
            ? `${remaining} request${remaining === 1 ? "" : "s"} still queued.`
            : "The supervisor confirmed the answer.",
      });
    } catch (error) {
      const wire = asWireError(error);
      this.addToast({
        tone: "danger",
        title: "Permission was not answered",
        text: wire.message,
      });
      if (wire.code === "no_pending_permission" || wire.code === "session_closed") {
        await this.refreshSession(session.id);
      }
    } finally {
      this.setPending(key, false);
    }
  }

  async cancel(keepQueue: boolean): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    if (this.state.pending.cancel) return;
    this.setPending("cancel", true);
    try {
      const result = await transport.request<CancelResult>(
        "sessions.cancel",
        { sessionId: session.id, keepQueue },
      );
      this.applySession(result.session);
      this.addToast({
        tone: "ok",
        title: keepQueue ? "Turn stopped · queue kept" : "Turn stopped",
        text:
          result.discarded > 0
            ? `${result.discarded} queued prompt${result.discarded === 1 ? "" : "s"} discarded.`
            : keepQueue
              ? "The queued prompts will run after this turn ends."
              : "The session remains alive and can run another turn.",
      });
      void this.refreshQueue(session.id);
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Stop failed",
        text: asWireError(error).message,
      });
    } finally {
      this.setPending("cancel", false);
    }
  }

  async close(force: boolean): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    if (this.state.pending.close) return;
    this.setPending("close", true);
    try {
      const result = await transport.request<CloseResult>(
        "sessions.close",
        { sessionId: session.id, force },
      );
      this.applySession(result.session);
      this.addToast({
        tone: "ok",
        title: result.wasTerminal
          ? "Session was already terminal"
          : `Closed #${result.session.id}`,
        text: result.wasTerminal
          ? "No change was made by this action."
          : "It remains readable for the retention period. The event log is not permanent.",
      });
      void this.refreshQueue(session.id);
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Close failed",
        text: asWireError(error).message,
      });
    } finally {
      this.setPending("close", false);
    }
  }

  async closeSubtree(): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport || this.state.pending.close) return;
    const descendants = descendantsOf(session.id, Object.values(this.state.sessions));
    const targets = [...descendants, session].sort((a, b) => b.depth - a.depth);
    this.setPending("close", true);
    let closed = 0;
    const errors: string[] = [];
    for (const target of targets) {
      try {
        const result = await transport.request<CloseResult>(
          "sessions.close",
          { sessionId: target.id },
        );
        this.applySession(result.session);
        if (!result.wasTerminal) closed += 1;
      } catch (error) {
        errors.push(`${target.id}: ${asWireError(error).message}`);
      }
    }
    this.setPending("close", false);
    this.addToast({
      tone: errors.length > 0 ? "danger" : "ok",
      title: `Closed ${closed} of ${targets.length} sessions`,
      text:
        errors.length > 0
          ? `${errors.length} failed. ${errors[0]}`
          : "Descendants were closed deepest-first.",
    });
    void this.refreshQueue(session.id);
  }

  async forget(): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    if (this.state.pending.forget) return;
    this.setPending("forget", true);
    try {
      await transport.request("sessions.forget", { sessionId: session.id });
      const sessions = { ...this.state.sessions };
      delete sessions[session.id];
      const events = { ...this.state.events };
      delete events[session.id];
      this.setState({
        sessions,
        events,
        selection: null,
        removed: false,
        removedSession: null,
        queue: null,
      });
      this.setLocal({ ...this.state.local, selected: null });
      this.addToast({
        tone: "ok",
        title: "Session forgotten",
        text: "The retained event log was discarded. Drafts stay local and copyable.",
      });
      void this.subscribeToFleet();
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Forget failed",
        text: asWireError(error).message,
      });
    } finally {
      this.setPending("forget", false);
    }
  }

  async rename(name: string): Promise<boolean> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return false;
    if (this.state.pending.rename) return false;
    this.setPending("rename", true);
    try {
      const result = await transport.request<SessionResult>(
        "sessions.rename",
        { sessionId: session.id, name: name.trim() ? name.trim() : null },
      );
      this.applySession(result.session);
      this.addToast({
        tone: "ok",
        title: result.session.name
          ? `Renamed to ${result.session.name}`
          : "Name cleared",
        text: `The handle #${result.session.id} did not change.`,
      });
      return true;
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Rename failed",
        text: asWireError(error).message,
      });
      return false;
    } finally {
      this.setPending("rename", false);
    }
  }

  async setMode(modeId: string): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    if (this.state.pending.mode) return;
    this.setPending("mode", true);
    try {
      const result = await transport.request<SessionResult>(
        "sessions.set_mode",
        { sessionId: session.id, modeId },
      );
      this.applySession(result.session);
      const mode = result.session.modes?.availableModes.find((item) => item.id === modeId);
      this.addToast({
        tone: "ok",
        title: `Provider mode · ${mode?.name ?? modeId}`,
      });
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Mode change failed",
        text: asWireError(error).message,
      });
      await this.refreshSession(session.id);
    } finally {
      this.setPending("mode", false);
    }
  }

  async setConfigOption(configId: string, value: string | boolean): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    const key = `config:${configId}`;
    if (this.state.pending[key]) return;
    this.setPending(key, true);
    try {
      const result = await transport.request<SessionResult>(
        "sessions.set_config_option",
        { sessionId: session.id, configId, value },
      );
      this.applySession(result.session);
      const option = result.session.configOptions?.find((item) => item.id === configId);
      this.addToast({
        tone: "ok",
        title: `Set ${option?.name ?? configId}`,
        text: String(option?.currentValue ?? value),
      });
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Option change failed",
        text: asWireError(error).message,
      });
      await this.refreshSession(session.id);
    } finally {
      this.setPending(key, false);
    }
  }

  async dropQueued(messageId: string): Promise<void> {
    const session = selectedSession(this.state);
    const transport = this.transport;
    if (!session || !transport) return;
    if (this.state.pending["queue-drop"]) return;
    this.setPending("queue-drop", true);
    try {
      const result = await transport.request<QueueDropResult>("sessions.queue_drop", {
        sessionId: session.id,
        messageId,
      });
      this.applySession(result.session);
      this.addToast({
        tone: "info",
        title: "Queued prompt dropped",
        text: `${result.dropped.textPreview} · it will not run.`,
      });
      await this.refreshQueue(session.id);
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Drop failed",
        text: asWireError(error).message,
      });
      await this.refreshQueue(session.id);
    } finally {
      this.setPending("queue-drop", false);
    }
  }

  async spawnSession(params: SpawnParams): Promise<SpawnResult> {
    const transport = this.transport;
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    if (this.state.pending.spawn) {
      throw {
        code: "bad_request",
        message: "A spawn is already in progress.",
      } satisfies WireError;
    }
    this.setPending("spawn", true);
    try {
      const result = await transport.request<SpawnResult>("sessions.spawn", params);
      this.applySession(result.session);
      if (params.backend) {
        this.setLocal({ ...this.state.local, lastBackend: params.backend });
      }
      if (params.cwd) {
        this.setLocal({ ...this.state.local, lastCwd: params.cwd });
      }
      const session = result.session;
      const title = result.duplicate
        ? result.resumed
          ? "Provider session already attached"
          : "Existing session reused"
        : result.resumed
          ? "Provider session resumed"
          : result.forked
            ? "Provider session forked"
            : "Session spawned";
      this.addToast({
        tone: result.duplicate ? "info" : "ok",
        title,
        text: `${session.id} · ${session.backend}${session.name ? ` · ${session.name}` : ""}`,
      });
      this.setState({
        sessions: { ...this.state.sessions, [session.id]: session },
        selection: { id: session.id, createdAt: session.createdAt },
        removed: false,
        removedSession: null,
        queue: null,
        followTail: { ...this.state.followTail, [session.id]: true },
      });
      this.setLocal({
        ...this.state.local,
        selected: { id: session.id, createdAt: session.createdAt },
      });
      await this.afterSelection(session);
      return result;
    } finally {
      this.setPending("spawn", false);
    }
  }

  async listBackends(cwd?: string): Promise<BackendsListResult> {
    const transport = this.transport;
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    return transport.request<BackendsListResult>(
      "backends.list",
      cwd ? { cwd } : {},
    );
  }

  /**
   * Read the provider's own session catalog. This is an on-demand read: it
   * starts an adapter and creates no HLAO session. Call it when the operator
   * opens the provider-session surface, not on every render.
   */
  async listProviderSessions(
    backend: string,
    cwd?: string,
    cursor?: string,
  ): Promise<ProviderSessionsResult> {
    const transport = this.transport;
    if (!transport) {
      throw {
        code: "bridge_unavailable",
        message: "Not connected.",
      } satisfies WireError;
    }
    return transport.request<ProviderSessionsResult>("backends.sessions", {
      backend,
      ...(cwd ? { cwd } : {}),
      ...(cursor ? { cursor } : {}),
    });
  }

  async listDirectories(path?: string): Promise<DirectoryListing> {
    const transport = this.transport;
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    return transport.request<DirectoryListing>("dashboard.fs.list", {
      path: path ?? null,
    });
  }

  async reloadConfig(): Promise<void> {
    const transport = this.transport;
    if (!transport || this.state.pending.reload) return;
    this.setPending("reload", true);
    try {
      const result = await transport.request<ReloadResult>("supervisor.reload", {});
      if (this.state.instance) {
        this.setState({
          instance: {
            ...this.state.instance,
            configHash: result.configHash,
            configError: result.configError ?? undefined,
          },
        });
      }
      this.addToast({
        tone: result.configError ? "danger" : "ok",
        title: result.configError ? "Config reload failed" : "Config reloaded",
        text: result.configError ?? "Future spawns use the new file.",
      });
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Reload failed",
        text: asWireError(error).message,
      });
    } finally {
      this.setPending("reload", false);
    }
  }

  async shutdownSupervisor(force: boolean): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    if (this.state.pending.shutdown) return;
    this.setPending("shutdown", true);
    try {
      const result = await transport.request<ShutdownResult>("supervisor.shutdown", { force });
      this.stopPolling();
      this.disposeTransport();
      this.setState({
        phase: "setup",
        connection: "offline",
        instance: null,
        sessions: {},
        events: {},
        notices: {},
        selection: null,
        queue: null,
        removed: false,
        connectError: {
          code: "supervisor_unavailable",
          message: `The supervisor shut down: ${result.sessionsClosed} sessions closed, ${result.retainedDiscarded} retained histories discarded.`,
        },
      });
      this.addToast({
        tone: "info",
        title: "Supervisor shut down",
        text: `${result.sessionsClosed} sessions closed · ${result.retainedDiscarded} retained histories discarded.`,
      });
    } catch (error) {
      this.addToast({
        tone: "danger",
        title: "Shutdown failed",
        text: asWireError(error).message,
      });
    } finally {
      this.setPending("shutdown", false);
    }
  }

  private async refreshSession(sessionId: string): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    try {
      const result = await transport.request<SessionResult>(
        "sessions.get",
        { sessionId },
      );
      this.applySession(result.session);
    } catch {
      // The next notification or refresh will settle it.
    }
  }

  acknowledgeFailure(sessionId: string): void {
    const session = this.state.sessions[sessionId];
    if (!session || session.status !== "failed") return;
    const key = sessionLocalKey(session);
    this.setLocal({
      ...this.state.local,
      acknowledged: {
        ...this.state.local.acknowledged,
        [key]: session.endedAt ?? session.lastActivityAt,
      },
    });
    this.addToast({
      tone: "info",
      title: "Failure acknowledged locally",
      text: "The session state is unchanged; only this dashboard's attention list is affected.",
    });
  }

  dismissNotice(sessionId: string): void {
    const session = this.state.sessions[sessionId];
    if (!session) return;
    const key = sessionLocalKey(session);
    const notice = this.state.notices[key];
    if (!notice) return;
    this.setLocal({
      ...this.state.local,
      dismissedNotices: { ...this.state.local.dismissedNotices, [key]: notice.seq },
    });
    this.addToast({
      tone: "info",
      title: "Notice dismissed locally",
      text: "It remains in the transcript; no server state changed.",
    });
  }

  /**
   * Hide the eviction banner for the boundary currently shown. A later read
   * that evicts more history gets a new boundary, so the banner returns.
   */
  dismissEviction(sessionId: string): void {
    const session = this.state.sessions[sessionId];
    const boundary = this.state.events[sessionId]?.earliestRetainedSeq;
    if (!session || !boundary) return;
    const key = sessionLocalKey(session);
    this.setLocal({
      ...this.state.local,
      dismissedEvictions: {
        ...this.state.local.dismissedEvictions,
        [key]: boundary,
      },
    });
  }

  setFilters(patch: Partial<InstanceLocalState["filters"]>): void {
    this.setLocal({
      ...this.state.local,
      filters: { ...this.state.local.filters, ...patch },
    });
  }

  setTheme(theme: Theme): void {
    this.setState({ theme });
    saveTheme(theme);
    this.schedulePersist();
  }

  setNotifications(value: boolean): void {
    this.setState({ notifications: value });
    this.schedulePersist();
  }

  markIntroSeen(): void {
    this.setState({ introSeen: true });
    this.schedulePersist();
  }

  dismissCrashNotice(): void {
    this.setState({ crashNotice: null });
  }

  dismissRestartNotice(): void {
    this.setState({ restartNotice: null });
  }

  clearLocalState(): void {
    const fresh = emptyInstanceState();
    this.setLocal(fresh, true);
    this.setState({
      selection: null,
      removed: false,
      removedSession: null,
      queue: null,
      focus: null,
      followTail: {},
    });
    this.addToast({
      tone: "info",
      title: "Local dashboard state cleared",
      text: "Drafts, read markers, acknowledgements, filters, and selection were removed. The supervisor was not changed.",
    });
    void this.subscribeToFleet();
  }

  /* ---------------------------------------------------------------- */
  /* Search and export                                                 */
  /* ---------------------------------------------------------------- */

  async search(options: SearchOptions): Promise<SearchOutcome> {
    const transport = this.transport;
    const asOf = nowIso();
    const token = ++this.searchToken;
    const outcome: SearchOutcome = {
      hits: [],
      scannedSessions: 0,
      totalSessions: 0,
      capped: false,
      truncated: false,
      asOf,
      cancelled: false,
      errors: [],
    };
    if (!transport || !options.query.trim()) return outcome;

    let sessions: SessionView[];
    if (options.scope === "session") {
      const session = selectedSession(this.state);
      sessions = session ? [session] : [];
    } else {
      try {
        const list = await transport.request<{ sessions: SessionView[] }>(
          "sessions.list",
          { includeClosed: options.includeClosed },
        );
        sessions = list.sessions;
      } catch (error) {
        outcome.errors.push(asWireError(error).message);
        sessions = Object.values(this.state.sessions).filter(
          (session) => options.includeClosed || !isTerminalStatus(session.status),
        );
      }
    }

    const maxSessions = 20;
    outcome.totalSessions = sessions.length;
    if (sessions.length > maxSessions) outcome.capped = true;
    const limit = options.scope === "session" ? 200 : 50;

    for (const session of sessions.slice(0, maxSessions)) {
      if (token !== this.searchToken) {
        outcome.cancelled = true;
        return outcome;
      }
      try {
        const result = await transport.request<ReadResult>("sessions.read", {
          sessionId: session.id,
          since: 0,
          limit,
          grep: options.query,
          ...(options.raw ? { raw: true } : {}),
          ...(options.regex ? { regex: true } : {}),
        });
        outcome.scannedSessions += 1;
        if (result.truncated) outcome.truncated = true;
        if (result.hasMore) outcome.capped = true;
        for (const event of result.events) {
          const readable = eventText(event)
            .replace(/[\u0000-\u001F\u007F]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const fallback = JSON.stringify(event.data).replace(/\s+/g, " ");
          outcome.hits.push({
            session: result.session,
            event,
            snippet: (readable || `${event.type} · ${fallback}`).slice(0, 220),
          });
        }
      } catch (error) {
        outcome.errors.push(`${session.id}: ${asWireError(error).message}`);
      }
    }
    if (token !== this.searchToken) outcome.cancelled = true;
    return outcome;
  }

  cancelSearch(): void {
    this.searchToken += 1;
  }

  async collectTranscript(
    sessionId: string,
    maxPages = 20,
    pageSize = 1000,
  ): Promise<ExportResult> {
    const transport = this.transport;
    if (!transport) throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    let events: EventView[] = [];
    let truncated = false;
    let capped = false;
    let pages = 0;
    let since = 0;
    while (pages < maxPages) {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        since,
        limit: pageSize,
        raw: true,
      });
      pages += 1;
      truncated = truncated || result.truncated;
      events = mergeEvents(events, result.events, 100_000).events;
      if (!result.hasMore || result.nextSeq <= since) break;
      since = result.nextSeq;
      if (pages >= maxPages) capped = true;
    }
    return { events, truncated, capped, pages };
  }

  resolveTarget(token: string): TargetResolution {
    return resolveTarget(token, Object.values(this.state.sessions));
  }

  capability(capability: string): boolean {
    return canUse(this.state, capability);
  }
}

function sendOutcomeTitle(result: SendResult, session: SessionView): string {
  if (result.duplicate) return "Prompt was already accepted";
  if (result.steered) return `Prompt steered into turn ${result.turn ?? session.turn}`;
  if (result.queued) return "Prompt queued";
  return `Prompt sent to turn ${result.turn ?? session.turn + 1}`;
}

export const store = new DashboardStore();
