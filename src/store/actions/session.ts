import type {
  CancelResult,
  CloseResult,
  PermitParams,
  PermitResult,
  QueueDropResult,
  SendResult,
  SessionView,
} from "../../wire/protocol";
import { asWireError, CAPABILITIES, hasCapability } from "../../wire/protocol";
import { newId } from "../../lib/id";
import { descendantsOf, sessionLocalKey } from "../model";
import { selectedSession } from "../selectors";
import type { StoreActionsHost } from "../actionsHost";

type SessionResult = { session: SessionView };

type SendAttempt = { key: string; messageId: string; text: string };

/**
 * Session-scoped operator actions. Every method acts on the selected session;
 * the supervisor stays the authority for every outcome.
 */
export class SessionActions {
  /**
   * Retry keys for the last prompt per session identity, so a failed send can
   * be retried without duplicating the message. Keyed by the full local
   * identity because a handle can be reused after a supervisor restart.
   */
  private readonly sendAttempts = new Map<string, SendAttempt>();

  constructor(private readonly host: StoreActionsHost) {}

  setDraft(text: string): void {
    const state = this.host.getState();
    const session = selectedSession(state);
    if (!session) return;
    const key = sessionLocalKey(session);
    const drafts = { ...state.local.drafts };
    if (text.length === 0) delete drafts[key];
    else drafts[key] = { text, updatedAt: Date.now() };
    this.host.setLocal({ ...state.local, drafts });
  }

  async sendPrompt(
    text: string,
    options: { steer?: boolean } = {},
  ): Promise<SendResult | null> {
    const state = this.host.getState();
    const session = selectedSession(state);
    const transport = this.host.getTransport();
    if (!session || !transport) return null;
    if (!text.trim()) return null;
    const key = "send";
    if (state.pending[key]) return null;
    this.host.setPending(key, true);
    this.host.setActionError(`send:${session.id}`, null);

    const capabilities = state.instance?.capabilities ?? [];
    const localKey = sessionLocalKey(session);
    const attempt = this.sendAttempts.get(localKey);
    const reuse = attempt && attempt.text === text ? attempt : null;
    const idempotencyKey = hasCapability(capabilities, CAPABILITIES.sendIdempotency)
      ? reuse?.key || newId("send")
      : undefined;
    const messageId = hasCapability(capabilities, CAPABILITIES.sendMessageId)
      ? reuse?.messageId || newId("msg")
      : undefined;

    this.sendAttempts.set(localKey, {
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
      this.host.applySession(result.session);
      this.sendAttempts.delete(localKey);
      const drafts = { ...this.host.getState().local.drafts };
      delete drafts[localKey];
      this.host.setLocal({ ...this.host.getState().local, drafts });
      this.host.addToast({
        tone: "ok",
        title: sendOutcomeTitle(result, session),
        text: result.steered
          ? "It was injected into the running turn."
          : result.queued
            ? "It runs after the current turn. The queue snapshot shows its position."
            : undefined,
      });
      void this.host.refreshQueue(session.id);
      return result;
    } catch (error) {
      const wire = asWireError(error);
      this.host.setActionError(`send:${session.id}`, wire.message);
      this.host.addToast({
        tone: "danger",
        title: "Prompt not accepted",
        text: `${wire.message} The draft is preserved; retry uses the same key.`,
      });
      if (wire.code === "session_closed" || wire.code === "not_found") {
        void this.host.refreshSession(session.id);
      }
      return null;
    } finally {
      this.host.setPending(key, false);
    }
  }

  /**
   * Answer one pending provider request as the operator. The dashboard is an
   * operator client: it never sends a caller session id, and the answer is
   * always one of the provider's own options for that request.
   */
  async permit(requestId: string | undefined, optionId: string): Promise<void> {
    const state = this.host.getState();
    const session = selectedSession(state);
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    const permission =
      requestId !== undefined
        ? session.pendingPermissions.find((item) => item.requestId === requestId)
        : session.pendingPermissions.length === 1
          ? session.pendingPermissions[0]
          : undefined;
    if (!permission) return;
    const key = `permit:${permission.requestId}`;
    if (state.pending[key]) return;
    this.host.setPending(key, true);
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
      this.host.applySession(result.session);
      const remaining = result.session.pendingPermissions.length;
      this.host.addToast({
        tone: "ok",
        title: `Permission answered · ${optionName}`,
        text:
          remaining > 0
            ? `${remaining} request${remaining === 1 ? "" : "s"} still queued.`
            : "The supervisor confirmed the answer.",
      });
    } catch (error) {
      const wire = asWireError(error);
      this.host.addToast({
        tone: "danger",
        title: "Permission was not answered",
        text: wire.message,
      });
      if (wire.code === "no_pending_permission" || wire.code === "session_closed") {
        await this.host.refreshSession(session.id);
      }
    } finally {
      this.host.setPending(key, false);
    }
  }

