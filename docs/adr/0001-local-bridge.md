# 0001 — Loopback bridge with SSE + POST

**Status:** accepted, 2026-10-20.

## Context

The supervisor token is full operator authority and must never reach a browser
origin. The page still needs live views and events, request/response calls, and
reconnect with cursors. The supervisor's native transports are a local named
pipe or Unix socket.

## Decision

A local Node process owns `<HLAO_HOME>/supervisor.json`, opens the supervisor's
persistent NDJSON stream, and serves the built SPA on `127.0.0.1`.

- `POST /api/rpc` carries one method call and returns one result.
- `GET /api/events` is SSE: `hello`, `connection`, and `notification` events.
- `/api/session` returns a per-run UI key, a home path, and a platform. The key
  is required on RPC and SSE; it is a UI capability, not the supervisor token.
- Origin checks accept the bridge's own origin and the local Vite development
  origin only.
- The bridge forwards frames. It does not reinterpret methods or store
  orchestration state.

The page never receives the token, and no token appears in a URL, log line, or
local-storage entry.

## Alternatives rejected

| Alternative | Why not now |
|---|---|
| Browser opens the supervisor socket directly | Not possible from a page; the token would be in the origin. |
| Let the page hold the token and call a loopback TCP adapter | Violates the token boundary and the parent ADR 0009. |
| Electron | Solves the boundary by shipping a browser-sized runtime; the bridge is smaller. |
| Tauri | A good packaging path, but adds Rust/WebView2 before the client exists. Revisit for packaging. |
| WebSocket transport | Workable, but adds a server dependency for no capability the SSE/POST pair lacks. |
| One-shot requests + polling only | No push; live permission and event latency would be worse. The store still has a polling fallback for supervisors without streams. |

## Consequences

- The bridge is a process the operator starts explicitly. If it is not running,
  the page explains the command and offers the labelled demo instance.
- The bridge must reconnect and resubscribe; the page owns cursors and gap
  marking.
- Static serving is part of the bridge, so a production run needs `npm run build`.
- The SSE channel is same-origin and loopback-only. The supervisor token remains
  the only authority boundary.
