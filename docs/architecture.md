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
| `src/store/model/` | Pure rules, split by concern: `identity`, `attention`, `fleet`, `events`, `transcript`, `format`. `index.ts` is the stable barrel. | exported functions and types only; no store, transport, or DOM imports |
| `src/store/types.ts` | `DashboardState`, event-history, toast, search, and directory shapes | types + `EMPTY_EVENTS` |
| `src/store/selectors.ts` | Derived views over one state (selection, events, attention, counts, orphaned drafts, recoverable receipts) | functions; no mutation |
| `src/store/eventState.ts` | Pure page/notification → event-history transitions | `appendedReadPage`, `appendedLiveEvents`, `mergedOlderPage`, `eventsStateFromRead`, `gapFor` |
| `src/store/store.ts` | The state machine: lifecycle, fleet/subscription, notification batching, queue refresh, and public method delegation | `store`, `DashboardStore`, `DashboardState` re-exports |
| `src/store/history.ts` | Selection, transcript paging, replay/read markers, focus | `HistoryController` |
| `src/store/actionsHost.ts` | The narrow port every action module may use | `StoreActionsHost` |
| `src/store/actions/session.ts` | Selected-session operator actions (send, permit, cancel, close, rename, mode/config, queue) | `SessionActions` |
| `src/store/actions/spawn.ts` | Spawn, backend/provider discovery, recovery receipts, directory reads | `SpawnActions` |
| `src/store/actions/admin.ts` | Reload/shutdown and purely local operator state | `AdminActions` |
| `src/store/search.ts` | Client-assembled search and transcript export | `SearchActions` |
| `src/store/persistence.ts` | Versioned localStorage projection | `loadPersistence`, `savePersistence`, `emptyInstanceState` |
| `src/demo/demoSupervisor.ts` | Demo request dispatcher and transport | `DemoSupervisor`, `DemoTransport` |
| `src/demo/{support,types,world,fixtures,reads,writes,simulation}.ts` | Demo fixtures, mutable world, read/write handlers, turn simulation | module functions only |
| `src/app/transcript/` | Event frame, one file per row type, transcript view, boundary banners | React components |
| `src/app/inspector/` | Inspector shell plus one section per provider projection | React components |
| `src/app/fleet/` | Fleet home, table, rail, attention card, rail/recovery rows | React components |
| `src/app/spawn/` | Draft, resume picker, backend/provider catalog hooks, idempotency and failure shapes | React components + hooks |
| `src/app/` | Shell, dialogs, routing, shortcuts, and the remaining interaction surfaces | React components |
| `server/bridge.mjs` | Loopback HTTP + SSE entry point; stable-per-home UI key, never the supervisor token | `/api/session`, `/api/rpc`, `/api/events`, `/api/retry`, `/api/health` |
| `server/supervisor-connection.mjs` | Persistent NDJSON IPC, hello, reconnect/backoff, token | `SupervisorConnection`, `normalizeError` |
| `server/http-utils.mjs` | JSON responses, bounded bodies, static SPA serving | `sendJson`, `readBody`, `serveStatic` |
| `server/directories.mjs` | The bridge-only `dashboard.fs.list` helper | `listDirectories` |
| `server/wire.mjs` | The bridge's hello version | `WIRE` (keep in sync with `src/wire/protocol.ts`) |

### Dependency rules

1. `store/model/` is pure: it may import only `wire/protocol` types and sibling
   model modules. If a helper needs state, transport, or the DOM, it belongs in
   the store or the app layer.
2. `store/types.ts` and `store/selectors.ts` may import the model and persistence
   shapes, but never a transport or a React module.
3. Action and history modules import only their host (`StoreActionsHost` or
   `HistoryHost`); they never read private store fields. New side effects need a
   host method, not a reach-through.
4. The demo implements the wire contract; it may import pure model helpers but
   never the dashboard store, transport, or app components.
5. `server/` is Node-only and never imports `src/`. The wire version is
   deliberately duplicated in `server/wire.mjs`; update both when the contract's
   major/minor changes.
6. `src/app/` reads state through the store and rules through the model. A
   component that needs a new derived value should add a selector or model
   function rather than recomputing it locally.

### Where a change belongs

