import { DemoTransport } from "../demo/demoSupervisor";
import {
  isTerminalStatus,
  latestNotice,
  normalizeHome,
  sessionLocalKey,
  type NoticeRecord,
  type TargetResolution,
  type ToolPayload,
} from "./model";
import {
  emptyInstanceState,
  loadPersistence,
  savePersistence,
  type InstanceLocalState,
  type PersistedState,
  type Theme,
} from "./persistence";
import {
  BridgeTransport,
  signInToBridge,
  type ConnectionStatus,
  type SupervisorTransport,
  type TransportSink,
} from "../wire/transport";
import type {
  BackendsListResult,
  HelloResult,
  NotificationFrame,
  ProviderSessionsResult,
  QueueResult,
  ReadResult,
  SendResult,
  SessionView,
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
import { AdminActions } from "./actions/admin";
import { SessionActions } from "./actions/session";
import { SpawnActions } from "./actions/spawn";
import type { StoreActionsHost } from "./actionsHost";
import { stripTokenFragment } from "../app/routing";
import { appendedLiveEvents } from "./eventState";
import { HistoryController, type HistoryHost } from "./history";
import { SearchActions } from "./search";
import { canUse, selectedSession } from "./selectors";
import {
  EMPTY_EVENTS,
  type DashboardState,
  type DirectoryListing,
  type ExportResult,
  type Mode,
  type SearchOptions,
  type SearchOutcome,
  type Selection,
  type SessionEventsState,
  type Toast,
} from "./types";

export type {
  DashboardState,
  DirectoryListing,
  ExportResult,
  Gap,
  Mode,
  Phase,
  RestartNotice,
  SearchHit,
  SearchOptions,
  SearchOutcome,
  SearchScope,
  Selection,
  SessionEventsState,
  Toast,
  ToastTone,
} from "./types";
export { attentionItems, canUse, eventsFor, selectedSession } from "./selectors";
export {
  activeSessions,
  orphanedDrafts,
  recoverableReceipts,
  type OrphanDraft,
} from "./selectors";

/** Most mutations echo the full session view; the client never merges a patch. */
type SessionResult = { session: SessionView };

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
  private authAttempt = 0;
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

  /**
   * The only surface actions get. Keeping it an explicit object means action
   * modules cannot reach private fields, and each side effect has one name.
   */
  private readonly actionsHost: StoreActionsHost = {
    getState: () => this.state,
    getTransport: () => this.transport,
    setState: (patch) => this.setState(patch),
    setPending: (key, value) => this.setPending(key, value),
    setActionError: (key, message) => this.setActionError(key, message),
    setLocal: (local, immediate) => this.setLocal(local, immediate),
    schedulePersist: () => this.schedulePersist(),
    addToast: (toast) => this.addToast(toast),
    applySession: (view) => this.applySession(view),
    applySessions: (views) => this.applySessions(views),
    refreshQueue: (sessionId) => this.refreshQueue(sessionId),
    refreshRecovery: () => this.spawnActions.refreshRecovery(),
    refreshSession: (sessionId) => this.refreshSession(sessionId),
    afterSelection: (session) => this.history.afterSelection(session),
    subscribeToFleet: () => this.subscribeToFleet(),
    stopPolling: () => this.stopPolling(),
    disposeTransport: () => this.disposeTransport(),
  };
  private readonly sessionActions = new SessionActions(this.actionsHost);
  private readonly spawnActions = new SpawnActions(this.actionsHost);
  private readonly adminActions = new AdminActions(this.actionsHost);
  private readonly searchActions = new SearchActions(this.actionsHost);
  private readonly historyHost: HistoryHost = {
    getState: () => this.state,
    getTransport: () => this.transport,
    setState: (patch) => this.setState(patch),
    setLocal: (local, immediate) => this.setLocal(local, immediate),
    addToast: (toast) => this.addToast(toast),
    patchSessionEvents: (sessionId, patch) => this.patchSessionEvents(sessionId, patch),
    applySession: (view) => this.applySession(view),
    setNotice: (session, notice) => this.setNotice(session, notice),
    refreshQueue: (sessionId) => this.refreshQueue(sessionId),
    subscribeToFleet: () => this.subscribeToFleet(),
  };
  private readonly history = new HistoryController(this.historyHost);

  constructor() {
    this.persisted = loadPersistence();
    this.state = {
      phase: "boot",
      mode: null,
      connection: "connecting",
      home: "",
      instance: null,
      connectError: null,
      authError: null,
      lastUpdatedAt: null,
      fleetLoaded: false,
      recovery: [],
      recoveryLoading: false,
      recoveryError: null,
      recoveryLoadedAt: null,
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
    // Consume the one-time sign-in fragment before any await or route write.
    const token = typeof window !== "undefined" ? stripTokenFragment() : null;
    const demo =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1";
    if (demo) {
      await this.connect("demo");
      return;
    }
    if (token) {
      await this.signIn(token);
      return;
    }
    await this.connect("bridge");
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
      authError: null,
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
        if (start.error?.code === "bridge_unauthorized") {
          this.disposeTransport();
          this.setState({
            phase: "login",
            mode: "bridge",
            connection: "offline",
            home: start.home,
            instance: null,
            connectError: null,
            authError: null,
          });
          return;
        }
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

  /** Exchange a dashboard token for a cookie, then connect. */
  async signIn(rawToken: string): Promise<void> {
    const attempt = ++this.authAttempt;
    this.connectToken += 1;
    this.disposeTransport();
    const error = await signInToBridge(rawToken.trim());
    if (attempt !== this.authAttempt) return;
    if (error) {
      this.setState({
        phase: "login",
        mode: "bridge",
        connection: "offline",
        instance: null,
        connectError: null,
        authError: error,
      });
      return;
    }
    this.setState({ authError: null, connectError: null });
    await this.connect("bridge");
  }

  async signOut(): Promise<void> {
    this.authAttempt += 1;
    this.connectToken += 1;
    this.disposeTransport();
    try {
      await fetch("/api/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      // The bridge may already be gone; a reachable one clears the cookie.
    }
    this.setState({
      phase: "login",
      mode: "bridge",
      connection: "offline",
      instance: null,
      connectError: null,
      authError: null,
    });
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
      if (error?.code === "bridge_unauthorized") {
        this.connectToken += 1;
        this.disposeTransport();
        this.setState({
          phase: "login",
          mode: "bridge",
          connection: "offline",
          instance: null,
          connectError: null,
          authError: null,
        });
        return;
      }
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
          message: `This dashboard requires wire major ${WIRE_MAJOR}; the supervisor at ${home} speaks major ${hello.protocolVersion?.major ?? "unknown"}. Start a supervisor for wire major ${WIRE_MAJOR} and retry.`,
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
            recovery: [],
            recoveryLoading: false,
            recoveryError: null,
            recoveryLoadedAt: null,
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
    void this.refreshRecovery();

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
        await this.history.loadSession(selection.id);
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
    let becameTerminal = false;
    const selectedBefore = selectedSession(this.state);

    for (const view of views) {
      const current = sessions[view.id];
      if (
        current !== undefined &&
        !isTerminalStatus(current.status) &&
        isTerminalStatus(view.status)
      ) {
        becameTerminal = true;
      }
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
    if (becameTerminal) void this.refreshRecovery();
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
        void this.history.fillGap(followedId, latest?.loaded ? latest.lastSeq : 0);
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
        this.history.applyRead(selection.id, result);
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
      void this.refreshRecovery();
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
            await this.history.loadSession(selection.id);
          } else {
            await this.history.fillGap(selection.id, loaded.lastSeq);
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
  /* Selection and history (implementation in ./history)               */
  /* ---------------------------------------------------------------- */

  selectSession(sessionId: string): void {
    this.history.selectSession(sessionId);
  }

  backToFleet(): void {
    this.history.backToFleet();
  }

  async loadSession(sessionId: string): Promise<void> {
    return this.history.loadSession(sessionId);
  }

  async loadOlder(sessionId: string): Promise<void> {
    return this.history.loadOlder(sessionId);
  }

  async loadToolPayload(
    sessionId: string,
    toolCallId: string,
    fromSeq: number,
    toSeq: number,
  ): Promise<ToolPayload> {
    return this.history.loadToolPayload(sessionId, toolCallId, fromSeq, toSeq);
  }

  async catchUp(sessionId: string): Promise<void> {
    return this.history.catchUp(sessionId);
  }

  async openAtSeq(sessionId: string, seq: number): Promise<void> {
    return this.history.openAtSeq(sessionId, seq);
  }

  clearFocus(): void {
    this.history.clearFocus();
  }

  markSeen(sessionId: string, seq: number): void {
    this.history.markSeen(sessionId, seq);
  }

  setFollowTail(sessionId: string, value: boolean): void {
    this.history.setFollowTail(sessionId, value);
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
    const outcome = appendedLiveEvents(current, frame);
    this.patchSessionEvents(frame.sessionId, outcome.state);
    if (
      outcome.added > 0 &&
      this.state.selection?.id === frame.sessionId &&
      this.state.followTail[frame.sessionId]
    ) {
      this.history.markSeen(frame.sessionId, outcome.lastSeq);
    }
    this.history.markReplayBoundary(frame.sessionId, frame.events);
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
  /* Operator actions (implementations live in ./actions)              */
  /* ---------------------------------------------------------------- */

  setDraft(text: string): void {
    this.sessionActions.setDraft(text);
  }

  async sendPrompt(
    text: string,
    options: { steer?: boolean } = {},
  ): Promise<SendResult | null> {
    return this.sessionActions.sendPrompt(text, options);
  }

  async permit(requestId: string | undefined, optionId: string): Promise<void> {
    return this.sessionActions.permit(requestId, optionId);
  }

  async cancel(keepQueue: boolean): Promise<void> {
    return this.sessionActions.cancel(keepQueue);
  }

  async close(force: boolean, sessionId?: string): Promise<void> {
    return this.sessionActions.close(force, sessionId);
  }

  async closeSubtree(sessionId?: string): Promise<void> {
    return this.sessionActions.closeSubtree(sessionId);
  }

  async forget(sessionId?: string): Promise<void> {
    return this.sessionActions.forget(sessionId);
  }

  async rename(name: string, sessionId?: string): Promise<boolean> {
    return this.sessionActions.rename(name, sessionId);
  }

  async setMode(modeId: string): Promise<void> {
    return this.sessionActions.setMode(modeId);
  }

  async setConfigOption(configId: string, value: string | boolean): Promise<void> {
    return this.sessionActions.setConfigOption(configId, value);
  }

  async dropQueued(messageId: string): Promise<void> {
    return this.sessionActions.dropQueued(messageId);
  }

  async spawnSession(params: SpawnParams): Promise<SpawnResult> {
    return this.spawnActions.spawnSession(params);
  }

  async listBackends(cwd?: string): Promise<BackendsListResult> {
    return this.spawnActions.listBackends(cwd);
  }

  async listProviderSessions(
    backend: string,
    cwd?: string,
    cursor?: string,
  ): Promise<ProviderSessionsResult> {
    return this.spawnActions.listProviderSessions(backend, cwd, cursor);
  }

  async refreshRecovery(): Promise<void> {
    return this.spawnActions.refreshRecovery();
  }

  async listDirectories(path?: string): Promise<DirectoryListing> {
    return this.spawnActions.listDirectories(path);
  }

  async reloadConfig(): Promise<void> {
    return this.adminActions.reloadConfig();
  }

  async shutdownSupervisor(force: boolean): Promise<void> {
    return this.adminActions.shutdownSupervisor(force);
  }

  acknowledgeFailure(sessionId: string): void {
    this.adminActions.acknowledgeFailure(sessionId);
  }

  dismissNotice(sessionId: string): void {
    this.adminActions.dismissNotice(sessionId);
  }

  dismissEviction(sessionId: string): void {
    this.adminActions.dismissEviction(sessionId);
  }

  setFilters(patch: Partial<InstanceLocalState["filters"]>): void {
    this.adminActions.setFilters(patch);
  }

  setTheme(theme: Theme): void {
    this.adminActions.setTheme(theme);
  }

  setNotifications(value: boolean): void {
    this.adminActions.setNotifications(value);
  }

  markIntroSeen(): void {
    this.adminActions.markIntroSeen();
  }

  dismissCrashNotice(): void {
    this.adminActions.dismissCrashNotice();
  }

  dismissRestartNotice(): void {
    this.adminActions.dismissRestartNotice();
  }

  clearLocalState(): void {
    this.adminActions.clearLocalState();
  }

  async search(options: SearchOptions): Promise<SearchOutcome> {
    return this.searchActions.search(options);
  }

  cancelSearch(): void {
    this.searchActions.cancelSearch();
  }

  async collectTranscript(
    sessionId: string,
    maxPages = 20,
    pageSize = 1000,
  ): Promise<ExportResult> {
    return this.searchActions.collectTranscript(sessionId, maxPages, pageSize);
  }

  resolveTarget(token: string): TargetResolution {
    return this.searchActions.resolveTarget(token);
  }

  capability(capability: string): boolean {
    return canUse(this.state, capability);
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
}

export const store = new DashboardStore();
