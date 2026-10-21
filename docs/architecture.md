# Architecture — HLAO dashboard

The dashboard is a local client for one HLAO instance. The supervisor is the
only authority. The page is a projection of the wire, with a small amount of
operator state that never becomes orchestration truth.

```
browser SPA (React)
  │  POST /api/rpc, GET /api/events (SSE)
  ▼
local Node bridge (server/bridge.mjs)
  │  persistent NDJSON stream, wire major 3
  ▼
HLAO supervisor ── sessions, events, pending permissions, provider modes
```

The supervisor token is read by the bridge from `<HLAO_HOME>/supervisor.json`
and never crosses into the page. The bridge forwards results and notifications;
it does not reimplement method semantics. The one bridge-only helper,
`dashboard.fs.list`, enumerates directories for the spawn cwd picker; it never
reads file contents and is gated by the same UI key and Origin checks. The page
can also run a **demo transport** implementing the same request and notification
shapes against a simulated supervisor. Demo mode is always named in the UI.

## Modules

| Path | Responsibility | Public surface |
|---|---|---|
| `src/wire/protocol.ts` | Wire 3.1 types, capabilities, permission-queue, mode, and provider-catalog shapes, status language | types + `hasCapability`, `statusLabel` |
| `src/wire/transport.ts` | Browser bridge transport | `SupervisorTransport`, `BridgeTransport` |
| `src/demo/demoSupervisor.ts` | Simulated supervisor and demo transport | `DemoTransport` (request/notification contract) |
| `src/store/model.ts` | Pure rules: attention, grouping, event merge, formatting, target resolution, transcript coalescing | exported functions only |
| `src/store/persistence.ts` | Versioned localStorage projection | `loadPersistence`, `savePersistence`, `emptyInstanceState` |
| `src/store/store.ts` | Live state, subscriptions, actions, search, export | `store`, `DashboardState`, selectors |
| `src/app/` | Interaction surfaces and dialogs | React components |
| `server/bridge.mjs` | Loopback HTTP + SSE + supervisor IPC; stable-per-home UI key, never the supervisor token | `/api/session`, `/api/rpc`, `/api/events`, `/api/retry`, `/api/health` |

## Invariants

1. **Full views replace by session id.** A stale view (lower `lastSeq`) is
   ignored; a notification and a response may arrive in either order.
2. **Events append by `seq`.** Duplicates and out-of-order events are ignored.
   The cursor advances to the notification cursor. A gap is drawn only where
   the server reports it.
3. **Attention is structural.** Only a non-empty `pendingPermissions` queue
   (while `waiting_permission`), an unacknowledged failure, or an error-severity
   notice enters attention. No elapsed-time or content heuristic exists. The
   fleet anchor is the oldest queued request; the lens lists every request with
   its FIFO position.
4. **Local state is not authority.** Drafts, selection, read markers,
   acknowledgements, dismissed notices, filters, and preferences are keyed by
   instance and session creation time. Orchestration fields are always replaced
   from the supervisor.
5. **One instance per connection.** A handle resolves only inside the active
   home. Switching instances changes the world; nothing is merged.
6. **Transport loss is not data loss.** A stream close is a reconnect. Only a
   resume that reports `truncated` produces a history gap.
7. **The dashboard never answers a permission.** The supervisor relays every
   provider ask into `pendingPermissions`; the operator answers one request by
   `requestId` with one of the provider's offered options. There is no client or
   server policy engine. Queue-full and timeout resolutions are attributed
   events (`by: "system"` / `by: "timeout"`), never client behavior.
8. **Live bursts are coalesced.** Supervisor notifications are queued for up to
   50 ms and applied in one store pass, so a streaming agent cannot cause one
   full React render per event. Age labels share one clock. State lamps are
   static; no live surface animates indefinitely.
9. **Older history is paged automatically.** Approaching the top of the
   transcript requests the next `sessions.read { before }` page and preserves
   the scroll anchor. The local view cap is 10,000 events; reaching it is shown
   as a local limit, never as supervisor truncation.

## Liveness

The store uses one subscription for fleet views and one event scope for the
selected session. On reconnect it reloads the fleet and calls `sessions.read`
from the last loaded cursor, then resubscribes with that cursor. The store also
performs a catch-up read immediately after subscribing, because a response and
a notification that describe the same change may arrive in either order.

If `stream.subscribe` is absent, the store falls back to a two-second
`sessions.list` + `sessions.read` poll and says so in the status bar.

## Action boundaries

Every mutation is a wire request (`sessions.send`, `sessions.cancel`,
`sessions.close`, `sessions.permit`, `sessions.set_mode`, ...). The dashboard is
an operator client: it does not send `callerSessionId`, and `sessions.permit`,
`sessions.set_mode`, and a spawn `mode` are operator-only on the wire. The mode
is the provider's coarse policy; the dashboard never offers an agent-side permit
or mode action. Two actions are client assemblies and are labelled as such:

- **Close subtree** loops over `sessions.close`, deepest-first, and reports
  per-target results.
- **Instance search** loops over `sessions.read { grep }`, with visible caps and
  an as-of timestamp.

No client-side task, job, workflow, or rollup status exists.

Provider session discovery is a wire read, not a client cache. When the
supervisor advertises `backends.sessions`, the spawn form reads the provider's
own catalog on demand and joins it to the live views the dashboard already
has. A provider-only row is labelled as such; the dashboard never invents an
HLAO session for it. The read starts an adapter, so it is loaded when the
provider-session surface opens, not on every render. Without the capability,
the form keeps the manual provider-id input. The dashboard persists no
provider-to-agent mapping.

## Tests

`src/store/model.test.ts` covers attention ranking and cycling, local
acknowledgements, target resolution ambiguity, event sequencing, transcript
coalescing (including whitespace-only chunks), the demo supervisor's wire 3.1
hello/default-mode projection, and its parallel permission queue (request-id
answering, multi-pending errors, and the removed policy method).
`src/store/store.test.ts` covers the notification coalescing window.
`src/app/routing.test.ts` covers session-hash parsing and round trips.
`src/app/MarkdownText.test.tsx` covers GFM
blocks, soft breaks, code-copy controls, inert raw HTML, explicit external
links, and link-only remote images. The bridge and the real supervisor are
exercised manually against a temporary `HLAO_HOME`; Playwright/axe are the next
layer named in `STACK.md`.
