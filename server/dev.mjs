#!/usr/bin/env node
/**
 * One-command development launcher: the local bridge and the Vite dev server.
 *
 * The bridge owns the supervisor token and serves /api on 4780; Vite serves the
 * page on 5173 and proxies /api to the bridge. Both processes belong to this
 * launcher and are stopped together.
 *
 *   npm start -- --home "C:\path\to\HLAO_HOME"
 *
 * `HLAO_HOME` is honoured when --home is omitted. The bridge port is fixed at
 * 4780 because vite.config.ts proxies /api there; only the Vite port is
 * configurable.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = resolve(HERE, "..");
const BRIDGE_PORT = 4780;
const DEFAULT_VITE_PORT = 5173;

function usage(stream = console.log) {
  stream(`hlao dashboard — start the bridge and the dev server together

Usage: npm start -- [--home DIR] [--vite-port N] [--token-file PATH] [--open]

  --home DIR        HLAO home the bridge should read (default: $HLAO_HOME or ~/.hlao)
  --vite-port N     port for the Vite dev server (default: ${DEFAULT_VITE_PORT})
  --token-file PATH read the dashboard operator token from PATH
  --open            ask Vite to open the page in a browser
  -h, --help        this help

The bridge listens on http://127.0.0.1:${BRIDGE_PORT}; Vite proxies /api there.
Without --token-file (or HLAO_DASHBOARD_TOKEN) the bridge generates a per-home
token file and prints its path; paste that token into the sign-in screen.
Ctrl-C stops both processes. The bridge does not start a supervisor: start HLAO
first in another terminal (for example "hlao list --all").
`);
}

function parseArgs(argv) {
  const options = {
    home: process.env.HLAO_HOME || join(homedir(), ".hlao"),
    vitePort: DEFAULT_VITE_PORT,
    tokenFile: process.env.HLAO_DASHBOARD_TOKEN_FILE || null,
    open: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--home") {
      const value = argv[++index];
      if (value === undefined) throw new Error("--home needs a directory");
      options.home = value;
    } else if (arg === "--vite-port") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 65_535) {
        throw new Error("--vite-port must be an integer between 1 and 65535");
      }
      options.vitePort = value;
    } else if (arg === "--token-file") {
      const value = argv[++index];
      if (value === undefined) throw new Error("--token-file needs a path");
      options.tokenFile = value;
    } else if (arg === "--open") {
      options.open = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  options.home = resolve(options.home);
  if (options.tokenFile) options.tokenFile = resolve(options.tokenFile);
  return options;
}

const options = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`hlao dashboard: ${error.message}`);
    usage(console.error);
    process.exit(1);
  }
})();

if (options.help) {
  usage();
  process.exit(0);
}

const bridgePath = join(HERE, "bridge.mjs");
const vitePath = join(ROOT, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(vitePath)) {
  console.error(
    `hlao dashboard: cannot find ${vitePath}; run "npm install" in ${ROOT} first`,
  );
  process.exit(1);
}

console.log(`hlao dashboard`);
console.log(`  home    ${options.home}`);
console.log(`  bridge  http://127.0.0.1:${BRIDGE_PORT}`);
console.log(`  app     http://127.0.0.1:${options.vitePort}`);
console.log(`Ctrl-C stops both.`);

const env = { ...process.env, HLAO_HOME: options.home };
// The bridge needs the token; Vite and its plugins do not.
const viteEnv = { ...process.env };
delete viteEnv.HLAO_DASHBOARD_TOKEN;
const bridgeArgs = [
  bridgePath,
  "--home",
  options.home,
  "--vite-port",
  String(options.vitePort),
];
if (options.tokenFile) bridgeArgs.push("--token-file", options.tokenFile);
// POSIX: put the children in their own process group so a terminal Ctrl-C
// reaches only this launcher, which then stops both cleanly. Windows would
// open a new console for a detached child, so keep it attached there.
const detached = process.platform !== "win32";
const children = [
  spawn(process.execPath, bridgeArgs, {
    cwd: ROOT,
    env,
    stdio: "inherit",
    detached,
  }),
  spawn(
    process.execPath,
    [
      vitePath,
      "--port",
      String(options.vitePort),
      "--strictPort",
      ...(options.open ? ["--open"] : []),
    ],
    { cwd: ROOT, env: viteEnv, stdio: "inherit", detached },
  ),
];

let stopping = false;
let exitCode = 0;

function waitForExit(child) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.once("exit", resolvePromise);
  });
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
  const force = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }
  }, 3_000);
  force.unref();
  void Promise.all(children.map(waitForExit)).then(() => {
    clearTimeout(force);
    process.exit(exitCode);
  });
}

for (const [index, child] of children.entries()) {
  child.on("error", (error) => {
    console.error(
      `hlao dashboard: ${index === 0 ? "bridge" : "vite"} failed: ${error.message}`,
    );
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    const name = index === 0 ? "bridge" : "vite";
    console.error(
      `hlao dashboard: ${name} exited (${signal ?? code ?? "unknown"}); stopping the other process`,
    );
    shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
