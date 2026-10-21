import type {
  BackendsListResult,
  ProviderSessionsResult,
  RecoveryReceiptsResult,
  SpawnParams,
  SpawnResult,
  WireError,
} from "../../wire/protocol";
import { asWireError, CAPABILITIES } from "../../wire/protocol";
import { canUse } from "../selectors";
import type { DirectoryListing } from "../types";
import type { StoreActionsHost } from "../actionsHost";

/**
 * Spawn and discovery actions. These are reads or one-shot mutations; none of
 * them keeps a provider-to-agent mapping in the page.
 */
export class SpawnActions {
  private recoveryAgain = false;

  constructor(private readonly host: StoreActionsHost) {}

  async spawnSession(params: SpawnParams): Promise<SpawnResult> {
    const transport = this.host.getTransport();
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    if (this.host.getState().pending.spawn) {
      throw {
        code: "bad_request",
        message: "A spawn is already in progress.",
      } satisfies WireError;
    }
    this.host.setPending("spawn", true);
    try {
      const result = await transport.request<SpawnResult>("sessions.spawn", params);
      this.host.applySession(result.session);
      if (params.backend) {
        this.host.setLocal({
          ...this.host.getState().local,
          lastBackend: params.backend,
        });
      }
      if (params.cwd) {
        this.host.setLocal({ ...this.host.getState().local, lastCwd: params.cwd });
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
      this.host.addToast({
        tone: result.duplicate ? "info" : "ok",
        title,
        text: `${session.id} · ${session.backend}${session.name ? ` · ${session.name}` : ""}`,
      });
      this.host.setState({
        sessions: { ...this.host.getState().sessions, [session.id]: session },
        selection: { id: session.id, createdAt: session.createdAt },
        removed: false,
        removedSession: null,
        queue: null,
        followTail: { ...this.host.getState().followTail, [session.id]: true },
      });
      this.host.setLocal({
        ...this.host.getState().local,
        selected: { id: session.id, createdAt: session.createdAt },
      });
      await this.host.afterSelection(session);
      void this.host.refreshRecovery();
      return result;
    } finally {
      this.host.setPending("spawn", false);
    }
  }

  async listBackends(cwd?: string): Promise<BackendsListResult> {
    const transport = this.host.getTransport();
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
    const transport = this.host.getTransport();
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

  /**
   * Read historical spawn receipts for the "Recoverable" rail group. This is a
   * local ledger read in the supervisor; it starts no adapter and never claims
   * liveness. Unsupported supervisors yield an empty list rather than an error.
   */
  async refreshRecovery(): Promise<void> {
    const transport = this.host.getTransport();
    const state = this.host.getState();
    if (!transport || !canUse(state, CAPABILITIES.recoveryReceipts)) {
      this.host.setState({
        recovery: [],
        recoveryLoading: false,
        recoveryError: null,
        recoveryLoadedAt: null,
      });
      return;
    }
    if (state.recoveryLoading) {
      this.recoveryAgain = true;
      return;
    }
    this.host.setState({ recoveryLoading: true, recoveryError: null });
    try {
      const result = await transport.request<RecoveryReceiptsResult>(
        "recovery.receipts",
        {},
      );
      if (this.host.getTransport() !== transport) return;
      this.host.setState({
        recovery: result.receipts,
        recoveryLoading: false,
        recoveryLoadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (this.host.getTransport() !== transport) return;
      this.host.setState({
        recoveryLoading: false,
        recoveryError: asWireError(error).message,
      });
    } finally {
      if (this.recoveryAgain) {
        this.recoveryAgain = false;
        void this.refreshRecovery();
      }
    }
  }

  async listDirectories(path?: string): Promise<DirectoryListing> {
    const transport = this.host.getTransport();
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    return transport.request<DirectoryListing>("dashboard.fs.list", {
      path: path ?? null,
    });
  }
}