  async cancel(keepQueue: boolean): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    if (this.host.getState().pending.cancel) return;
    this.host.setPending("cancel", true);
    try {
      const result = await transport.request<CancelResult>(
        "sessions.cancel",
        { sessionId: session.id, keepQueue },
      );
      this.host.applySession(result.session);
      this.host.addToast({
        tone: "ok",
        title: keepQueue ? "Turn stopped · queue kept" : "Turn stopped",
        text:
          result.discarded > 0
            ? `${result.discarded} queued prompt${result.discarded === 1 ? "" : "s"} discarded.`
            : keepQueue
              ? "The queued prompts will run after this turn ends."
              : "The session remains alive and can run another turn.",
      });
      void this.host.refreshQueue(session.id);
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Stop failed",
        text: asWireError(error).message,
      });
    } finally {
      this.host.setPending("cancel", false);
    }
  }

  async close(force: boolean): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    if (this.host.getState().pending.close) return;
    this.host.setPending("close", true);
    try {
      const result = await transport.request<CloseResult>(
        "sessions.close",
        { sessionId: session.id, force },
      );
      this.host.applySession(result.session);
      this.host.addToast({
        tone: "ok",
        title: result.wasTerminal
          ? "Session was already terminal"
          : `Closed #${result.session.id}`,
        text: result.wasTerminal
          ? "No change was made by this action."
          : "It remains readable for the retention period. The event log is not permanent.",
      });
      void this.host.refreshQueue(session.id);
      void this.host.refreshRecovery();
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Close failed",
        text: asWireError(error).message,
      });
    } finally {
      this.host.setPending("close", false);
    }
  }

  async closeSubtree(): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport || this.host.getState().pending.close) return;
    const descendants = descendantsOf(
      session.id,
      Object.values(this.host.getState().sessions),
    );
    const targets = [...descendants, session].sort((a, b) => b.depth - a.depth);
    this.host.setPending("close", true);
    let closed = 0;
    const errors: string[] = [];
    for (const target of targets) {
      try {
        const result = await transport.request<CloseResult>(
          "sessions.close",
          { sessionId: target.id },
        );
        this.host.applySession(result.session);
        if (!result.wasTerminal) closed += 1;
      } catch (error) {
        errors.push(`${target.id}: ${asWireError(error).message}`);
      }
    }
    this.host.setPending("close", false);
    this.host.addToast({
      tone: errors.length > 0 ? "danger" : "ok",
      title: `Closed ${closed} of ${targets.length} sessions`,
      text:
        errors.length > 0
          ? `${errors.length} failed. ${errors[0]}`
          : "Descendants were closed deepest-first.",
    });
    void this.host.refreshQueue(session.id);
    void this.host.refreshRecovery();
  }

  async forget(): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    if (this.host.getState().pending.forget) return;
    this.host.setPending("forget", true);
    try {
      await transport.request("sessions.forget", { sessionId: session.id });
      const state = this.host.getState();
      const sessions = { ...state.sessions };
      delete sessions[session.id];
      const events = { ...state.events };
      delete events[session.id];
      this.host.setState({
        sessions,
        events,
        selection: null,
        removed: false,
        removedSession: null,
        queue: null,
      });
      this.host.setLocal({ ...this.host.getState().local, selected: null });
      this.host.addToast({
        tone: "ok",
        title: "Session forgotten",
        text: "The retained event log was discarded. Drafts stay local and copyable.",
      });
      void this.host.refreshRecovery();
      void this.host.subscribeToFleet();
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Forget failed",
        text: asWireError(error).message,
      });
    } finally {
      this.host.setPending("forget", false);
    }
  }

  async rename(name: string): Promise<boolean> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return false;
    if (this.host.getState().pending.rename) return false;
    this.host.setPending("rename", true);
    try {
      const result = await transport.request<SessionResult>(
        "sessions.rename",
        { sessionId: session.id, name: name.trim() ? name.trim() : null },
      );
      this.host.applySession(result.session);
      this.host.addToast({
        tone: "ok",
        title: result.session.name
          ? `Renamed to ${result.session.name}`
          : "Name cleared",
        text: `The handle #${result.session.id} did not change.`,
      });
      return true;
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Rename failed",
        text: asWireError(error).message,
      });
      return false;
    } finally {
      this.host.setPending("rename", false);
    }
  }

  async setMode(modeId: string): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    if (this.host.getState().pending.mode) return;
    this.host.setPending("mode", true);
    try {
      const result = await transport.request<SessionResult>(
        "sessions.set_mode",
        { sessionId: session.id, modeId },
      );
      this.host.applySession(result.session);
      const mode = result.session.modes?.availableModes.find((item) => item.id === modeId);
      this.host.addToast({
        tone: "ok",
        title: `Provider mode · ${mode?.name ?? modeId}`,
      });
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Mode change failed",
        text: asWireError(error).message,
      });
      await this.host.refreshSession(session.id);
    } finally {
      this.host.setPending("mode", false);
    }
  }

  async setConfigOption(configId: string, value: string | boolean): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    const key = `config:${configId}`;
    if (this.host.getState().pending[key]) return;
    this.host.setPending(key, true);
    try {
      const result = await transport.request<SessionResult>(
        "sessions.set_config_option",
        { sessionId: session.id, configId, value },
      );
      this.host.applySession(result.session);
      const option = result.session.configOptions?.find((item) => item.id === configId);
      this.host.addToast({
        tone: "ok",
        title: `Set ${option?.name ?? configId}`,
        text: String(option?.currentValue ?? value),
      });
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Option change failed",
        text: asWireError(error).message,
      });
      await this.host.refreshSession(session.id);
    } finally {
      this.host.setPending(key, false);
    }
  }

  async dropQueued(messageId: string): Promise<void> {
    const session = selectedSession(this.host.getState());
    const transport = this.host.getTransport();
    if (!session || !transport) return;
    if (this.host.getState().pending["queue-drop"]) return;
    this.host.setPending("queue-drop", true);
    try {
      const result = await transport.request<QueueDropResult>("sessions.queue_drop", {
        sessionId: session.id,
        messageId,
      });
      this.host.applySession(result.session);
      this.host.addToast({
        tone: "info",
        title: "Queued prompt dropped",
        text: `${result.dropped.textPreview} · it will not run.`,
      });
      await this.host.refreshQueue(session.id);
    } catch (error) {
      this.host.addToast({
        tone: "danger",
        title: "Drop failed",
        text: asWireError(error).message,
      });
      await this.host.refreshQueue(session.id);
    } finally {
      this.host.setPending("queue-drop", false);
    }
  }
}

function sendOutcomeTitle(result: SendResult, session: SessionView): string {
  if (result.duplicate) return "Prompt was already accepted";
  if (result.steered) return `Prompt steered into turn ${result.turn ?? session.turn}`;
  if (result.queued) return "Prompt queued";
  return `Prompt sent to turn ${result.turn ?? session.turn + 1}`;
}
