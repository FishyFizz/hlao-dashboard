/**
 * A simulated supervisor for the dashboard's demo instance.
 *
 * It exists so the interaction model can be exercised without a running HLAO
 * instance. It is labelled "demo" everywhere in the UI, and it implements the
 * same method shapes as the wire so the client code paths are not special
 * cases. It is not a second protocol and it is never presented as live.
 *
 * The engine is split by role: `fixtures` seeds a world, `reads` projects it,
 * `writes` mutates it, and `simulation` advances turns. This class is only the
 * request dispatcher and the transport seam.
 */

import type {
  HelloResult,
  NotificationFrame,
  ReadParams,
  RpcMethod,
  SendParams,
  SpawnParams,
  SubscribeParams,
  WireError,
} from "../wire/protocol";
import { seedDemo } from "./fixtures";
import {
  backends,
  get,
  hello,
  list,
  providerSessions,
  queue,
  read,
  recoveryReceipts,
  subscribe,
  unsubscribe,
  wait,
} from "./reads";
import { wireError } from "./support";
import type { DemoState } from "./types";
import { clearAllTimers, createDemoState } from "./world";
import {
  cancel,
  closeSession,
  forget,
  permit,
  queueDrop,
  rename,
  send,
  setConfig,
  setMode,
  shutdown,
  spawn,
} from "./writes";

export class DemoSupervisor {
  private readonly state: DemoState;

  constructor(notify: (frame: NotificationFrame) => void) {
    this.state = createDemoState(notify);
    seedDemo(this.state);
  }

  async request<T>(method: RpcMethod, params: unknown): Promise<T> {
    if (this.state.shuttingDown) {
      throw wireError("supervisor_unavailable", "the demo supervisor has shut down");
    }
    const input = (params ?? {}) as Record<string, unknown>;
    const value = await this.dispatch(method, input);
    return value as T;
  }

  close(): void {
    clearAllTimers(this.state);
    this.state.subscriptions.clear();
  }

