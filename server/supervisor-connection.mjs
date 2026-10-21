/**
 * Supervisor IPC: one persistent NDJSON stream over the local socket.
 *
 * The bridge owns the token and forwards frames; it does not reimplement
 * method semantics. Reconnects are explicit and subscribers see every state
 * transition (`connecting`, `open`, `reconnecting`, `offline`).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "node:net";
import { WIRE } from "./wire.mjs";

export class SupervisorConnection {
  constructor(home) {
    this.home = home;
    this.lockPath = join(home, "supervisor.json");
    this.configPath = join(home, "config.json");
    this.socket = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 0;
    this.connected = false;
    this.connecting = null;
    this.hello = null;
    this.lock = null;
    this.subscribers = new Set();
    this.retryTimer = null;
    this.backoff = 0;
    this.lastError = null;
  }

  status() {
    return {
      home: this.home,
      connected: this.connected,
      pid: this.hello?.pid ?? null,
      version: this.hello?.version ?? null,
      startedAt: this.hello?.startedAt ?? null,
    };
  }

  addSubscriber(res) {
    this.subscribers.add(res);
    if (this.connected && this.hello) {
      this.send(res, "hello", this.helloEnvelope());
      this.send(res, "connection", { status: "open" });
    } else {
      this.send(res, "connection", { status: "connecting" });
      void this.ensure().catch(() => {});
    }
  }

  removeSubscriber(res) {
    this.subscribers.delete(res);
  }

  helloEnvelope() {
    return { home: this.home, hello: this.hello };
  }

  broadcast(event, payload) {
    for (const res of this.subscribers) this.send(res, event, payload);
  }

  send(res, event, payload) {
    if (res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      this.subscribers.delete(res);
    }
  }

  async ensure() {
    if (this.connected && this.socket) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async retry() {
    this.teardown();
    return this.ensure();
  }

  async open() {
    const lock = readLock(this.lockPath);
    if (!lock) {
      this.lastError = configProblem(this.configPath) ?? {
        code: "supervisor_unavailable",
        message: `No HLAO supervisor at ${this.home}. Start HLAO, then retry.`,
      };
      this.broadcast("connection", { status: "offline", error: this.lastError });
      throw this.lastError;
    }
    this.lock = lock;

    return new Promise((resolveOpen, rejectOpen) => {
      let settled = false;
      let helloId = 0;
      const socket = connect({ path: lock.endpoint });
      this.socket = socket;
      this.buffer = "";
      this.nextId = 0;

      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) {
          this.lastError = normalizeError(error);
          this.broadcast("connection", {
            status: "offline",
            error: this.lastError,
          });
          rejectOpen(this.lastError);
          this.scheduleRetry();
        } else {
          this.connected = true;
          this.backoff = 0;
          this.lastError = null;
          if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
          }
          this.broadcast("hello", this.helloEnvelope());
          this.broadcast("connection", { status: "open" });
          resolveOpen();
        }
      };

      const timer = setTimeout(() => {
        finish({
          code: "supervisor_unavailable",
          message: `The supervisor at ${this.home} did not answer hello within 10 seconds.`,
        });
        this.teardown();
      }, 10_000);

      socket.on("connect", () => {
        helloId = ++this.nextId;
        const frame = {
          id: helloId,
          method: "hello",
          params: {
            protocolVersion: WIRE,
            stream: { persistent: true },
          },
          token: lock.token,
        };
        this.pending.set(helloId, {
          resolve: (result) => {
            clearTimeout(timer);
            if (!result?.stream?.persistent && !(result?.capabilities ?? []).includes("stream.persistent")) {
              finish({
                code: "version_mismatch",
                message:
                  "The supervisor accepted hello but did not advertise a persistent stream; this dashboard needs wire 3.1.",
              });
              this.teardown();
              return;
            }
            this.hello = result;
            finish(null);
          },
          reject: (error) => {
            clearTimeout(timer);
            finish(error);
            this.teardown();
          },
        });
        socket.write(`${JSON.stringify(frame)}\n`);
      });

      socket.setEncoding("utf8");
      socket.on("data", (chunk) => this.onData(chunk));
      socket.on("error", (error) => {
        finish({
          code: "supervisor_unavailable",
          message: `Cannot reach the supervisor socket: ${error.message}`,
        });
      });
      socket.on("close", () => {
        clearTimeout(timer);
        this.handleClose();
        finish({
          code: "supervisor_unavailable",
          message: "The supervisor socket closed before hello completed.",
        });
      });
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onFrame(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  onFrame(line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    if (frame?.type === "notification") {
      this.broadcast("notification", frame);
      return;
    }
    if (typeof frame?.id !== "number") return;
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);
    if (frame.ok === true) pending.resolve(frame.result);
    else pending.reject(normalizeError(frame.error));
  }

  handleClose() {
    const wasConnected = this.connected;
    this.connected = false;
    this.socket = null;
    for (const pending of this.pending.values()) {
      pending.reject({
        code: "supervisor_unavailable",
        message: "The supervisor connection closed.",
      });
    }
    this.pending.clear();
    if (wasConnected) {
      this.broadcast("connection", {
        status: "reconnecting",
        error: {
          code: "supervisor_unavailable",
          message: "The supervisor connection closed; reconnecting with cursors.",
        },
      });
      this.scheduleRetry();
    }
  }

  scheduleRetry() {
    if (this.subscribers.size === 0 || this.retryTimer) return;
    const delay = Math.min(10_000, 750 * 2 ** this.backoff);
    this.backoff += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.ensure().catch(() => this.scheduleRetry());
    }, delay);
  }

  teardown() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    for (const pending of this.pending.values()) {
      pending.reject({
        code: "supervisor_unavailable",
        message: "The supervisor connection was closed.",
      });
    }
    this.pending.clear();
  }

  async request(method, params) {
    await this.ensure();
    const lock = this.lock ?? readLock(this.lockPath);
    if (!lock || !this.socket) {
      throw {
        code: "supervisor_unavailable",
        message: `No HLAO supervisor at ${this.home}.`,
      };
    }
    const id = ++this.nextId;
    const promise = new Promise((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
    });
    const timer = setTimeout(() => {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      pending.reject({
        code: "timeout",
        message: `${method} did not answer within 120 seconds.`,
      });
    }, 120_000);
    promise.finally(() => clearTimeout(timer)).catch(() => {});
    try {
      this.socket.write(
        `${JSON.stringify({
          id,
          method,
          params: params ?? {},
          token: lock.token,
        })}\n`,
      );
    } catch (error) {
      this.pending.delete(id);
      clearTimeout(timer);
      throw normalizeError(error);
    }
    return promise;
  }
}

export function readLock(lockPath) {
  try {
    if (!existsSync(lockPath)) return null;
    const value = JSON.parse(readFileSync(lockPath, "utf8"));
    if (
      typeof value?.token !== "string" ||
      typeof value?.endpoint !== "string" ||
      value.token.length === 0 ||
      value.endpoint.length === 0
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function configProblem(configPath) {
  if (!existsSync(configPath)) return null;
  try {
    JSON.parse(readFileSync(configPath, "utf8"));
    return null;
  } catch (error) {
    return {
      code: "config_invalid",
      message: `Invalid HLAO config at ${configPath}: ${error.message}`,
    };
  }
}

export function normalizeError(error) {
  if (error && typeof error === "object" && typeof error.message === "string") {
    return {
      code: typeof error.code === "string" ? error.code : "internal",
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  return { code: "internal", message: String(error) };
}
