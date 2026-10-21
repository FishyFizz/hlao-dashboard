# Design system — HLAO dashboard

There are two living surfaces. The **dashboard** at `/` is the product: fleet, session lens,
transcript, permission gate, composer, and inspector composed in `src/styles/app/`. The
**specimen** at `/design` is the primitive inventory with numbered sections. This file records
the rules both are built on, so the next screen does not have to reverse engineer them. The
interaction contract is `docs/ux-interaction-model.md`; this file is the visual system that
satisfies it.

## Intent

A local operations console for watching and steering a fleet of agent sessions. It should read
like an instrument panel, not a product landing page:

- **Flat.** No gradients, no drop shadows, no glass. Hierarchy is a surface step plus a hairline.
- **Square.** Radius is `0px`, with no exceptions. Selection marks are square. Keycaps are square.
- **Dense.** The fleet, transcript, and inspector are one screen. Mono data, tabular figures,
  compact rows, and a 9px floor for micro-labels.
- **One signal.** Cyan means live, selected, focused, or primary. It is never decoration and never
  danger.
- **Honest.** State is read, not invented. Unknown event types fall back. Truncated history is
  shown. Provider-native panels disappear when the capability is absent. Idle and settled are
  quiet, never "done".
- **Attention-first.** The fleet ranks structural blockers: waiting permission first, unacknowledged
  failure second, error notice third. Everything else stays quiet. The attention count stays
  visible in the session lens.
- **Quiet by default.** Primary surfaces carry the facts needed to act. Secondary metadata
  (cwd, agent package, cost, timestamps, creator, instance, raw lineage) lives behind a
  disclosure, never in the first read.

## Palette

Defined in `src/styles/tokens.css`. Dark is the default; light is full parity.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#0A0C0E` | `#F1F4F5` | Page canvas |
| `--panel` | `#0E1114` | `#FFFFFF` | Primary surface |
| `--raise` | `#14181C` | `#F8FAFB` | Inputs, code blocks, footer strips |
| `--hover` | `#1A2026` | `#EDF1F3` | Hover and row wash |
| `--line` | `#232A30` | `#DDE3E6` | Hairline rules |
| `--line-2` | `#343D45` | `#C3CCD1` | Control borders |
| `--text` | `#E7ECEF` | `#0B1013` | Primary text |
| `--text-2` | `#9AA5AD` | `#4E5A62` | Secondary text |
| `--text-3` | `#78848C` | `#6A767E` | Meta text |
| `--accent` | `#6CD2FF` | `#6CD2FF` | Fill, lamp, focus on dark |
| `--accent-text` | `#6CD2FF` | `#056B89` | Accent text / thin indicators |
| `--accent-ink` | `#05151D` | `#04141C` | Text on an accent fill |
| `--ok` | `#63E6A8` | `#067A4B` | Idle, completed, settled |
| `--warn` | `#FFC24B` | `#8A5300` | Permission, threshold |
| `--danger` | `#FF6B6B` | `#B42318` | Failure, destructive |
| `--focus` | `#6CD2FF` | `#056B89` | Keyboard focus ring |

The accent is the user-provided `rgb(108, 210, 255)`. Light mode darkens accent **text** to
`#056B89` so 10px labels meet contrast; the bright cyan still carries fills, selection, and lamps.

## Type

One family, one voice:

- **Geist Mono Variable** ? all UI text: names, prose, messages, labels, data, IDs, state,
  timestamps, costs, keycaps, and commands.

| Role | Size | Notes |
|---|---|---|
| Display | 44?56px | Geist Mono 500, `-0.04em`, `0.98` line height |
| Section title | 24px | Geist Mono 500, `-0.025em` |
| Dialog / heading | 16px | Geist Mono 500, `-0.01em` |
| Body | 13?14px | Geist Mono 400, `1.55?1.65` |
| Dense UI | 12px | table cells, buttons, menus |
| Data | 9?11px | tabular numerals, slashed zero |
| Labels | 9?10px | mono 500, uppercase, `0.09em` tracking |

Rules:

- All identifiers use the exact case the protocol gives them. `#4f2a9c` never becomes `#4F2A9C`
  inside a meta line; use `.handle` / `.ident` to opt out of an uppercase parent.
- Numbers are tabular (`font-variant-numeric: tabular-nums slashed-zero`).
- Uppercase is for labels and states, not for prose, commands, names, or paths.

## Geometry

