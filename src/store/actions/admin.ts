import type { ReloadResult, ShutdownResult } from "../../wire/protocol";
import { asWireError } from "../../wire/protocol";
import { sessionLocalKey } from "../model";
import { emptyInstanceState, saveTheme, type InstanceLocalState } from "../persistence";
import type { Theme } from "../persistence";
import type { StoreActionsHost } from "../actionsHost";

/**
 * Connection, instance, and purely local operator state. Local actions never
 * claim supervisor state; the UI copy around them says the same.
 */
export class AdminActions {
  constructor(private readonly host: StoreActionsHost) {}

  async reloadConfig(): Promise<void> {
    const transport = this.host.getTransport();
    const state = this.host.getState();
    if (!transport || state.pending.reload) return;
    this.host.setPending("reload", true);
    try {
      const result = await transport.request<ReloadResult>("supervisor.reload", {});
      const current = this.host.getState();
      if (current.instance) {
        this.host.setState({
          instance: {
            ...current.instance,
            configHash: result.configHash,
            configError: result.configError ?? undefined,
          },
        });
      }
      this.host.addToast({
        tone: result.configError ? "danger" : "ok",
        title: result.configError ? "Config reload failed" : "Config reloaded",
        text: result.configError ?? "Future spawns use the new file.",
      });
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Reload failed",
        text: asWireError(error).message,
      });
    } finally {
      this.host.setPending("reload", false);
    }
  }

  async shutdownSupervisor(force: boolean): Promise<void> {
    const transport = this.host.getTransport();
    if (!transport) return;
    if (this.host.getState().pending.shutdown) return;
    this.host.setPending("shutdown", true);
    try {
      const result = await transport.request<ShutdownResult>("supervisor.shutdown", { force });
      this.host.stopPolling();
      this.host.disposeTransport();
      this.host.setState({
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
      this.host.addToast({
        tone: "info",
        title: "Supervisor shut down",
        text: `${result.sessionsClosed} sessions closed · ${result.retainedDiscarded} retained histories discarded.`,
      });
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Shutdown failed",
        text: asWireError(error).message,
      });
    } finally {
      this.host.setPending("shutdown", false);
    }
  }

  acknowledgeFailure(sessionId: string): void {
    const state = this.host.getState();
    const session = state.sessions[sessionId];
    if (!session || session.status !== "failed") return;
    const key = sessionLocalKey(session);
    this.host.setLocal({
      ...state.local,
      acknowledged: {
        ...state.local.acknowledged,
        [key]: session.endedAt ?? session.lastActivityAt,
      },
    });
    this.host.addToast({
      tone: "info",
      title: "Failure acknowledged locally",
      text: "The session state is unchanged; only this dashboard's attention list is affected.",
    });
  }

  dismissNotice(sessionId: string): void {
    const state = this.host.getState();
    const session = state.sessions[sessionId];
    if (!session) return;
    const key = sessionLocalKey(session);
    const notice = state.notices[key];
    if (!notice) return;
    this.host.setLocal({
      ...state.local,
      dismissedNotices: { ...state.local.dismissedNotices, [key]: notice.seq },
    });
    this.host.addToast({
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
    const state = this.host.getState();
    const session = state.sessions[sessionId];
    const boundary = state.events[sessionId]?.earliestRetainedSeq;
    if (!session || !boundary) return;
    const key = sessionLocalKey(session);
    this.host.setLocal({
      ...state.local,
      dismissedEvictions: {
        ...state.local.dismissedEvictions,
        [key]: boundary,
      },
    });
  }

  setFilters(patch: Partial<InstanceLocalState["filters"]>): void {
    const state = this.host.getState();
    this.host.setLocal({
      ...state.local,
      filters: { ...state.local.filters, ...patch },
    });
  }

  setTheme(theme: Theme): void {
    this.host.setState({ theme });
    saveTheme(theme);
    this.host.schedulePersist();
  }

  setNotifications(value: boolean): void {
    this.host.setState({ notifications: value });
    this.host.schedulePersist();
  }

  markIntroSeen(): void {
    this.host.setState({ introSeen: true });
    this.host.schedulePersist();
  }

  dismissCrashNotice(): void {
    this.host.setState({ crashNotice: null });
  }

  dismissRestartNotice(): void {
    this.host.setState({ restartNotice: null });
  }

  clearLocalState(): void {
    this.host.setLocal(emptyInstanceState(), true);
    this.host.setState({
      selection: null,
      removed: false,
      removedSession: null,
      queue: null,
      focus: null,
      followTail: {},
    });
    this.host.addToast({
      tone: "info",
      title: "Local dashboard state cleared",
      text: "Drafts, read markers, acknowledgements, filters, and selection were removed. The supervisor was not changed.",
    });
    void this.host.subscribeToFleet();
  }
}
