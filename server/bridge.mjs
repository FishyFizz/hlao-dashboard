#!/usr/bin/env node
/**
 * HLAO local bridge.
 *
 * Owns the supervisor token and the local IPC connection. The browser page
 * talks to this process over loopback HTTP + SSE and never receives the token.
 * Frames are forwarded, not reimplemented: method semantics stay in the
 * supervisor (ADR 0009 in the parent repo).
 *
 * Modules: `supervisor-connection` owns the socket and token, `http-utils`
 * serves JSON and the built SPA, `directories` owns the cwd picker read, and
 * this file is the HTTP surface and process lifecycle.
 */

import { createServer } from "node:http";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { listDirectories } from "./directories.mjs";
import { readBody, sendJson, serveStatic } from "./http-utils.mjs";
import {
  normalizeError,
  SupervisorConnection,
} from "./supervisor-connection.mjs";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = resolve(HERE, "..");

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

const supervisor = new SupervisorConnection(options.home);

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

function requireKey(req, url) {
  const key = req.headers["x-hlao-key"] || url.searchParams.get("key");
  return key === uiKey;
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
    serveStatic(req, res, url, options);
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
