# Design system — HLAO dashboard

The living specimen is the app itself: `npm run dev`, then scroll the numbered sections. This
file records the rules the specimen is built on, so the next screen does not have to reverse
engineer them. The interaction contract is `docs/ux-interaction-model.md`; this file is the
visual system that satisfies it.

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

Two families, one voice:

- **Geist Variable** — names, prose, messages, dialog titles.
- **Geist Mono Variable** — IDs, state, timestamps, counts, costs, labels, keycaps, commands.

| Role | Size | Notes |
|---|---|---|
| Display | 44–56px | Geist 500, `-0.04em`, `0.98` line height |
| Section title | 24px | Geist 500, `-0.025em` |
| Dialog / heading | 16px | Geist 500, `-0.01em` |
| Body | 13–14px | Geist 400, `1.55–1.65` |
| Dense UI | 12px | table cells, buttons, menus |
| Mono data | 9–11px | tabular numerals, slashed zero |
| Labels | 9–10px | mono 500, uppercase, `0.09em` tracking |

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
| Buttons | `.btn`, `.btn--primary/ghost/danger`, `.btn--sm/lg/icon`, `.btn-group` | `styles/primitives.css` |
| Fields | `.field`, `.field__input`, `.field__textarea`, `.select__*` | `styles/primitives.css` |
| Selection | `.check`, `.radio-card`, `.switch`, `.slider` | `styles/primitives.css` |
| Navigation | `.tabs`, `.segmented`, `.breadcrumbs`, `.pagination` | `styles/primitives.css` |
| Status | `.status`, `.lamp`, `.tag`, `.kbd`, `.handle` | `styles/primitives.css` |
| Fleet | `.table-wrap`, `.table`, `.table__*` | `styles/primitives.css` |
| Transcript | `.transcript`, `.event`, `.tool`, `.permission-card`, `.plan`, `.notice`, `.compaction`, `.message-route` | `styles/primitives.css` |
| Meters | `.meter`, `.stat`, `.spark` | `styles/primitives.css` |
| Lineage | `.tree`, `.tree__*` | `styles/primitives.css` |
| Overlays | `.modal-overlay`, `.dialog`, `.popover`, `.menu`, `.tooltip` | `styles/primitives.css` |
| Feedback | `.toast`, `.banner`, `.empty` | `styles/primitives.css` |
| Palette | `.palette`, `.palette__*` | `styles/primitives.css` |
| Console | `.console`, `.console__*` | `styles/primitives.css` |
| Gallery chrome | topbar, sidebar, hero, section, specimen, swatches, type rows | `styles/gallery.css` |

Thin React wrappers live in `src/components/` (`Button`, `IconButton`, `Status`, `Tag`, `Kbd`,
`Handle`, `Section`, `Specimen`). Everything else is RAC + semantic HTML styled by class.

## State and interaction

- **Focus:** 1px `--focus` outline, 2px offset. Inputs use a 1px accent border. No glow.
- **Hover:** background steps to `--hover`; borders step to `--text-3` on fields.
- **Selected:** cyan wash + a 2px left rule. The same shape is used on rows, nav, palette, and
  radio cards.
- **Disabled:** text drops to `--text-3`, borders to `--line`, cursor `not-allowed`; checked
  disabled marks fade the check.
- **Motion:** 120ms hover, 180ms overlay, 260ms maximum. Lamp pulse for busy (1.8s), hard blink
  for waiting permission (1.1s). `prefers-reduced-motion` collapses all durations.
- **Overlays:** dialogs are one decision per panel; menus carry shortcuts; tooltips explain but
  never take focus. Backdrop is a flat wash.
- **Toasts:** confirm an operator action; banners describe a condition. Neither is used for
  progress. The design uses a local `aria-live` region, not RAC's unstable Toast.

## Domain mapping

- **Status** is rendered as a lamp + mono label, never color alone. Six states:
  `starting` ("Starting", hollow), `idle` ("Idle", green), `busy` ("Running", cyan, pulse),
  `waiting_permission` ("Waiting for permission", amber, blink), `failed` ("Failed", red),
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
- **Permission gate** shows the provider's options with no visually preselected allow. "Always"
  states that it also switches the session policy to `allow`; the dashboard never auto-answers.
- **Usage** is the latest reported snapshot, not a cumulative bill or a total token count. Label
  it "reported".
- **Provider-native state** (compaction, plan, title, agent identity, messages) gets a slot that
  can be hidden. A missing capability renders the base view, not an error. Instance identity
  (label + home path) is always visible.
- **Truncation** must be a visible banner/notice in the transcript, not a silent gap.
- **Lineage** is context, not authority: the tree is read from `parentId`/`rootId`/`depth` and
  never gates addressing. Every session in the instance is addressable by every caller.

## Do / don't

Do:

- Use one primary action per view; the cyan fill is scarce.
- Order the fleet by attention; keep the selected row selected as updates arrive.
- Let a 1px rule separate; if it still needs a shadow, the surface step is wrong.
- Keep the fleet a table and the transcript a list. The fleet is not a card wall.
- Preserve identifier case and use tabular figures.
- Hide a provider panel when its capability is absent.
- Say "reported" for cost and usage; say "quiet" or "idle" for a session with no active turn.

Don't:

- Round a corner, add a gradient, or add a drop shadow.
- Use cyan for failure, warning, or decoration.
- Wrap a status in a colored pill or use color as the only signal.
- Uppercase a command, path, name, or identifier.
- Make "Allow" the primary action on a permission card, or imply idle/settled is completion.
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
