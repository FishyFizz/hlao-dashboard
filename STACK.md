# STACK.md — HLAO dashboard

> The dashboard is a local client for one HLAO instance: a dense, keyboard-first console that
> observes a live fleet of agent sessions and issues the same orchestration commands the CLI
> does. This document decides the language, libraries, shell, and test stack. It does not
> define the view model or the bridge protocol — those are in `contracts/protocol.md` and the
> parent `docs/protocol-stability.md`.
>
> **Verified against registries and upstream pages on 2026-10-20.**
>
> **Implemented since this decision:** the browser client, the local bridge
> (`server/bridge.mjs`, loopback HTTP + SSE + supervisor IPC), a typed frame
> surface, the external store, persistence, and Vitest model tests. Playwright
> and axe remain the next test layer. The client bundle is 782.20 kB minified /
> 231.19 kB gzip; the gallery is lazy-loaded into a 153.79 kB / 38.90 kB chunk.

## Decision

**TypeScript on Node ≥ 22.13, with React 19.3.1 and Vite 8.3.4.** Primitive behavior comes
from **React Aria Components 1.22.1**; the visual system is **hand-authored CSS** on semantic
tokens, not a utility framework. The client ships as a browser SPA served by the **local Node
bridge**, which holds the supervisor token and serves the page on loopback. Tauri is the
packaging path if a standalone app is wanted; no Rust or Electron is needed now.

The load-bearing capability is not "a web page". It is a **long-lived, high-frequency operator
surface over 10–100 live sessions**, where the two hard parts are (a) accessible, keyboard-first
controls and collection semantics, and (b) rendering a bounded but continuously growing event
log without losing position. Everything below follows from that.

The interaction contract is `docs/ux-interaction-model.md`: attention derived only from reported
state, a bounded and cursor-addressed transcript, a permission gate with no auto-answer, and no
supervisor token in the page. The stack is chosen to satisfy that contract, not novelty.

| Layer | Library | Version | Why this one |
|---|---|---|---|
| Runtime | Node.js + npm | Node ≥ 22.13 (local 26.8.1), npm 11.19.0 | The parent is already Node/TS; the bridge must speak the supervisor's local socket. No native build deps. |
| UI framework | `react` + `react-dom` | `19.3.1` (pin exact) | Largest mature ecosystem for data-heavy UIs; `useSyncExternalStore` fits an external event cache; concurrent rendering helps streaming updates. |
| Build | `vite` + `@vitejs/plugin-react` | `8.3.4` / `6.1.2` | Vite 8 is stable (2026-03-12) with Rolldown/Oxc; ~400 ms production builds here; no SSR requirement for a local app. |
| Language / check | `typescript` | `7.0.2` (pin exact) | TS 7 native compiler; `tsc --noEmit` passes against React 19.3 types. Vite/Oxc does the transpile; TS only checks. |
| Primitive behavior | `react-aria-components` | `1.22.1` (pin exact) | Stable 1.x, Apache-2.0, Adobe-maintained. Broadest coverage of the exact hard parts: Table, Tree, GridList, **Virtualizer**, Menu, Select, Dialog, Tabs, Tooltip, Meter. |
| Styling | own CSS: tokens, cascade layers, nesting, `color-mix()` | — | The aesthetic is the product. Semantic classes keep the design authority in this repo; no utility layer to fight. Zero styling dependencies. |
| Markdown | `react-markdown` + `remark-gfm` + `remark-breaks` | `10.1.0` / `4.0.1` / `4.0.0` | Unified/CommonMark renderer with GFM tables, task lists, autolinks, and chat-style soft breaks. Emits React nodes, keeps raw HTML inert, and lets the app replace images with explicit links rather than auto-loading remote content. |
| Fonts | `@fontsource-variable/geist-mono` | `5.3.0` | OFL; self-hosted (a local app must not call a CDN); one variable family for the whole UI. |
| Icons | `lucide-react` | `1.60.0` | ISC; very active (2026-10-20); tree-shakeable; 1.5px stroke with square caps overridden in CSS. |
| Shell (now) | browser + local Node bridge | — | The protocol doc's recommended shape: the process holds `supervisor.json`; the page never receives the token. |
| Shell (later) | Tauri | `2.12.3` | Small desktop packaging path if a standalone app is required. Deferred; adds Rust + WebView2. |
| Tables / virtualization (later) | `@tanstack/react-virtual` / `@tanstack/react-table` | `3.14.21` / `9.3.1` | First choice for a sortable fleet grid and a windowed transcript if RAC's own Table/Virtualizer is not enough. |
| Charts (later) | ECharts | `6.1.0` | Apache-2.0, active (2026-05-19), tree-shakeable. No chart dependency in v1; the sparkline is inline SVG. |
| State | own store + `useSyncExternalStore` | — | The event cache is small and specialized: apply full views by id, append event batches, advance cursors, ignore duplicate/out-of-order seq. No Redux/Zustand needed. |
| Routing | hash selection + `/design` path | — | Fleet/session selection is a hash route (`#/fleet`, `#/s/<id>?created=...`); the specimen is `/design`. No router dependency. Use `@tanstack/react-router` `1.170.45` if typed search params or more routes land. |
| Tests | `vitest` + `@testing-library/react` + `@playwright/test` + `@axe-core/playwright` | `5.0.5` / `16.3.3` / `1.64.1` / `4.14.0` | Vitest is installed and covers attention, sequencing, transcript coalescing, notification batching, target resolution, and the demo supervisor. Testing Library, Playwright, and axe are the next layer; the bridge-backed UI is exercised manually first. |

