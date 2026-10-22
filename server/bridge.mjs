#!/usr/bin/env node
/**
 * HLAO local bridge.
 *
 * Owns the supervisor token and the local IPC connection. The browser page
 * talks to this process over loopback HTTP + SSE and never receives the
 * supervisor token. Frames are forwarded, not reimplemented: method semantics
 * stay in the supervisor (ADR 0009 in the parent repo).
 *
 * The operator authenticates with a dashboard token (ADR 0003). The browser
 * exchanges it once for a signed, HttpOnly session cookie; non-browser callers
 * may send it as a bearer token. Every /api route is gated. The static SPA
 * shell stays public because it carries no data.
 *
 * Modules: `auth` owns tokens and session cookies, `supervisor-connection` owns
 * the socket and supervisor token, `http-utils` serves JSON and the built SPA,
 * `directories` owns the cwd picker read, and this file is the HTTP surface and
 * process lifecycle.
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
import {
  authenticate,
  bearerToken,
  clearCookie,
  cookieNameFor,
  createLoginThrottle,
  deriveSessionSecret,
  isSecureRequest,
  resolveOperatorToken,
  sessionCookie,
  signSession,
  SESSION_TTL_MS,
  tokensMatch,
} from "./auth.mjs";
import { listDirectories } from "./directories.mjs";
import { readBody, sendJson, serveStatic } from "./http-utils.mjs";
import {
  normalizeError,
  SupervisorConnection,
} from "./supervisor-connection.mjs";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = resolve(HERE, "..");
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"];
const LOGIN_BODY_LIMIT = 4096;

function usage(stream = console.log) {
  stream(`hlao dashboard bridge

Usage: node server/bridge.mjs [--home DIR] [--port N] [--host 127.0.0.1] [--dist DIR] [--no-serve] [--allow-remote] [--token-file PATH] [--vite-port N]

The bridge reads <home>/supervisor.json, opens the supervisor's local socket,
and serves the built dashboard on loopback. The supervisor token never reaches
the page. Run "npm run build" first, or use "npm start -- --home DIR" to run the
bridge and Vite together.

The dashboard is gated by an operator token, kept separate from the supervisor
token:

  HLAO_DASHBOARD_TOKEN       token value; inherited from the environment
  --token-file PATH          read the token from PATH
  (neither)                  generate a per-home token file and print its path

The bridge never prints the token itself. Open the dashboard, read the token
file it names, and paste the token into the sign-in screen.

--allow-remote lifts the loopback restriction on --host. Every peer that can
reach the port reaches the sign-in screen; put TLS in front of the bridge and
keep the token private.

--vite-port N also accepts the Vite development origin on that port. Without it
the bridge trusts only its own origin. The dev launcher passes this for you.

--public-origin URL (repeatable, or HLAO_DASHBOARD_PUBLIC_ORIGIN as a
comma-separated list) allows one exact browser origin, for a reverse proxy that
publishes the dashboard under its own scheme, host, and port. Use the origin the
browser shows, for example https://agentgate.example.net:8795. This is narrower
than --allow-remote, which trusts any origin whose host matches the request's
Host header.
`);
}

function nextValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined) throw new Error(`${flag} needs a value`);
  return value;
}

/** A bare http(s) origin: the exact value a browser sends in Origin. */
function normalizeOrigin(value, flag) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${flag} expects an origin such as https://host:port`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${flag} must use http or https`);
  }
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error(`${flag} expects a bare origin, not a URL with credentials, a path, or a query`);
  }
  return url.origin;
}

