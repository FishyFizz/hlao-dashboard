#!/usr/bin/env node
/**
 * HLAO local bridge.
 *
 * Owns the supervisor token and the local IPC connection. The browser page
 * talks to this process over loopback HTTP + SSE and never receives the token.
 * Frames are forwarded, not reimplemented: method semantics stay in the
 * supervisor (ADR 0009 in the parent repo).
 */

import { createServer } from "node:http";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { connect } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = resolve(HERE, "..");
const WIRE = { major: 3, minor: 0 };

function parseArgs(argv) {
  const options = {
    home: process.env.HLAO_HOME || join(homedir(), ".hlao"),
    host: "127.0.0.1",
    port: Number(process.env.HLAO_DASHBOARD_PORT || 4780),
    dist: join(ROOT, "dist"),
    serve: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--home") options.home = argv[++index];
    else if (arg === "--host") options.host = argv[++index];
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--dist") options.dist = resolve(argv[++index]);
    else if (arg === "--no-serve") options.serve = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(`hlao dashboard bridge

Usage: node server/bridge.mjs [--home DIR] [--port N] [--host 127.0.0.1] [--dist DIR] [--no-serve]

The bridge reads <home>/supervisor.json, opens the supervisor's local socket,
and serves the built dashboard on loopback. The supervisor token never reaches
the page. Run "npm run build" first, or use "npm start -- --home DIR" to run the
bridge and Vite together.`);
      process.exit(0);
    }
  }
  options.home = resolve(options.home);
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!["127.0.0.1", "localhost", "::1"].includes(options.host)) {
  console.error(
    `refusing to bind ${options.host}: the dashboard bridge is loopback-only; use 127.0.0.1`,
  );
  process.exit(1);
}
/**
 * The UI key is a loopback capability, not the supervisor token. Keeping it
 * stable per home lets an open page's EventSource reconnect after a bridge
 * restart without a manual refresh. It is readable by local processes, which
 * can already read supervisor.json; Origin checks remain the browser fence.
 */
const uiKeyPath = join(
  tmpdir(),
  `hlao-dashboard-${createHash("sha256").update(options.home).digest("hex").slice(0, 16)}.key`,
);
const uiKey = loadUiKey();
const lockPath = join(options.home, "supervisor.json");
const configPath = join(options.home, "config.json");

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function loadUiKey() {
  try {
    const existing = readFileSync(uiKeyPath, "utf8").trim();
    if (/^[a-f0-9]{48}$/.test(existing)) return existing;
  } catch {
    // Create the key below.
  }
  const key = randomBytes(24).toString("hex");
  try {
    writeFileSync(uiKeyPath, `${key}\n`, { mode: 0o600 });
  } catch {
    // A read-only temp directory still works with an in-memory key.
  }
  return key;
}