### Why React over the runner-up

**Svelte 5.57.2 + Vite + Bits UI 2.19.5** is the genuine runner-up. Runes are excellent for a
streaming UI, the output is smaller, and the code is shorter. It loses on the primitive layer:
Bits UI is good for overlays/forms but has no integrated Table/Tree/Virtualizer, so the two
hardest surfaces would become bespoke. React's runtime cost is acceptable because the app
renders a bounded fleet and a windowed transcript; ecosystem depth wins at this stage.

Vue 3.5.44 + Reka UI 2.11.0 is capable and mature; its data-grid/virtualization path is thinner
in TS-first React terms. Solid 1.9.17 + Kobalte 0.13.14 is pre-1.0 on the primitive side. Lit
3.3.3 is standards-clean but would mean building accessible collections and focus management
from scratch — exactly the wrong place to spend the design budget.

### Why React Aria over Base UI

Base UI is no longer an RC: **`@base-ui/react` 1.9.0** (2026-10-09, MIT) is stable, and shadcn/ui
made it its default primitive layer in July 2026. It is the closer runner-up than it looks. It
loses on coverage: no integrated Table, Tree, GridList, or Virtualizer, and Toast is not part of
the stable set. React Aria Components has all of those (Toast is exported as `UNSTABLE_Toast`,
which this project deliberately does not use). RAC's collection and focus semantics are also the
more rigorous fit for a keyboard-driven fleet console.

Radix Primitives is stable (`@radix-ui/react-dialog` 1.3.1, 2026-10-14) but is a set of split
packages with no table/tree/virtualizer. It would compose with TanStack, but that is a larger
surface to keep accessible than RAC's integrated collection components.

### Why hand-authored CSS

Tailwind CSS 4.3.3 is fast and current, but it would become a second design authority next to
the bespoke tokens. This project needs precise control over 1px rules, a hard 0 radius, square
selection marks, tabular numerals, and a small set of state colors; semantic classes and CSS
custom properties express that directly. If layout utilities become useful later, they can be
added without changing the token layer.

The palette is defined in `src/styles/tokens.css`. Dark is the default; light is a full parity
theme. `rgb(108, 210, 255)` / `#6CD2FF` is the one accent in both. In light mode, text and thin
indicators use a darkened `#056b89` so contrast holds; the bright cyan remains the fill and
selection color.

### Shell: bridge now, Tauri later

`docs/protocol-stability.md` is unambiguous: a browser page must not receive the supervisor
token. The bridge shape is:

1. A Node process reads `<HLAO_HOME>/supervisor.json`, opens the local IPC connection, and
   speaks the frame protocol.
2. It serves the built SPA on `127.0.0.1` with a loopback UI key and strict Origin checks.
3. It forwards frames (or a projection of them) to the page; it does not reimplement semantics
   (ADR 0009). The page never sees the token or opens the supervisor socket.

Electron 44.9.1 would remove the bridge but adds ~Chromium-sized install and a second runtime
model. Tauri 2.12.3 would remove the browser origin but adds Rust and WebView2. Neither is
required to design and build the client; the bridge is the least-friction correct shape and the
one the parent docs recommend. Revisit Tauri when packaging, not before.

## Caveats

- **RAC Toast is `UNSTABLE_Toast`.** The design page uses a small local toast region with
  `aria-live`; do not adopt the unstable surface without a pin and a test.
- **React 19.3.1 is one day old.** Pinned exact. If a regression appears, drop to the previous
  19.3.x patch, not to a minor.