- **Radius:** `0px` everywhere. `border-radius: 0` is global in the reset.
- **Rules:** 1px hairline for separation; 2px only for state (`event--user`, selected row,
  active tab, selected nav item, notice bar).
- **Grid:** 4px base, used at 4/8/12/16/20/24/32/40/48/64/80.
- **Controls:** 26px small, 30px default, 32px inputs, 36px large.
- **Elevation:** none. Four surfaces (`bg`, `panel`, `raise`, `hover`) and a border. Overlays use
  a flat backdrop and a 1px border; no shadow.
- **Icons:** Lucide, 14px, 1.5px stroke, `stroke-linecap: square`, `stroke-linejoin: miter`.

## Components

| Family | Classes / components | File |
|---|---|---|
| Buttons | `.btn`, `.btn--primary/ghost/danger`, `.btn--sm/lg/icon`, `.btn-group` | `styles/primitives/buttons.css` |
| Fields | `.field`, `.field__input`, `.field__textarea`, `.select__*` | `styles/primitives/fields.css` |
| Selection | `.check`, `.radio-card`, `.switch`, `.slider` | `styles/primitives/selection.css` |
| Navigation | `.tabs`, `.segmented`, `.breadcrumbs`, `.pagination` | `styles/primitives/navigation.css` |
| Status | `.status`, `.lamp`, `.tag`, `.kbd`, `.handle` | `styles/primitives/status.css` |
| Fleet | `.table-wrap`, `.table`, `.table__*` | `styles/primitives/table.css` |
| Transcript | `.transcript`, `.event`, `.tool`, `.permission-card`, `.plan`, `.notice`, `.compaction`, `.message-route` | `styles/primitives/transcript.css`, `markdown.css` |
| Meters | `.meter`, `.stat`, `.spark` | `styles/primitives/meters.css` |
| Lineage | `.tree`, `.tree__*` | `styles/primitives/lineage.css` |
| Overlays | `.modal-overlay`, `.dialog`, `.popover`, `.menu`, `.tooltip` | `styles/primitives/overlays.css` |
| Feedback | `.toast`, `.banner`, `.empty` | `styles/primitives/overlays.css` |
| Palette | `.palette`, `.palette__*` | `styles/primitives/palette.css` |
| Console | `.console`, `.console__*` | `styles/primitives/composition.css` |
| Application shell | `.dash`, `.dash-top`, `.dash-body`, `.dash-rail`, `.dash-main`, `.dash-inspector`, `.dash-status` | `styles/app/shell.css` |
| Fleet rail | `.rail-*`, attention cards, fleet home table, orphaned drafts | `styles/app/fleet-rail.css`, `fleet-home.css` |
| Session lens | `.session-*`, `.permission-gate`, `.state-strip`, `.transcript-*`, `.composer`, `.queue-*` | `styles/app/session-lens.css`, `permission-gate.css`, `transcript.css`, `composer.css` |
| Inspector | `.inspector__*`, config toggles, lineage counts | `styles/app/inspector.css` |
| Setup | `.setup__*`, `.boot`, error boundary | `styles/app/setup.css`, `boot.css` |
| Gallery chrome | topbar, sidebar, hero, section, specimen, swatches, type rows | `styles/gallery.css` |

Thin React wrappers live in `src/components/` (`Button`, `IconButton`, `Status`, `Tag`, `Kbd`,
`Handle`, `Section`, `Specimen`, `BrandMark`, `Notice`). Everything else is RAC + semantic HTML
styled by class.

## State and interaction

- **Focus:** 1px `--focus` outline, 2px offset. Inputs use a 1px accent border. No glow.
- **Hover:** background steps to `--hover`; borders step to `--text-3` on fields.
- **Selected:** cyan wash + a 2px left rule. The same shape is used on rows, nav, palette, and
  radio cards.
- **Disabled:** text drops to `--text-3`, borders to `--line`, cursor `not-allowed`; checked
  disabled marks fade the check.
- **Motion:** 120ms hover, 180ms overlay, 260ms maximum. Finite transitions only; live state
  lamps are static fills or outlines so a long-lived fleet view never asks the compositor to
  re-raster continuously. `prefers-reduced-motion` collapses all durations.
- **Overlays:** dialogs are one decision per panel; menus carry shortcuts; tooltips explain but
  never take focus. Backdrop is a flat wash.
- **Toasts:** confirm an operator action; banners describe a condition. Neither is used for
  progress. The design uses a local `aria-live` region, not RAC's unstable Toast.