function parseArgs(argv) {
  const envOrigins = (process.env.HLAO_DASHBOARD_PUBLIC_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeOrigin(value, "HLAO_DASHBOARD_PUBLIC_ORIGIN"));
  const options = {
    home: process.env.HLAO_HOME || join(homedir(), ".hlao"),
    host: "127.0.0.1",
    port: Number(process.env.HLAO_DASHBOARD_PORT || 4780),
    vitePort: process.env.HLAO_DASHBOARD_VITE_PORT
      ? Number(process.env.HLAO_DASHBOARD_VITE_PORT)
      : null,
    dist: join(ROOT, "dist"),
    serve: true,
    allowRemote: false,
    publicOrigins: envOrigins,
    tokenFile: process.env.HLAO_DASHBOARD_TOKEN_FILE || null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--home") options.home = nextValue(argv, ++index, arg);
    else if (arg === "--host") options.host = nextValue(argv, ++index, arg);
    else if (arg === "--port") options.port = Number(nextValue(argv, ++index, arg));
    else if (arg === "--vite-port") options.vitePort = Number(nextValue(argv, ++index, arg));
    else if (arg === "--dist") options.dist = resolve(nextValue(argv, ++index, arg));
    else if (arg === "--no-serve") options.serve = false;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--public-origin") {
      options.publicOrigins.push(normalizeOrigin(nextValue(argv, ++index, arg), arg));
    } else if (arg === "--token-file") options.tokenFile = nextValue(argv, ++index, arg);
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  if (
    options.vitePort !== null &&
    (!Number.isInteger(options.vitePort) ||
      options.vitePort < 1 ||
      options.vitePort > 65_535)
  ) {
    throw new Error("--vite-port must be an integer between 1 and 65535");
  }
  if (options.tokenFile) options.tokenFile = resolve(options.tokenFile);
  options.home = resolve(options.home);
  return options;
}

/**
 * The UI key is a loopback capability issued only after authentication, not the
 * supervisor token. Keeping it stable per home lets an open page's EventSource
 * reconnect after a bridge restart without a manual refresh. It is readable by
 * local processes, which can already read supervisor.json; Origin and operator
 * token checks remain the browser fence.
 */
function uiKeyPathFor(home) {
  return join(
    tmpdir(),
    `hlao-dashboard-${createHash("sha256").update(home).digest("hex").slice(0, 16)}.key`,
  );
}

function loadUiKey(home) {
  const path = uiKeyPathFor(home);
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (/^[a-f0-9]{48}$/.test(existing)) return existing;
  } catch {
    // Create the key below.
  }
  const key = randomBytes(24).toString("hex");
  try {
    writeFileSync(path, `${key}\n`, { mode: 0o600 });
  } catch {
    // A read-only temp directory still works with an in-memory key.
  }
  return key;
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** "missing" requests are non-browser callers; only "denied" is refused. */
function originVerdict(req, options) {
  const raw = req.headers.origin;
  if (!raw) return "missing";
  let origin;
  try {
    origin = new URL(raw).origin;
  } catch {
    return "denied";
  }
  const allowed = new Set([
    `http://127.0.0.1:${options.port}`,
    `http://localhost:${options.port}`,
    `http://[::1]:${options.port}`,
  ]);
  if (options.vitePort) {
    allowed.add(`http://127.0.0.1:${options.vitePort}`);
    allowed.add(`http://localhost:${options.vitePort}`);
    allowed.add(`http://[::1]:${options.vitePort}`);
  }
  for (const publicOrigin of options.publicOrigins ?? []) allowed.add(publicOrigin);
  if (allowed.has(origin)) return "ok";
  // A non-loopback bind is reachable under any name the host answers to. Compare
  // the exact host:port the browser loaded the page from; ports are part of the
  // browser origin and same-site cookies do not isolate them. A reverse proxy
  // that strips the port from Host needs --public-origin instead.
  if (options.allowRemote) {
    const originHost = new URL(origin).host;
    if (
      originHost === req.headers.host ||
      originHost === req.headers["x-forwarded-host"]
    ) {
      return "ok";
    }
  }
  return "denied";
}

function requireKey(req, url, uiKey) {
  const key = req.headers["x-hlao-key"] || url.searchParams.get("key");
  return typeof key === "string" && tokensMatch(uiKey, key);
}

