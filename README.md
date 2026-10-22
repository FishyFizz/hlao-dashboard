# HLAO dashboard

A local operations console for one HLAO instance. It is a **client**, not core:
it speaks wire protocol 3.1 through the supervisor's local socket and adds no
server semantics. It can be replaced or omitted without changing the supervisor.

**Status: working client.** The fleet, session lens, operator permission relay,
transcript, composer/queue, spawn, search, lifecycle actions, local persistence,
and reconnect paths are implemented. A local Node bridge holds the supervisor
token; the page never receives it. A clearly labelled demo supervisor can be
opened when no real instance is available. The interactive specimen remains at
`/design`.

The interaction contract is `docs/ux-interaction-model.md`. The visual system is
`DESIGN.md`; the stack decision is `STACK.md`; module boundaries and invariants
are in `docs/architecture.md`.

## Run

Node ≥ 22.13 (local: 26.8.1). No native dependencies.

### With a real HLAO instance

```bash
npm install
npm run build
npm run bridge -- --home "C:\path\to\HLAO_HOME"
# open http://127.0.0.1:4780
```

The bridge reads `<HLAO_HOME>/supervisor.json`, opens the supervisor's named
pipe or Unix socket, and serves `dist/` on loopback. If no supervisor is running,
start one in a terminal (`hlao list --all`) and retry. The dashboard does not
silently autostart or stop the supervisor.

The dashboard is gated by an operator token, which is separate from the
supervisor token. Without configuration the bridge generates one per home,
stores it with owner-only permissions in the OS temp directory, and logs its
path:

```
auth operator token from C:\Users\<you>\AppData\Local\Temp\hlao-dashboard-<hash>.token
```

Open the page and paste the file's single line into the sign-in screen. To supply
the token yourself, set `HLAO_DASHBOARD_TOKEN` or pass `--token-file PATH`. A
`#token=<value>` fragment is also accepted as a one-time link; the page removes it
before the first request. The bridge never logs the token value. Signing in sets
an `HttpOnly`, `SameSite=Strict` cookie scoped to `/api`; rotating the token
invalidates every open session.

Behind a reverse proxy, allow the exact browser origin with `--public-origin`
(repeatable) or `HLAO_DASHBOARD_PUBLIC_ORIGIN` (comma-separated):

```bash
npm run bridge -- --home "C:\path\to\HLAO_HOME" \
  --public-origin https://agentgate.example.net:8795
```

Use the origin the browser shows, including a non-default port. This is narrower
than `--allow-remote`, which trusts any origin whose host matches the forwarded
`Host` header. Nginx/proxy configs must forward `X-Forwarded-Proto` so the
session cookie is marked `Secure`.

Default home is `%USERPROFILE%\.hlao` (or `$HOME/.hlao`). `HLAO_HOME` is
honoured when `--home` is omitted.

### Development

One command starts the bridge and the Vite dev server, and passes the home
through to the bridge:

```bash
npm start -- --home "C:\path\to\HLAO_HOME"
# bridge http://127.0.0.1:4780 · app http://127.0.0.1:5173 · Ctrl-C stops both
```

`HLAO_HOME` works instead of `--home`; `--vite-port N` changes only the Vite
port (the bridge stays on 4780 because `vite.config.ts` proxies `/api` there).
`--token-file PATH` supplies the dashboard token; otherwise the bridge prints
the generated token file path. The bridge does not autostart a supervisor, so
start HLAO first in another terminal (`hlao list --all`).

The two processes can still be run separately:

```bash
npm run bridge -- --home "C:\path\to\HLAO_HOME" --vite-port 5173   # API only, port 4780
npm run dev                                                        # http://localhost:5173
```

Vite proxies `/api` to the bridge. The bridge also serves the built SPA for a
production run. `--vite-port` adds that Vite origin to the bridge's allowlist;
`npm start` passes it automatically.

### Demo

No supervisor is required. Run the SPA (dev or bridge) and choose **Explore demo
instance** on the setup screen, or open `?demo=1`. The strip at the top says the
instance is simulated, and every surface treats it as a supervisor for exercising
the interaction model. It is not a real process and no work executes.

### Checks