  private async dispatch(
    method: RpcMethod,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (method) {
      case "hello":
        return hello(this.state);
      case "backends.list":
        return backends();
      case "backends.sessions":
        return providerSessions(
          this.state,
          String(params.backend ?? ""),
          typeof params.cwd === "string" && params.cwd.length > 0
            ? params.cwd
            : null,
        );
      case "recovery.receipts":
        return recoveryReceipts(this.state);
      case "sessions.list":
        return list(this.state, params.includeClosed === true);
      case "sessions.get":
        return get(this.state, String(params.sessionId ?? ""));
      case "sessions.read":
        return read(this.state, readParams(params));
      case "sessions.queue":
        return queue(this.state, String(params.sessionId ?? ""));
      case "sessions.send":
        return send(this.state, sendParams(params));
      case "sessions.spawn":
        return spawn(this.state, spawnParams(params));
      case "sessions.permit":
        return permit(
          this.state,
          String(params.sessionId ?? ""),
          optionalString(params.requestId),
          optionalString(params.optionId),
        );
      case "sessions.cancel":
        return cancel(
          this.state,
          String(params.sessionId ?? ""),
          params.keepQueue === true,
        );
      case "sessions.close":
        return closeSession(this.state, String(params.sessionId ?? ""));
      case "sessions.forget":
        return forget(this.state, String(params.sessionId ?? ""));
      case "sessions.rename":
        return rename(
          this.state,
          String(params.sessionId ?? ""),
          typeof params.name === "string" ? params.name : null,
        );
      case "sessions.set_mode":
        return setMode(
          this.state,
          String(params.sessionId ?? ""),
          String(params.modeId ?? ""),
        );
      case "sessions.set_config_option":
        return setConfig(
          this.state,
          String(params.sessionId ?? ""),
          String(params.configId ?? ""),
          typeof params.value === "string" || typeof params.value === "boolean"
            ? params.value
            : String(params.value),
        );
      case "sessions.queue_drop":
        return queueDrop(
          this.state,
          String(params.sessionId ?? ""),
          optionalString(params.messageId),
          optionalNumber(params.position),
        );
      case "sessions.wait":
        return wait(this.state, params);
      case "stream.subscribe":
        return subscribe(this.state, subscribeParams(params));
      case "stream.unsubscribe":
        return unsubscribe(this.state, Number(params.subscription ?? 0));
      case "supervisor.reload":
        return { configHash: "demo-config", configError: null };
      case "supervisor.shutdown":
        return shutdown(this.state);
      default:
        throw wireError("bad_request", `unsupported method ${String(method)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Dynamic params                                                     */
/* ------------------------------------------------------------------ */

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readParams(params: Record<string, unknown>): ReadParams {
  return {
    sessionId: String(params.sessionId ?? ""),
    since: optionalNumber(params.since),
    before: optionalNumber(params.before),
    limit: optionalNumber(params.limit),
    raw: params.raw === true,
    types: Array.isArray(params.types)
      ? params.types.filter((type): type is string => typeof type === "string")
      : undefined,
    turn: optionalNumber(params.turn),
    grep: optionalString(params.grep),
    afterAt: optionalString(params.afterAt),
    beforeAt: optionalString(params.beforeAt),
    regex: params.regex === true,
    context: optionalNumber(params.context),
  };
}

function sendParams(params: Record<string, unknown>): SendParams {
  return {
    sessionId: String(params.sessionId ?? ""),
    text: String(params.text ?? ""),
    wait: params.wait === true,
    timeoutMs: optionalNumber(params.timeoutMs),
    messageId: optionalString(params.messageId),
    idempotencyKey: optionalString(params.idempotencyKey),
    steer: params.steer === true,
  };
}

function spawnParams(params: Record<string, unknown>): SpawnParams {
  return {
    backend: String(params.backend ?? ""),
    cwd: optionalString(params.cwd),
    name: optionalString(params.name),
    prompt: optionalString(params.prompt),
    wait: params.wait === true,
    timeoutMs: optionalNumber(params.timeoutMs),
    mode: optionalString(params.mode),
    model: optionalString(params.model),
    parentSessionId: optionalString(params.parentSessionId),
    skill: typeof params.skill === "boolean" ? params.skill : undefined,
    idempotencyKey: optionalString(params.idempotencyKey),
    resumeSessionId: optionalString(params.resumeSessionId),
    forkSessionId: optionalString(params.forkSessionId),
  };
}

function subscribeParams(params: Record<string, unknown>): SubscribeParams {
  const since =
    params.since && typeof params.since === "object" && !Array.isArray(params.since)
      ? Object.fromEntries(
          Object.entries(params.since as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        )
      : undefined;
  return {
    sessionIds: Array.isArray(params.sessionIds)
      ? params.sessionIds.filter((id): id is string => typeof id === "string")
      : undefined,
    fleet: params.fleet === true,
    since,
  };
}

/* ------------------------------------------------------------------ */
/* Transport                                                          */
/* ------------------------------------------------------------------ */

export type DemoEventSink = {
  onNotification(frame: NotificationFrame): void;
};

export class DemoTransport {
  readonly kind = "demo" as const;
  private supervisor: DemoSupervisor | null = null;
  private sink: DemoEventSink | null = null;

  async start(sink: DemoEventSink): Promise<{
    home: string;
    hello: HelloResult | null;
    error: WireError | null;
  }> {
    this.sink = sink;
    this.supervisor = new DemoSupervisor((frame) => this.sink?.onNotification(frame));
    const hello = await this.supervisor.request<HelloResult>("hello", {});
    return { home: "demo://hlao", hello, error: null };
  }

  async request<T>(method: RpcMethod, params?: unknown): Promise<T> {
    if (!this.supervisor) {
      throw wireError("supervisor_unavailable", "the demo instance is not connected");
    }
    return this.supervisor.request<T>(method, params);
  }

  close(): void {
    this.supervisor?.close();
    this.supervisor = null;
  }
}
