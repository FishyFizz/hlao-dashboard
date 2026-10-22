import type {
  HelloResult,
  NotificationFrame,
  RpcMethod,
  WireError,
} from "./protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "offline";

export type TransportSink = {
  onHello(hello: HelloResult, home: string): void;
  onNotification(frame: NotificationFrame): void;
  onConnection(status: ConnectionStatus, error?: WireError): void;
};

export type TransportStart = {
  home: string;
  hello: HelloResult | null;
  error: WireError | null;
};

export interface SupervisorTransport {
  readonly kind: "bridge" | "demo";
  start(sink: TransportSink): Promise<TransportStart>;
  request<T>(method: RpcMethod, params?: unknown): Promise<T>;
  close(): void;
}

type SessionResponse = {
  key: string;
  home: string;
  platform: string;
};

type HelloEvent = {
  home: string;
  hello: HelloResult;
};

type ConnectionEvent = {
  status: ConnectionStatus;
  error?: WireError;
};

type RpcResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: WireError };

/**
 * Browser half of the local bridge. It talks same-origin to a loopback Node
 * process; the supervisor token never exists in this origin. The bridge key is
 * a per-run UI capability issued after the operator signs in with the dashboard
 * token. The sign-in itself sets an HttpOnly cookie, so no credential is kept
 * in page storage or in a request URL.
 */
export class BridgeTransport implements SupervisorTransport {
  readonly kind = "bridge" as const;
  private key: string | null = null;
  private source: EventSource | null = null;
  private home = "unknown";
  private sink: TransportSink | null = null;
  private probing = false;

  async start(sink: TransportSink): Promise<TransportStart> {
    this.sink = sink;
    let session: SessionResponse;
    try {
      const response = await fetch("/api/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const mapped = statusError(response.status);
        if (mapped) return { home: this.home, hello: null, error: mapped };
        throw new Error(`bridge responded ${response.status}`);
      }
      session = (await response.json()) as SessionResponse;
    } catch (error) {
      return {
        home: this.home,
        hello: null,
        error: {
          code: "bridge_unavailable",
          message:
            "The local bridge is not running. Start it with `npm run bridge`, then retry.",
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }

    this.key = session.key;
    this.home = session.home;

    return new Promise<TransportStart>((resolve) => {
      let settled = false;
      const finish = (start: TransportStart) => {
        if (settled) return;
        settled = true;
        resolve(start);
      };
      const timeout = window.setTimeout(() => {
        finish({
          home: this.home,
          hello: null,
          error: {
            code: "supervisor_unavailable",
            message: "The bridge did not report a supervisor within 5 seconds.",
          },
        });
      }, 5_000);

      const source = new EventSource(
        `/api/events?key=${encodeURIComponent(session.key)}`,
      );
      this.source = source;

      source.addEventListener("hello", (event) => {
        const payload = parseEvent<HelloEvent>(event);
        if (!payload) return;
        this.home = payload.home;
        if (!settled) {
          window.clearTimeout(timeout);
          finish({ home: payload.home, hello: payload.hello, error: null });
          return;
        }
        this.sink?.onHello(payload.hello, payload.home);
      });

      source.addEventListener("notification", (event) => {
        const payload = parseEvent<NotificationFrame>(event);
        if (payload) this.sink?.onNotification(payload);
      });

      source.addEventListener("connection", (event) => {
        const payload = parseEvent<ConnectionEvent>(event);
        if (!payload) return;
        if (!settled && payload.status === "offline") {
          window.clearTimeout(timeout);
          finish({
            home: this.home,
            hello: null,
            error: payload.error ?? {
              code: "supervisor_unavailable",
              message: `No HLAO supervisor is reachable at ${this.home}.`,
            },
          });
          return;
        }
        if (settled) this.sink?.onConnection(payload.status, payload.error);
      });

      source.onerror = () => {
        if (!settled) {
          window.clearTimeout(timeout);
          finish({
            home: this.home,
            hello: null,
            error: {
              code: "bridge_unavailable",
              message: "The connection to the local bridge closed before it became ready.",
            },
          });
          return;
        }
        this.sink?.onConnection("reconnecting", {
          code: "bridge_unavailable",
          message: "The local bridge connection closed; reconnecting.",
        });
        void this.probeSession();
      };
    });
  }

  /**
   * EventSource does not expose the HTTP status. Probe once after a settled
   * stream fails so an expired cookie moves the operator to sign-in instead of
   * reconnecting forever. A network failure keeps the normal reconnect loop.
   */
  private async probeSession(): Promise<void> {
    if (this.probing) return;
    this.probing = true;
    try {
      const response = await fetch("/api/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        this.sink?.onConnection("offline", {
          code: "bridge_unauthorized",
          message: "The bridge session expired; sign in again.",
        });
      }
    } catch {
      // The bridge may be restarting; keep reconnecting.
    } finally {
      this.probing = false;
    }
  }

  async request<T>(method: RpcMethod, params?: unknown): Promise<T> {
    if (!this.key) {
      throw {
        code: "bridge_unavailable",
        message: "The local bridge is not connected.",
      } satisfies WireError;
    }
    let response: Response;
    try {
      response = await fetch("/api/rpc", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-hlao-key": this.key,
        },
        body: JSON.stringify({ method, params: params ?? {} }),
      });
    } catch (error) {
      throw {
        code: "bridge_unavailable",
        message: "The local bridge is unreachable.",
        details: error instanceof Error ? error.message : String(error),
      } satisfies WireError;
    }
    if (!response.ok) {
      const mapped = statusError(response.status);
      if (mapped) {
        // An expired cookie during live use should return the operator to
        // sign-in, not leave the page issuing doomed requests.
        if (mapped.code === "bridge_unauthorized") {
          this.sink?.onConnection("offline", mapped);
        }
        throw mapped;
      }
      throw {
        code: "bridge_unavailable",
        message: `The local bridge refused the request (${response.status}).`,
      } satisfies WireError;
    }
    const payload = (await response.json()) as RpcResponse;
    if (!payload.ok) throw payload.error;
    return payload.result as T;
  }

  close(): void {
    this.source?.close();
    this.source = null;
    this.key = null;
    this.sink = null;
    this.probing = false;
  }
}

/**
 * Exchange the dashboard operator token for a session cookie. The token is sent
 * once in the request body; it never reaches page storage, the URL, or a
 * returned error.
 */
export async function signInToBridge(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<WireError | null> {
  let response: Response;
  try {
    response = await fetcher("/api/login", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    return {
      code: "bridge_unavailable",
      message: "The local bridge is unreachable.",
      details: error instanceof Error ? error.message : String(error),
    };
  }
  if (response.ok) return null;
  const mapped = statusError(response.status);
  if (mapped) return mapped;
  return {
    code: "bridge_unavailable",
    message: `The local bridge refused the sign-in (${response.status}).`,
  };
}

function statusError(status: number): WireError | null {
  if (status === 401) {
    return {
      code: "bridge_unauthorized",
      message: "The bridge requires an operator token.",
    };
  }
  if (status === 429) {
    return {
      code: "too_many_requests",
      message: "Too many sign-in attempts; wait before trying again.",
    };
  }
  return null;
}

function parseEvent<T>(event: Event): T | null {
  if (!(event instanceof MessageEvent)) return null;
  try {
    return JSON.parse(String(event.data)) as T;
  } catch {
    return null;
  }
}