## Domain mapping

- **Status** is rendered as a lamp + mono label, never color alone. Six states:
  `starting` ("Starting", hollow cyan), `idle` ("Idle", green), `busy` ("Running", solid cyan),
  `waiting_permission` ("Waiting for permission", hollow amber), `failed` ("Failed", red),
  `closed` ("Closed", gray). An idle session with queued prompts says so; `settled` means "no
  active turn · queue empty", never done.
- **Attention order** is structural, not content-based: waiting permission (oldest first),
  unacknowledged failure (newest first), error notice (newest first), then the operator's sort.
  The table footer and the console bar carry the attention count.
- **Event rows** are keyed by `type`, with a generic fallback for unknown types. Do not require
  `data.raw`; treat `EventView.data` as an open object.
- **Transcript** keeps seq + time in a 46px gutter. The left 2px bar marks actor/state:
  operator prompt (cyan), permission (amber), notice (amber), error (red), inter-session message
  (cyan with a wash).
- **Permission gate** lists every queued provider request with its FIFO position and the
  provider's options exactly as named. No option is visually preselected as allow. Each button
  answers only the request it names by `requestId`/`optionId`; the provider's own
  `allow_always`/`reject_always` option is a normal option, not an HLAO policy change. The
  dashboard never auto-answers; queue-full and timeout resolutions are attributed events from
  the supervisor.
- **Provider mode is the coarse policy.** The inspector's mode control is operator-only and
  shows the session's advertised values plus the backend's `defaultMode`. There is no separate
  HLAO policy selector to style or explain.
- **Usage** is the latest reported snapshot, not a cumulative bill or a total token count. Label
  it "reported".
- **Provider-native state** (compaction, plan, title, agent identity, messages) gets a slot that
  can be hidden. A missing capability renders the base view, not an error. Instance identity
  (label + home path) is always visible.
- **Truncation** must be a visible banner/notice in the transcript, not a silent gap.
- **Lineage** is context, not authority: the tree is read from `parentId`/`rootId`/`depth` and
  never gates addressing. Every session in the instance is addressable by every caller.
- **The shell** is one screen: fleet rail, main lens, inspector. The inspector is a details
  surface, not a second source of truth; below 1180px it becomes a dialog. The rail is a
  navigator, not a scope: every row still addresses a session.
- **Attention cards** are structural summaries, not notifications. They always name the session
  and handle, show age from the server timestamp, and expose the next action (answer, inspect,
  acknowledge, dismiss). No card invents importance.
- **The demo** uses the same components and states as a real instance, but carries a persistent
  `demo` tag and banner. Simulated data is never shown without that label.
- **Setup** is a state, not a landing page: no fleet scaffold, no sample rows, no fake activity.
  The instance home, the error code, and the next valid action are always visible.

## Do / don't

Do:

- Use one primary action per view; the cyan fill is scarce.
- Order the fleet by attention; keep the selected row selected as updates arrive.
- Let a 1px rule separate; if it still needs a shadow, the surface step is wrong.
- Keep the fleet a table and the transcript a list. The fleet is not a card wall.
- Preserve identifier case and use tabular figures. Use `.ident` inside uppercase parents.
- Hide a provider panel when its capability is absent.
- Keep every queued permission request and its provider options visually equal; each option
  answers only the request it names, and "always" is the provider's own option rather than a
  hidden policy modifier.
- Say "reported" for cost and usage; say "quiet" or "idle" for a session with no active turn.

Don't:

- Round a corner, add a gradient, or add a drop shadow.
- Use cyan for failure, warning, or decoration.
- Wrap a status in a colored pill or use color as the only signal.
- Uppercase a command, path, name, or identifier.
- Make "Allow" the primary action on a permission card, collapse a multi-request queue into one
  unexplained choice, or imply idle/settled is completion.
- Label the latest cost snapshot as a session total or a bill.
- Invent a second protocol, a session store, or a kanban ontology in the client.

## Accessibility

- Interactive behavior comes from React Aria Components; the gallery's static tables and
  transcripts are semantic HTML (not a substitute for testing the real client).
- Focus is always visible; keyboard order follows the visual order.
- Light-theme accent text, status text, and meta text are darkened for contrast. Bright cyan is
  reserved for fills and lamps.
- Toasts use `aria-live="polite"`; dialogs are labelled by their heading; status labels are text,
  not `title`-only.
- Test the real bridge-backed UI with Playwright + `@axe-core/playwright` before trusting it.