```bash
npm start -- --home DIR   # bridge + Vite together, Ctrl-C stops both
npm run typecheck   # tsc --noEmit (TypeScript 7)
npm test            # Vitest: attention, fleet grouping, event history, transcript coalescing, routing, spawn gates, demo engine
npm run build       # typecheck + Vite production build
npm run preview     # preview the built SPA without the bridge (setup screen)
```

## What is implemented

### Fleet (home)

- Structural attention: waiting permission (oldest first), unacknowledged failure
  (newest first), error-severity notice (newest first). Everything else is quiet.
- Attention is always pinned. Running, Quiet, and Closed are collapsible views,
  not scopes.
- Live/retained counts, filter, sort, explicit re-sort, unread markers, and a
  rendered order that is stable across activity updates. Re-sorting is explicit
  or caused by a group/rank transition.
- Every row carries a status lamp, display label, exact handle, turn, queue depth,
  last event, and age. Unknown values say "not reported".
- Empty states: no sessions, no attention, no filter matches, disconnected.

### Session lens

- Identity plus summary facts: provider mode, pending permissions, turn, queue,
  context, last event, and unread. Backend, cwd, agent package, cost, creator,
  timestamps, instance, and the backend's operator default mode live behind a
  local **More** disclosure.
- **Permission relay**: the provider's options exactly as named, no preselected
  allow, and no auto-answer. Every ask is parked by the supervisor and answered
  one request at a time with `sessions.permit { requestId, optionId }`.
  Parallel asks queue FIFO with their position shown; the queue is bounded and
  a one-shot `permissionTimeoutMs` deadline fails closed (or parks when `0`).
  "Always" is only the provider's own `allow_always`/`reject_always` option,
  never a change to HLAO state.
- **Transcript**: turn skeleton, coalesced message chunks, safe GitHub-flavored
  Markdown for agent, prompt, user, and inter-session messages, copyable code
  blocks, one tool row updated in place (click the header to inspect its
  payload), permission request/reply pairs collapsed into one row, provider
  notice rows, unknown-type fallback with inspectable data. Raw HTML stays
  inert, external links open explicitly, and remote images are links rather
  than auto-loads. A collapsed **Thought** shows the latest streamed line, not
  just a character count. One transcript mode control replaces the old
  independent toggle: **Default** hides usage, plan, compaction, commands,
  stderr, and session metadata; **System** shows them; **Minimal** keeps the
  conversation and collapses the work between messages into one row with tool,
  MCP, and thought counts plus the latest tool name or thought line. Opening
  that row restores the individual events. Failures, notices, and discarded
  prompts never collapse.
  Tail-follow only at the bottom;
  last-read divider, new-events affordance, automatic backward paging as the
  view approaches the top, and visible truncation/gap markers.
- **Provider identity and recovered history**: the durable provider session id
  is shown in Diagnostics and printed by spawn. The **Resume** action opens a
  provider-session popup that can resume or fork it (`spawn.resume` /
  `spawn.fork`), and the Inspector offers both. When the supervisor advertises
  `backends.sessions` (wire 3.1), that popup reads the provider's own catalog:
  providers are the left column, their sessions the right, with search; rows
  show title, cwd, age, and whether this instance already drives them. A
  provider-only row can be adopted, which creates a new HLAO session and keeps
  the provider's cwd and mode. A resume or fork keeps the provider's persisted
  mode. Events restored by ACP `session/load` are marked `history` in the gutter
  and are not counted as new activity. When the live log evicts, the transcript
  banner explains that the provider still holds the record and can fork it into
  a new session with the full history.
- **Composer and queue**: drafts per session, multi-line text, explicit send,
  queue when busy or permission-parked, idempotent retry, message-id
  reconciliation, queue previews, and permanent drop confirmation. Ended
  sessions disable the composer with the reason and preserve the draft.
- **Actions**: rename, stop with keep/discard queue, close (with advanced force),
  close subtree as a labelled assembly, forget with history-loss warning and
  export, export as paged JSON, copy handle, and copy the read command as CLI.
- **Provider panels**: the provider mode and config options are separate
  provider-native layers. The mode is the coarse permission policy and is
  operator-only; the control shows `modes.currentModeId`, the advertised modes,
  and the backend's `defaultMode` from `backends.list`. There is no HLAO policy
  selector. Effort options use a cyan-filled segmented bar. Plan and compaction
  are read-only. Usage is labelled as the latest reported snapshot.

