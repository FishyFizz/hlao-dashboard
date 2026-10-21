import type { SessionView } from "../wire/protocol";
import type { SupervisorTransport } from "../wire/transport";
import type { InstanceLocalState } from "./persistence";
import type { DashboardState, Toast } from "./types";

/**
 * The narrow surface the action modules may use. Actions never reach into the
 * store's private fields; every state mutation and side effect goes through
 * this host so the boundary stays explicit and testable.
 */
export type StoreActionsHost = {
  getState(): DashboardState;
  getTransport(): SupervisorTransport | null;
  setState(patch: Partial<DashboardState>): void;
  setPending(key: string, value: boolean): void;
  setActionError(key: string, message: string | null): void;
  setLocal(local: InstanceLocalState, immediate?: boolean): void;
  schedulePersist(): void;
  addToast(toast: Omit<Toast, "id">): string;
  applySession(view: SessionView): void;
  applySessions(views: readonly SessionView[]): void;
  refreshQueue(sessionId: string): Promise<void>;
  refreshRecovery(): Promise<void>;
  refreshSession(sessionId: string): Promise<void>;
  afterSelection(session: SessionView): Promise<void>;
  subscribeToFleet(): Promise<void>;
  stopPolling(): void;
  disposeTransport(): void;
};
