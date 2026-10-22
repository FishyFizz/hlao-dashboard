# 0003 — Dashboard operator token

**Status:** accepted, 2026-10-22.

## Context

The bridge served `GET /api/session` to any peer that could reach its port, and
that response contained the per-home UI key. The key authorized `/api/rpc`,
`/api/events`, and `/api/retry`, so anyone on the port could read the fleet and
drive sessions. Origin checks fence a browser page, but not a local process, and
`--allow-remote` exposed the same unauthenticated key to the network.

The supervisor token cannot be reused for this: it is full operator authority,
must stay inside the bridge, and must never reach a browser origin (ADR 0009 in
the parent repo). The dashboard needs its own credential.

## Decision

The bridge requires an operator token on every `/api` route.

- The token comes from `HLAO_DASHBOARD_TOKEN`, `--token-file PATH`, or, when
  neither is set, a generated 48-hex token stored per home in the OS temp
  directory with mode 0600. The bridge logs the source and, for files, the path;
  it never logs the value. An explicit value that is missing or invalid is
  fatal rather than silently replaced.
- `POST /api/login` exchanges the token for a stateless signed cookie:
  `v1.<expiry>.<HMAC-SHA256>`, `HttpOnly`, `SameSite=Strict`, `Path=/api`, with a
  per-home cookie name. The signing key is derived from the token with HKDF, so
  rotating the token invalidates every outstanding session. Cookie expiry is
  seven days and survives a bridge restart.
- Non-browser callers may send `Authorization: Bearer <token>` instead. Login
  accepts the same header.
- Cookie-authenticated non-GET requests require a present, allowed `Origin`.
  Bearer callers are exempt because they carry no ambient credential. Login
  requires `application/json` for a body credential, and failures are throttled
  per peer address.
- A reverse proxy that publishes the dashboard under its own scheme, host, and
  port is allowed with `--public-origin` / `HLAO_DASHBOARD_PUBLIC_ORIGIN`. The
  value is the exact browser origin, including a non-default port. This is
  narrower than `--allow-remote`, whose Host comparison fails when a proxy
  forwards `Host` without the port.
- The UI key remains required on RPC and SSE as defense in depth, but it is
  issued only after authentication.
- The static SPA shell stays public: it contains no data. All data-bearing
  routes are gated.
- A `#token=<value>` fragment is accepted as a one-time handoff. The page reads
  and removes it synchronously before any request; fragments never reach the
  server and are not retained in history.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Bearer header only | `EventSource` cannot set headers; SSE would need the token in a query string, which leaks into URLs and logs. |
| In-memory sessions | A bridge restart would strand an open EventSource with no way to distinguish expiry from a transient outage. |
| Token in a query string or cookie value | URLs and logs retain it; a cookie holding the raw token is replayable if the browser storage is read. |
| HTTP Basic Auth | Re-sends the token on every request, cannot sign out, gates the static shell, and replaces the app's sign-in surface with a browser popup. |
| `--token VALUE` | Process listings and shell history expose argv. Environment and token files do not. |
| A separate persisted cookie-signing secret | Rotating the token would not revoke sessions; deriving from the token is simpler and stricter. |
| CORS | There is no cross-origin client. Denying foreign origins is stricter than negotiating with them. |

## Consequences

- The first load after upgrading shows a sign-in screen instead of the fleet.
- Rotating the operator token signs out every open dashboard.
- A same-user local process can read the generated token file; such a process
  can already read `supervisor.json`, so local-process isolation is unchanged.
  Windows ignores `mode: 0600`; the per-user temp directory is the protection,
  and `--token-file` lets the operator choose a stronger location.
- `--allow-remote` transports the cookie over plain HTTP. Put a TLS-terminating
  proxy in front; the bridge adds `Secure` when `X-Forwarded-Proto: https`.
- An already-open SSE stream is authenticated at connection time. Reconnects
  revalidate the cookie, and the page probes `/api/session` so an expired
  session lands on sign-in rather than an endless reconnect.