### Spawn, resume, search, keyboard

- **New session** opens a temporary draft in the session pane, not a modal. It
  looks like the session it will become: a header, a draft body with start
  parameters (backend/name/cwd, bridge-backed cwd browsing, lineage-only
  parent, permission-mode override, skill toggle), and the same composer. The
  first prompt and the start action are one gesture; an empty prompt starts a
  session with no first turn. The right-hand inspector summarizes the draft’s
  parameters. The draft keeps an idempotency key per attempt and preserves the
  text plus adapter stderr on failure. The permission-mode field is free text
  with suggestions from modes reported by live sessions of the same backend;
  other provider options are set after the session starts, from the values it
  advertises.
- **Resume or fork** is a separate popup, with a different shape: a two-column
  picker lists providers on the left and that provider's catalog sessions on
  the right, searchable by id, title, or cwd. Rows show the provider id, cwd,
  age, live HLAO attachment, and whether the adapter allows loading/forking.
  Below the picker are the resume parameters (name, parent, permission-mode
  override, skill) and two complete buttons, **Fork copy** and **Resume** — no
  mode-selection step. A selected row supplies its cwd. The manual id/cwd entry
  remains for an older supervisor or an unlisted row. Empty permission mode
  keeps the provider’s persisted mode; an override is sent only when typed and
  is suggested from modes the same backend has reported.
- **Recoverable** is a dedicated fleet-rail group fed by
  `recovery.receipts`: historical spawn receipts whose child provider id is not
  currently attached. Each row shows the recorded name, backend, cwd, provider
  id, and the live parent when one exists. Clicking the row opens the Resume
  dialog prefilled with the exact backend, provider id, cwd, name, and parent;
  its **Resume** button skips the dialog and reattaches with those settings. A
  quick-resume failure opens the prefilled dialog instead of losing context.
  The group has its own refresh control; it is history, not a liveness view.
- Search has two explicit scopes (current session, instance), live/retained and
  raw-payload filters, visible caps and as-of time, cancellable scans, and
  provenance (session, handle, seq, time, type, snippet). Selecting a result
  opens that event in context.
- Command palette (`Ctrl/Cmd+K`) covers navigation, starting a session,
  resuming from a provider catalog, search, attention, selected-session
  actions, theme, help, retry, and demo/real switching. It shows the exact
  target and does not silently resolve ambiguous names.
- Keyboard: `Ctrl/Cmd+K` palette, `Ctrl/Cmd+N` new-session draft,
  `Ctrl/Cmd+Shift+F` search, `J`/`K` next/previous attention, `Esc` leaves a
  transient state or returns to the fleet, `Ctrl/Cmd+Enter` sends or starts.
  All intents are also in the palette; the shortcut set is documented in Help.

### Connection, persistence, honesty

- The bridge owns the supervisor token and a separate dashboard operator token.
  Every `/api` route requires a signed, `HttpOnly`, `SameSite=Strict` session
  cookie (or a bearer token for scripts). Once authenticated, the bridge also
  issues the loopback UI key used by RPC and SSE; the key is stable per home so
  an open EventSource survives a bridge restart. Origin checks remain the browser
  fence, and cookie-authenticated state changes require an allowed Origin. The
  page never sees `supervisor.json`.
- Full session views replace by handle; events append by `seq`; responses and
  notifications may arrive in either order. Reconnect reloads the fleet,
  resumes with cursors, and marks only server-reported gaps.
- Supervisor restart clears the live world, surfaces `lastCrash` once, and leaves
  drafts/read markers as local state; drafts whose target is gone are shown as
  orphaned and are never retargeted.
- Local state is keyed by instance plus handle and `createdAt`: selection,
  drafts, `lastSeenSeq`, acknowledgements, dismissed notices, filters, theme,
  last backend/cwd, and notification preference. "Clear local state" is explicit.
- OS notifications only while the window exists, only when unfocused, only for
  permission/failure (and optionally error notices), coalesced per state, and
  cleared when the state resolves. The dashboard never notifies "done".

## Deliberately not implemented

