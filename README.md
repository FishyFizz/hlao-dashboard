# HLAO dashboard

A local dashboard for an HLAO instance. It is a **client**, not core: it speaks the supervisor's
socket protocol and uses no private access. It can be replaced or omitted without changing the
supervisor.

**Status: design primitives bootstrap.** The stack is selected and pinned (`STACK.md`), the
visual system and its specimen page are implemented in both themes, and the build is green.
There is **no socket client, no bridge, no token handling, and no business logic yet** — this
tree is the design foundation and project shape the client will be built on.

The interaction contract is `docs/ux-interaction-model.md` (requirements draft, 2026-10-20).
This bootstrap implements the visual primitives that satisfy it; it does not implement its
behavior. The specimen data is deliberately fake and clearly labelled — the real app starts
empty.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit (TypeScript 7)
npm run build      # typecheck + Vite production build
npm run preview
```

Node ≥ 22.13 (local: 26.8.1). No native dependencies. The only persistence is the light/dark
theme preference in `localStorage`.

## What is implemented

- **Stack:** React 19.3.1 + Vite 8.3.4 + TypeScript 7.0.2, with React Aria Components 1.22.1
  for accessible primitive behavior and hand-authored CSS for the visual system. Full decision,
  versions, runner-ups, caveats, and evidence in `STACK.md`.
- **Design system:** tokens, typography, geometry, motion, controls, navigation, status,
  fleet table, transcript event shapes, meters, lineage, overlays, feedback, command palette,
  and a full session-console composition. Rules and the token table are in `DESIGN.md`.
- **UX alignment:** the fleet is ordered by structural attention (waiting permission, then
  unacknowledged failure); `busy` renders as "Running"; `waiting_permission` as "Waiting for
  permission"; idle and settled are never "done". The permission gate has no primary "Allow",
  usage is labelled as a reported snapshot, and the instance identity is visible.
- **Specimen page:** `src/App.tsx` renders 17 numbered sections with a sticky section nav and a
  dark/light toggle. The page is the living documentation.
- **Checks:** `npm run typecheck` passes; `npm run build` emits the SPA.

## Rules this client is built against

From `docs/protocol-stability.md` and `contracts/protocol.md` (HLAO 0.11, wire protocol 2.5):

- Require wire **major 2** and feature-detect `hello.capabilities`. Do not key behavior off the
  HLAO package version or a minor number.
- Run as a **local process** that can open the named pipe / Unix socket and read the token from
  `<HLAO_HOME>/supervisor.json`. If a browser front end is added, it talks to a local bridge and
  never receives the supervisor token.
- Treat event `data` as an open object and leave room for the provider-state fields added in
  0.11: compaction, plan, title, agent identity, and messages.
- A stream close is not data loss until resume from the last cursor reports `truncated`.

The chosen shape is a local Node bridge serving this SPA on loopback: the bridge holds the token
and speaks frames; the page gets a projection, never `supervisor.json`. This is the recommended
shape in the parent protocol doc and the forwarding rule in ADR 0009.

The design system also follows the interaction model's honesty rules: attention is derived only
from reported state, unknown events fall back, truncation is marked, usage is a snapshot, and the
permission gate never auto-answers or visually preselects "Allow".

## Layout

```
contracts/protocol.md        pinned copy of the parent wire contract (wire 2.5)
docs/ux-interaction-model.md interaction contract: attention, honesty, surfaces, edge cases
STACK.md                     language/library decision with evidence and version pins
DESIGN.md                    design principles, tokens, component inventory, do/don't
index.html                   Vite entry
src/main.tsx                 fonts + styles + React root
src/App.tsx                  topbar, sidebar, hero, theme toggle, section composition
src/components/              Button, IconButton, Status, Tag, Kbd, Handle, Section, Specimen
src/gallery/                 Foundations, Controls, DataDisplay, Surfaces, Compositions
src/styles/tokens.css        dark/light tokens, type, space, motion, layers
src/styles/base.css          reset, focus, scrollbars, utilities
src/styles/primitives.css    the component system
src/styles/gallery.css       specimen-page chrome and responsive rules
src/data/fleet.ts            static fleet demo data and section nav
favicon.svg                  square mark
```

`contracts/protocol.md` is a **pinned copy**, not an import. It corresponds to the parent repo at
commit `52402c7` (wire protocol 2.5, 2026-10-20). Re-sync it deliberately when the parent contract
changes and this client handles the delta; do not edit it here to describe a local variant.

## Deliberately not implemented yet

- The local bridge, its per-run UI secret, Origin checks, and frame forwarding.
- A typed frame client, reconnect/since-resume, truncation handling, and the event cache.
- Real fleet/transcript data, sorting, filtering, virtualization, and charts.
- Tests. The next test stack is named in `STACK.md`: Vitest 5 + Testing Library + Playwright 1.64
  + axe-core/playwright.
- Tauri packaging. Deferred until the bridge-backed app exists.

The design page contains static specimens and local UI state only (tabs, menus, dialogs, toasts,
theme). It never opens the supervisor socket and never reads `HLAO_HOME`.

## Relationship to the parent repo

This is a separate git repository, checked out under the HLAO working tree for convenience. The
parent repo ignores this directory. The contract is copied rather than referenced so this project
can move out to its own checkout or remote without rewriting history.

## Non-goals for now

- No changes to the supervisor or the wire protocol.
- No second protocol or semantic reimplementation in the bridge; it forwards frames.
- No token in the page, no token in a URL, no token in client storage.
- No durable client-side session store; the supervisor's live table is the truth.