function readLock() {
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

class SupervisorConnection {
  constructor() {
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
      home: options.home,
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
    return { home: options.home, hello: this.hello };
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
    const lock = readLock();
    if (!lock) {
      this.lastError = configProblem() ?? {
        code: "supervisor_unavailable",
        message: `No HLAO supervisor at ${options.home}. Start HLAO, then retry.`,
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
          message: `The supervisor at ${options.home} did not answer hello within 10 seconds.`,
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
                  "The supervisor accepted hello but did not advertise a persistent stream; this dashboard needs wire 3.0.",
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
    const lock = this.lock ?? readLock();
    if (!lock || !this.socket) {
      throw {
        code: "supervisor_unavailable",
        message: `No HLAO supervisor at ${options.home}.`,
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

function configProblem() {
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

function normalizeError(error) {
  if (error && typeof error === "object" && typeof error.message === "string") {
    return {
      code: typeof error.code === "string" ? error.code : "internal",
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  return { code: "internal", message: String(error) };
}

const supervisor = new SupervisorConnection();

function allowedOrigin(origin) {
  if (!origin) return true;
  const allowed = new Set([
    `http://127.0.0.1:${options.port}`,
    `http://localhost:${options.port}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://[::1]:5173",
  ]);
  return allowed.has(origin);
}

function directoryRoots() {
  if (process.platform !== "win32") return ["/"];
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((letter) => `${letter}:\\`)
    .filter((path) => existsSync(path));
}

function listDirectories(rawPath) {
  const requested =
    typeof rawPath === "string" && rawPath.trim() ? rawPath.trim() : homedir();
  const path = resolve(requested);
  try {
    if (!statSync(path).isDirectory()) {
      throw new Error("not a directory");
    }
    const entries = readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
      }))
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      );
    const parent = dirname(path);
    return {
      path,
      parent: parent === path ? null : parent,
      entries,
      roots: directoryRoots(),
    };
  } catch (error) {
    throw {
      code: "bad_request",
      message: `Cannot browse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req, limit = 1_048_576) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function requireKey(req, url) {
  const key = req.headers["x-hlao-key"] || url.searchParams.get("key");
  return key === uiKey;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, url) {
  if (!options.serve) {
    sendJson(res, 404, { error: "static serving is disabled" });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "bad path" });
    return;
  }
  if (pathname === "/" || pathname === "" || pathname === "/design" || pathname === "/design/") {
    pathname = "/index.html";
  }
  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const candidate = resolve(options.dist, `.${normalize(pathname)}`);
  if (!candidate.startsWith(options.dist + sep) && candidate !== options.dist) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  let file = candidate;
  if (!existsSync(file) || (existsSync(file) && statSync(file).isDirectory())) {
    file = join(options.dist, "index.html");
  }
  if (!existsSync(file)) {
    sendJson(res, 404, {
      error: "dashboard build not found; run `npm run build` or use `npm run dev`",
    });
    return;
  }
  const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
    ...(file.endsWith("index.html")
      ? {
          "Content-Security-Policy":
            "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        }
      : {}),
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${options.host}:${options.port}`}`);

  if (!allowedOrigin(req.headers.origin)) {
    sendJson(res, 403, { error: "origin is not allowed" });
    return;
  }

  if (url.pathname === "/api/session" && req.method === "GET") {
    sendJson(res, 200, {
      key: uiKey,
      home: options.home,
      platform: process.platform,
    });
    return;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, ...supervisor.status() });
    return;
  }

  if (url.pathname === "/api/retry" && req.method === "POST") {
    if (!requireKey(req, url)) {
      sendJson(res, 401, { error: "bad bridge key" });
      return;
    }
    try {
      await supervisor.retry();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 200, { ok: false, error: normalizeError(error) });
    }
    return;
  }

  if (url.pathname === "/api/events" && req.method === "GET") {
    if (!requireKey(req, url)) {
      sendJson(res, 401, { error: "bad bridge key" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 1000\n\n");
    supervisor.addSubscriber(res);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": bridge alive\n\n");
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      supervisor.removeSubscriber(res);
    });
    return;
  }

  if (url.pathname === "/api/rpc" && req.method === "POST") {
    if (!requireKey(req, url)) {
      sendJson(res, 401, { ok: false, error: { code: "unauthorized", message: "bad bridge key" } });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req, 16_777_216));
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: { code: "bad_request", message: error.message },
      });
      return;
    }
    if (typeof payload?.method !== "string") {
      sendJson(res, 400, {
        ok: false,
        error: { code: "bad_request", message: "method is required" },
      });
      return;
    }
    if (payload.method === "dashboard.fs.list") {
      try {
        sendJson(res, 200, {
          ok: true,
          result: listDirectories(payload.params?.path),
        });
      } catch (error) {
        sendJson(res, 200, { ok: false, error: normalizeError(error) });
      }
      return;
    }
    try {
      const result = await supervisor.request(payload.method, payload.params ?? {});
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 200, { ok: false, error: normalizeError(error) });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res, url);
    return;
  }

  sendJson(res, 405, { error: "method not allowed" });
});

server.on("error", (error) => {
  console.error("bridge failed:", error.message);
  process.exitCode = 1;
});

server.listen(options.port, options.host, () => {
  log(`HLAO dashboard bridge on http://${options.host}:${options.port}`);
  log(`home ${options.home}`);
  log("the supervisor token stays in this process");
});

function shutdownBridge() {
  supervisor.teardown();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdownBridge);
process.on("SIGTERM", shutdownBridge);