- **TypeScript 7 is the native compiler.** It works for app type-checking (`tsc --noEmit`);
  declaration-emit tooling is where breakage has been reported. This app emits no declarations.
  Vite 8 uses Oxc for transpilation, so TS 7 is a checker, not the build.
- **Bundle size.** The client is 782.20 kB minified / 231.19 kB gzip (RAC + Lucide + React +
  unified markdown + the demo supervisor); the gallery is 153.79 kB / 38.90 kB. Vite warns above
  500 kB. This is a local app, not a network product; the gallery is lazy-loaded, and the
  markdown renderer, inspector, and charts can be split next. The demo remains in the main chunk
  because it is one click from the setup screen.
- **Fontsource copies every subset.** The browser downloads latin only via `unicode-range`, but
  the build directory includes Cyrillic/Vietnamese files. Replace with two hand-written
  `@font-face` rules if distribution size matters.
- **No token in the page.** The bridge owns `supervisor.json`; the page receives a loopback UI
  key and a projection. The page's only credentials are the bridge key and local operator state.
- **Windows-first.** Local Node is 26.8.1. No native addons. Tauri, if used, requires the Rust
  toolchain and WebView2, neither installed on this machine.
- **Accessibility is inherited, not automatic.** RAC supplies keyboard/focus semantics for its
  components; the real surfaces use semantic tables/buttons, labelled icon buttons, text status,
  focus restoration through RAC dialogs, and an assertive attention announcer. Run axe + Playwright
  against the bridge-backed UI before trusting it.

## Prior art

The category has converged on three shapes: native worktree apps (Conductor), kanban/review
boards (Vibe Kanban), and built-in or terminal dashboards (Claude Code Agent View, Claude Squad,
Emdash, Omnara). The recurring critique is that most are **launchers**: they own the session
lifecycle and cannot see sessions started by hand in a terminal.

| Prior art | Shape | What it has | What we take / reject |
|---|---|---|---|
| Conductor | macOS worktree app | Polished per-task diff review; owns lifecycle | Take density and keyboard flow; reject per-session ownership and macOS lock-in |
| Crystal | Electron parallel sessions | Multi-session overview | Deprecated Feb 2026; only the overview idea survives |
| Vibe Kanban | Web kanban | Task board → agent worktree | Orphaned Apr 2026; the board is a frozen ontology HLAO explicitly excludes |
| Claude Code Agent View | Built-in dashboard | Background sessions, isolated worktrees | Take the "one glance at all sessions" goal; reject launcher-only scope |
| Claude Squad / Emdash / Omnara | TUI, desktop, cloud | Many backends; visibility | Take local-first and cross-backend; reject their own session stores/launch paths |
| shadcn/ui, Radix Themes, Vercel Geist, Linear | Design systems | Excellent keyboard density, command palettes, tabular data | Take density, command-first interaction, status color discipline; reject pills, rounded cards, default-radius styling |
| Bloomberg-style terminals | Dense mono panels | Information per pixel | Take mono data and status lamps; reject illegible micro-type and decorative chrome |

**Our delta:** the dashboard is a **client of the supervisor's live table**, not a launcher. It
sees hand-started and agent-started sessions alike, has no per-session scope, invents no workflow
object, and keeps the protocol's honesty rules visible: cursor, `truncated`, provider capability
gating. The visual target is an instrument panel — flat, square, one cyan signal — not a
friendly kanban.

## Open questions this settles

| # | Question | Answer |
|---|---|---|
| 1 | Browser, Electron, or Tauri? | Local Node bridge + browser now; Tauri later if packaging. Token never reaches the page. |
| 2 | Framework | React 19 + Vite 8 + TypeScript 7. Svelte 5 is the runner-up and the right choice if RAC coverage becomes unnecessary. |
| 3 | Primitive layer | React Aria Components 1.22.1. Base UI 1.9.0 is the runner-up; Radix loses on coverage. |
| 4 | Styling authority | Own CSS tokens/classes. Tailwind is not rejected forever, but it is not the design authority. |
| 5 | Fleet and transcript rendering | Semantic table now; RAC Table/Virtualizer or TanStack Virtual 3.14.21 when sorting/windowing lands. |
| 6 | State | `useSyncExternalStore` + a small event cache; no store library. |
| 7 | Charts | Inline SVG for sparklines now; ECharts 6.1.0 when real charts are required. uPlot 1.6.32 is stale (2025-03-14). |
| 8 | Tests | Vitest 5 + Testing Library + Playwright 1.64 + axe-core/playwright (MPL-2.0, test-only). |

## Rejected / deferred libraries