function peerAddress(req) {
  const address = req.socket.remoteAddress ?? "unknown";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Build the HTTP server without listening, so tests can bind port 0. `auth`
 * carries the resolved operator token, the derived cookie secret, and the
 * per-home cookie name.
 */
export function createBridgeServer({
  options,
  supervisor,
  uiKey,
  auth,
  loginDelayMs = 250,
  throttle = createLoginThrottle(),
}) {
  async function handleLogin(req, res) {
    const peer = peerAddress(req);
    const gate = throttle.check(peer);
    if (!gate.allowed) {
      const seconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      sendJson(
        res,
        429,
        {
          ok: false,
          error: { code: "too_many_requests", message: "too many sign-in attempts" },
        },
        { "Retry-After": String(seconds) },
      );
      return;
    }

    let candidate = bearerToken(req);
    if (!candidate) {
      const contentType = req.headers["content-type"] ?? "";
      if (!/^application\/json\b/i.test(contentType)) {
        sendJson(res, 415, {
          ok: false,
          error: {
            code: "bad_request",
            message: "content-type must be application/json",
          },
        });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(await readBody(req, LOGIN_BODY_LIMIT));
      } catch (error) {
        const tooLarge = /too large/.test(error.message);
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          error: { code: "bad_request", message: error.message },
        });
        return;
      }
      candidate = typeof payload?.token === "string" ? payload.token : null;
    }

    if (typeof candidate !== "string" || !tokensMatch(auth.token, candidate)) {
      throttle.fail(peer);
      await sleep(loginDelayMs);
      sendJson(res, 401, {
        ok: false,
        error: { code: "unauthorized", message: "invalid token" },
      });
      return;
    }

    throttle.succeed(peer);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": sessionCookie(
          auth.cookieName,
          signSession(auth.secret, expiresAt),
          {
            maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
            secure: isSecureRequest(req),
          },
        ),
      },
    );
  }

  return createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? `${options.host}:${options.port}`}`,
    );
    const verdict = originVerdict(req, options);
    if (verdict === "denied") {
      sendJson(res, 403, { error: "origin is not allowed" });
      return;
    }

    if (url.pathname === "/api/login") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      await handleLogin(req, res);
      return;
    }

    if (url.pathname === "/api/logout") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      sendJson(
        res,
        200,
        { ok: true },
        { "Set-Cookie": clearCookie(auth.cookieName, { secure: isSecureRequest(req) }) },
      );
      return;
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const via = authenticate(req, {
        secret: auth.secret,
        cookieName: auth.cookieName,
        token: auth.token,
      });
      if (!via) {
        sendJson(res, 401, {
          ok: false,
          error: { code: "unauthorized", message: "operator token required" },
        });
        return;
      }
      // Cookies are ambient credentials. Require an allowed Origin on anything
      // state-changing so a page on another localhost port cannot drive the
      // fleet. Bearer callers carry no ambient credential and are exempt.
      if (via === "cookie" && req.method !== "GET" && req.method !== "HEAD" && verdict !== "ok") {
        sendJson(res, 403, { error: "origin is required for this request" });
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
        if (!requireKey(req, url, uiKey)) {
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
        if (!requireKey(req, url, uiKey)) {
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
        if (!requireKey(req, url, uiKey)) {
          sendJson(res, 401, {
            ok: false,
            error: { code: "unauthorized", message: "bad bridge key" },
          });
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

      sendJson(res, 404, { error: "not found" });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res, url, options);
      return;
    }

    sendJson(res, 405, { error: "method not allowed" });
  });
}

function describeAuth(resolved) {
  if (resolved.source === "env") {
    return "operator token from HLAO_DASHBOARD_TOKEN";
  }
  return `operator token from ${resolved.path}`;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

export function startBridge(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`hlao dashboard: ${error.message}`);
    usage(console.error);
    process.exit(1);
  }

  if (options.help) {
    usage();
    process.exit(0);
  }

  if (!LOOPBACK_HOSTS.includes(options.host) && !options.allowRemote) {
    console.error(
      `refusing to bind ${options.host}: the dashboard bridge is loopback-only; pass --allow-remote to bind a non-loopback host`,
    );
    process.exit(1);
  }

  let resolved;
  try {
    resolved = resolveOperatorToken({
      home: options.home,
      tokenFile: options.tokenFile,
    });
  } catch (error) {
    console.error(`hlao dashboard: ${error.message}`);
    process.exit(1);
  }

  const auth = {
    token: resolved.token,
    secret: deriveSessionSecret(resolved.token, options.home),
    cookieName: cookieNameFor(options.home),
  };
  const supervisor = new SupervisorConnection(options.home);
  const server = createBridgeServer({
    options,
    supervisor,
    uiKey: loadUiKey(options.home),
    auth,
  });

  server.on("error", (error) => {
    console.error("bridge failed:", error.message);
    process.exitCode = 1;
  });

  server.listen(options.port, options.host, () => {
    log(`HLAO dashboard bridge on http://${options.host}:${options.port}`);
    log(`home ${options.home}`);
    log(`auth ${describeAuth(resolved)}`);
    log("the supervisor token stays in this process");
  });

  const shutdownBridge = () => {
    supervisor.teardown();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdownBridge);
  process.on("SIGTERM", shutdownBridge);
  return server;
}

if (isMainModule()) startBridge(process.argv.slice(2));