- A scheduler, task board, kanban, workflow graph, or rollup status.
- A durable transcript store, crash recovery, or a background daemon.
- Cross-instance federation or a global registry.
- File/image attachments or any payload channel beyond orchestration text.
- Provider subagent trees, a terminal emulator, or raw stdout UI.
- A pre-spawn provider model/mode picker when the provider cannot enumerate
  values before a session exists. The form shows the backend's `defaultMode`;
  set a different mode after spawn from the advertised values. The wire's
  operator-only `sessions.spawn.mode` is not exposed here.
- Virtualized transcript rendering beyond the bounded page model. A session with
  a very large retained log auto-loads earlier pages as the view approaches the
  top (local cap 10,000 events); virtualization is the next scale seam if
  thousands of rows must stay rendered at once.
- Playwright/axe and Tauri packaging. The bridge-backed UI has been exercised
  manually; the browser test stack is named in `STACK.md`.

## Layout

```
contracts/protocol.md        pinned wire contract (protocol 3.1)
docs/ux-interaction-model.md interaction contract
docs/architecture.md         module map, invariants, liveness, action boundaries
docs/adr/                    bridge and demo decisions
STACK.md                     language/library decision and evidence
DESIGN.md                    visual system and component inventory
server/bridge.mjs            loopback HTTP + SSE entry point, auth gate
server/auth.mjs              operator token resolution and signed session cookies
server/supervisor-connection.mjs  supervisor IPC, hello, reconnect, token
server/http-utils.mjs        JSON/static responses and bounded bodies
server/directories.mjs       dashboard.fs.list (directory names only)
server/wire.mjs              bridge hello version (keep in sync with protocol.ts)
server/dev.mjs               one-command bridge + Vite launcher
src/wire/protocol.ts         wire types and capabilities
src/wire/transport.ts        browser bridge transport
src/demo/                    demo dispatcher, fixtures, world, reads, writes, simulation
src/store/model/             pure identity, attention, fleet, event, transcript, format rules
src/store/store.ts           state machine; actions live in src/store/actions/
src/store/eventState.ts      pure event-history transitions
src/store/{types,selectors,search,persistence}.ts
src/app/transcript/          event frame, row types, transcript view, banners
src/app/inspector/           inspector shell and one section per projection
src/app/fleet/               fleet home, table, rail, attention and recovery rows
src/app/spawn/               spawn draft, resume picker, backend/provider catalogs
src/app/                     shell, dialogs, routing, shortcuts, composer
src/gallery/                 the design specimen at /design
src/styles/                  tokens, base, primitives/, app/, gallery
src/data/fleet.ts            static specimen data (gallery only)
```

## Rules this client is built against

From `docs/protocol-stability.md` and `contracts/protocol.md` (HLAO 0.16, wire 3.1):

- Require wire **major 3** and feature-detect `hello.capabilities`. Do not key
  behavior off the HLAO package version or a minor number.
- The dashboard is an operator client: it never sends `callerSessionId`, never
  answers a permission automatically, and never offers an agent-side permit or
  mode action.
- Run as a local process that can open the named pipe / Unix socket and read the
  token from `<HLAO_HOME>/supervisor.json`. The browser talks to the local bridge
  and never receives the token.
- Treat event `data` as an open object. Unknown event types render generically
  and remain inspectable; no renderer depends on `raw`.
- A stream close is not data loss until a resume from the last cursor reports
  `truncated`.
- Read-only mode, if added, is a local guard. It is not a security boundary; the
  token remains full authority.

## Relationship to the parent repo

This is a separate git repository, checked out under the HLAO working tree for
convenience. The parent repo ignores this directory. `contracts/protocol.md` is a
pinned copy, not an import; re-sync it deliberately when the parent contract
changes.

## Non-goals for now

- No changes to the supervisor or the wire protocol.
- No second protocol or semantic reimplementation in the bridge; it forwards
  frames.
- No supervisor token in the page, a URL, a log line, or client storage. The
  dashboard operator token is a separate credential: it is exchanged for an
  `HttpOnly` cookie and is never persisted by the page.
- No durable client-side session store; the supervisor's live table is truth.
- No token-bearing cross-origin API; the bridge is loopback-only unless
  `--allow-remote` is explicit, and that mode needs TLS in front.