| Library | Version (date) | Why not now |
|---|---|---|
| `@base-ui/react` | 1.9.0 (2026-10-09) | Stable and excellent; loses on Table/Tree/GridList/Virtualizer/Toast coverage. Runner-up. |
| `@radix-ui/react-dialog` + siblings | 1.3.1 (2026-10-14) | Split packages, no data collections; more assembly to keep accessible. |
| `svelte` + `bits-ui` | 5.57.2 / 2.19.5 | Best smaller-framework option; primitive coverage and ecosystem depth lose to React/RAC. |
| `vue` + `reka-ui` | 3.5.44 / 2.11.0 | Mature; React's data-grid/virtualization path is deeper for this team. |
| `solid-js` + `@kobalte/core` | 1.9.17 / 0.13.14 | Kobalte is pre-1.0; smaller ecosystem. |
| `lit` | 3.3.3 | Standards-clean, but no accessible collection/focus primitives; wrong place to spend design budget. |
| `tailwindcss` | 4.3.3 (2026-10-19) | Not the design authority; optional later for layout utilities. |
| `@phosphor-icons/react` | 2.1.10 (2025-05-22) | Stale; Lucide is active and tree-shakeable. |
| `uplot` | 1.6.32 (2025-03-14) | Fast but stale; ECharts is the active chart candidate. |
| `electron` | 44.9.1 (2026-10-20) | Heavy for a local tool; bridge is enough. Deferred, not condemned. |
| `UNSTABLE_Toast` (RAC) | 1.22.1 | Self-labeled unstable; local toast region instead. |
| `shadcn/ui` | n/a | Rounded defaults and a copy-paste ownership model; useful as reference, not as the system. |

## Version pins

```jsonc
{
  "engines": { "node": ">=22.13.0" },
  "dependencies": {
    "@fontsource-variable/geist-mono": "5.3.0",
    "lucide-react": "1.60.0",
    "react": "19.3.1",
    "react-aria-components": "1.22.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.2",
    "typescript": "7.0.2",
    "vite": "8.3.4",
    "vitest": "5.0.5"
  },
  "future": {
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.8",
    "@playwright/test": "1.64.1",
    "@axe-core/playwright": "4.14.0",
    "@tanstack/react-virtual": "3.14.21",
    "@tanstack/react-table": "9.3.1",
    "echarts": "6.1.0"
  }
}
```

## Evidence log

- Registry reads on **2026-10-20** via `npm view` for every package above: version, license, and
  last publish time. React/react-dom 19.3.1 (2026-10-19), Vite 8.3.4 (2026-10-08), TypeScript
  7.0.2 (2026-10-20), React Aria Components 1.22.1 (2026-10-09), Base UI 1.9.0 (2026-10-09),
  TanStack Virtual 3.14.21 (2026-10-16), TanStack Table 9.3.1 (2026-10-12), Lucide 1.60.0
  (2026-10-20), Fontsource 5.3.0 (2026-07-19), ECharts 6.1.0 (2026-05-19), uPlot 1.6.32
  (2025-03-14), Vitest 5.0.5 (2026-10-19), Playwright 1.64.1 (2026-10-20).
- **Vite 8** stable 2026-03-12: Rolldown is the default bundler; Oxc transforms and minifies;
  Lightning CSS minifies CSS; Node 20.19+/22.12+. (vite.dev/blog/announcing-vite8)
- **TypeScript 7** is the Go-native compiler; app type-checking works; declaration-emit
  compatibility is the known friction point. (TS 7 registry + migration notes)
- **Base UI** stable is `@base-ui/react` (not the old `@base-ui-components/react` RC); shadcn/ui
  adopted it as the default primitive layer in July 2026. (registry + 2026 comparison write-ups)
- **React Aria Components** exports `Virtualizer`, `Table`, `Tree`, `GridList`, `Meter`, and
  `ProgressBar` in 1.22.1; Toast is `UNSTABLE_Toast`. (package exports inspected locally)
- **Build:** `npm run typecheck` passes with TS 7.0.2 and `npm test` passes twenty Vitest cases.
  `npm run build` emits 782.20 kB JS / 231.19 kB gzip, a 153.79 kB / 38.90 kB lazy gallery
  chunk, and 109.89 kB CSS / 17.58 kB gzip in ~715 ms on this machine (2026-10-20).
- **Prior art:** Conductor active; Crystal deprecated Feb 2026; Vibe Kanban orphaned Apr 2026;
  Claude Code Agent View active; the launcher-vs-observer critique is recurring across the 2026
  comparison matrices. (See the survey sources gathered 2026-10-20.)