| Change | Touch |
|---|---|
| Add a wire field or method | `src/wire/protocol.ts`; then the demo dispatcher/parser and its read or write handler. The bridge forwards unknown methods without changes. |
| Add an operator action | `src/store/actions/{session,spawn,admin}.ts`; add a host method if it has a new side effect, expose it on `DashboardStore`, then wire the surface. |
| Add a fleet rule or projection | `src/store/model/fleet.ts`; add a selector only when the rule needs the whole `DashboardState`. |
| Add a transcript row type | `src/store/model/transcript.ts` (`RenderItem` + `buildRenderItems`), a row component in `src/app/transcript/`, and one dispatch line in `EventRow`. |
| Add an inspector projection | A new section in `src/app/inspector/` plus one line in `Inspector`. |
| Add a spawn parameter | The spawn/resume surface and `SpawnParams`; the demo parser is `spawnParams` in `src/demo/demoSupervisor.ts`. |
| Add a bridge endpoint | `server/bridge.mjs`; keep helpers in `http-utils`/`directories`. `server/` never imports `src/`. |
| Add or change a style rule | `src/styles/primitives/<family>.css` or `src/styles/app/<surface>.css`; keep the import order in `index.css`. |

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
supervisor advertises `backends.sessions`, the **Resume** popup reads the
provider's own catalog on demand and joins it to the live views the dashboard
already has. The picker is two columns — provider, then that provider's
sessions with search — and ends in two complete actions, **Fork copy** and
**Resume**. A provider-only row is labelled as such; the dashboard never
invents an HLAO session for it. The read starts an adapter, so it is loaded
when the popup opens, not on every render. Without the capability, the popup
keeps the manual provider-id and cwd inputs. The dashboard persists no
provider-to-agent mapping.

Recovery receipts are a separate wire read, not a catalog probe.
`recovery.receipts` returns the supervisor's historical spawn ledger with a
live attachment join; it starts no adapter and creates no session. The store
loads it on connect/resync, after a spawn, after a close/forget, and when a
live session transitions to terminal. The fleet rail filters to receipts whose
child provider id is not attached and renders them under **Recoverable**.
Clicking a row passes the exact backend/provider id/cwd/name/parent to the
Resume popup; the row's Resume button calls `sessions.spawn` with the same
fields and falls back to the prefilled popup on failure. The ledger is history,
so the group does not claim a provider conversation still exists.

Starting a new session is a separate surface. **New session** opens a
temporary draft in the main pane, shaped like the session lens it will become:
start parameters plus the composer, with a draft inspector on the right that
summarizes the pending parameters. The draft is local UI state; the supervisor
learns nothing until `sessions.spawn` succeeds. There is no pre-spawn session
row, no placeholder handle, and no task.

## Tests

`src/store/model.test.ts` covers attention ranking and cycling, local
acknowledgements, target resolution ambiguity, event sequencing, transcript
coalescing (including whitespace-only chunks), the demo supervisor's wire 3.1
hello/default-mode projection, its recovery receipt projection (attached and
provider-only rows), and its parallel permission queue (request-id answering,
multi-pending errors, and the removed policy method).
`src/store/store.test.ts` covers the notification coalescing window.
`src/store/eventState.test.ts` covers tail-page construction, dedupe/out-of-order
append, forward-gap reporting, live cursor advancement, and older-page merge.
`src/store/model/fleet.test.ts` covers fleet counts, query/ended filtering,
attention-first grouping, and the rule that attention stays visible when ended
sessions are hidden.
`src/demo/demoEngine.test.ts` covers turn start/queue/next-turn, queue drop,
spawn plus first prompt, and scoped session/event notifications.
`src/app/spawn/providerSessions.test.ts` covers provider-catalog search and the
loadable/forkable gates behind the two resume actions.
`src/app/spawn/PermissionModeField.test.ts` covers merging the mode lists
reported by live sessions into the override suggestions.
`src/app/routing.test.ts` covers session-hash parsing and round trips.
`src/app/MarkdownText.test.tsx` covers GFM
blocks, soft breaks, code-copy controls, inert raw HTML, explicit external
links, and link-only remote images. The bridge and the real supervisor are
exercised manually against a temporary `HLAO_HOME`; Playwright/axe are the next
layer named in `STACK.md`.
