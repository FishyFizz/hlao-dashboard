# HLAO dashboard — UX interaction model

**Status:** requirements draft, 2026-10-20.
**Scope:** what the dashboard must be like to use — its properties, its interaction model, and
the behaviour it owes the operator. **Not in scope:** stack, component library, visual design,
pixel layout, or internal implementation. Those are decided elsewhere; this document only pins
the contract the interface must satisfy.

**Sources of truth.** The pinned wire is `contracts/protocol.md` (protocol 2.7). The client
posture is `README.md` and the parent `docs/protocol-stability.md`. Product intent is the
parent `docs/PRODUCT.md`. If this document and the wire disagree, the wire wins; if this
document and product intent disagree, product intent wins.

**Contents**

- [0. The thesis in one paragraph](#0-the-thesis-in-one-paragraph)
- [1. The job the dashboard is hired to do](#1-the-job-the-dashboard-is-hired-to-do)
- [2. Constraints inherited from HLAO](#2-constraints-inherited-from-hlao-non-negotiable)
- [3. The experience bar](#3-the-experience-bar)
- [4. The interaction model](#4-the-interaction-model)
- [5. Surface requirements](#5-surface-requirements)
- [6. Local persistence boundary](#6-local-persistence-boundary)
- [7. Honesty rules](#7-honesty-rules-the-never-list)
- [8. Edge-case catalog](#8-edge-case-catalog)
- [9. Acceptance scenarios](#9-acceptance-scenarios)
- [10. Non-goals](#10-non-goals)
- [11. Open choices for the prototyping agent](#11-open-choices-for-the-prototyping-agent)
- [Appendix A — Action → wire mapping](#appendix-a--action--wire-mapping)
- [Appendix B — Event taxonomy and default treatment](#appendix-b--event-taxonomy-and-default-treatment)
- [Appendix C — Status language cheat sheet](#appendix-c--status-language-cheat-sheet)

---

## 0. The thesis in one paragraph

The dashboard is an **instrument for a live HLAO instance**, not a feed. It exists to answer
three questions faster than the terminal can — *does anything need me?*, *what is this session
doing?*, *what do I do now?* — and then to get out of the way. It is not a task board, a chat
app, a raw log viewer, or a second source of truth. Its only scarce resource is the operator's
attention; it must spend that attention only on states that literally cannot proceed without a
human decision, and return it as soon as the decision is made.

The design stance follows from the product: nothing about an agent-run job is decided before
the job is understood. The dashboard must therefore **show the situation without deciding what
it means**. It presents orchestration facts, ranks attention by structural rules, and makes
every action a primitive (or a visibly labelled client assembly). It never infers that work is
done, stuck, healthy, or important.

---

## 1. The job the dashboard is hired to do

The operator is one person driving several long-running agent sessions on real work. The
dashboard is their home base while that work runs. It is hired for five jobs:

| Job | The question | The dashboard wins by |
|---|---|---|
| **Triage** | Does anything need me right now? | Attention derived from state, visible from anywhere, quiet otherwise. |
| **Inspect** | What is this session doing, and what just happened? | Status, current turn, plan, usage, and a readable transcript with provenance. |
| **Intervene** | Answer, stop, redirect, rename, spawn. | The action is next to the fact, exact about its consequence, and confirmed by the server. |
| **Spawn** | Start another session without a wizard or a manual. | One honest form with visible defaults and provider availability. |
| **Return** | I looked away; what changed? | Resumable selection, drafts, read position, and a truthful reconnect story. |

It is **not** hired to decide what the work means, to summarize the agent, to manage a task
list, or to replace the CLI. If the dashboard is slower than `hlao list` + `hlao read` for
triage and inspection, it has failed, regardless of how it looks.

---

## 2. Constraints inherited from HLAO (non-negotiable)

These are not preferences. They come from the product and the wire, and every surface
requirement below must be consistent with them.

| ID | Constraint | Consequence for the UX |
|---|---|---|
| **C1** | The dashboard is a client, not core. It speaks wire major 2 and feature-detects `hello.capabilities`; it has no private access and adds no server semantics. | The UI cannot offer an action the wire cannot express. Missing capabilities degrade to an explained absence, not a fake control. |
| **C2** | The supervisor is the sole authority. Views and event logs are the truth; local state is a cache. | If local and server state disagree, the dashboard is wrong. Replace local state; never reconcile or merge. |
| **C3** | One HLAO instance — one `HLAO_HOME`, supervisor, socket, token — is one address space and one swarm boundary. | The instance is always identifiable. Handles resolve only inside it. No merged fleets, no cross-instance search, no cross-instance links. |
| **C4** | There is no durable orchestration store. Live sessions are the state; event logs are bounded memory. | The dashboard may persist *operator* state (preferences, drafts, read markers), never orchestration truth or a transcript-as-authority. |
| **C5** | `wait` is one-shot; the supervisor owns no timer. Push is observation at the same append point. | The dashboard may be event-driven; it must not imply scheduled checks, background monitoring after exit, or server-side recurrence. |
| **C6** | Reads speak about orchestration state, not the world. "Is the build done?" belongs to the leaf. | The dashboard never labels a session "done", "stuck", "healthy", or "complete". It shows `settled`, `lastStopReason`, elapsed time, and plan entries as facts. |
| **C7** | Reads are bounded and cursor-addressed. Eviction is reported through `truncated` / `earliestRetainedSeq`; a stream close is not loss until resume reports truncation. | Gaps are shown where they occur. No view ever pretends history is complete. |
| **C8** | Event `data` is an open object; unknown event types and fields are expected. | Unknown events render generically. No crash, no silent drop, no dependence on `raw`. |
| **C9** | Every session is addressable by every caller; `parentId`/`rootId`/`depth` are lineage and context, not authority. | Grouping is a lens, never a permission boundary. Any session can be inspected or acted on regardless of which group it is in. |
| **C10** | The supervisor token is full operator authority and must never reach a browser origin. | The UI never displays, copies, or puts the token in a link. A browser front end talks to a local bridge and holds no supervisor credential. |
| **C11** | `permissionPolicy: ask` can park a session indefinitely; the default is `allow`. | Wherever `ask` is chosen or displayed, the consequence is stated. The dashboard never auto-answers a request on the operator's behalf. |
| **C12** | Provider modes, config options, plan shapes, titles, and usage are provider-native values carried through generic ACP shapes. | Render what the provider advertises. Do not hardcode Claude/Codex model or mode lists. Missing provider state is "not reported", not an error. |

---

## 3. The experience bar

### 3.1 Properties

These are the properties that make the dashboard genuinely pleasant to live with. Each one has
a shadow: the thing it forbids.

| ID | Property | What it means | What it forbids |
|---|---|---|---|
| **E1** | **Truthful** | Every displayed value is either reported by the supervisor or explicitly marked local. Intent and outcome are visually distinct. | Optimistic status changes, invented completion, silent truncation, "probably fine". |
| **E2** | **Attention-first** | The home answers "does anything need me?" before anything else, and the answer is usually "no". | Treating every event as important, content-based ranking, alarm inflation. |
| **E3** | **Direct** | The operator acts on what they can see, in place, without remembering IDs or flags. | Action forms that require recall, hidden compound actions, navigation mazes. |
| **E4** | **Calm** | Live updates do not move the operator's place, focus, or row under them. The dashboard is quiet when nothing blocks. | Reordering on every event, focus theft, modal interruptions, notification spam. |
| **E5** | **Resumable** | Selection, draft, read position, and filters survive navigation, reload, and reconnect. Only the *work* is live; the *person* is persistent. | Losing a draft, resetting scroll, re-selecting after every update. |
| **E6** | **Bounded** | Fleet and transcript stay usable at realistic scale; every truncation, cap, and scan is visible. | Unbounded log dumps, hidden search caps, freezing on a hot stream. |
| **E7** | **Legible** | One vocabulary, taken from HLAO. Every state has a plain-language meaning and a next action. | Product jargon invented by the client, "task" objects, unexplained provider values. |
| **E8** | **Peer to the hand** | Every action maps to a wire method or a labelled client assembly, and can be shown as the equivalent CLI sentence. | Dashboard-only semantics, actions the agent could not perform, hidden automation. |

The shorthand: **an instrument panel, not a slot machine.** An instrument is legible, timely,
stable, and does not editorialize. A slot machine moves, chirps, and wants your attention.

### 3.2 The retention test

People stay where they do not lose things. The dashboard earns a permanent place only if all of
these are true:

1. **Triage is faster than the terminal.** Open → know whether something needs you, in under
   five seconds, without clicking.
2. **Inspection needs no recall.** Select a session → understand its status, current turn, and
   most recent outcome in under ten seconds.
3. **Intervention is two actions.** A pending permission can be answered from wherever the
   operator notices it, without navigating to a settings page.
4. **Spawn needs no manual.** A session can be started in under fifteen seconds with visible
   defaults; every non-default is explicit.
5. **Return is exact.** After an interruption, the same session, draft, scroll position, and
   filter are one action away.
6. **Reconnect is invisible until it isn't.** No manual refresh; a gap is marked only when
   history was actually lost.
7. **It stays quiet.** With no blocking states, an hour produces zero interruptions.
8. **It never lies to look alive.** A stale connection, a restarted supervisor, and an evicted
   history each have their own honest state.

### 3.3 What "want to stay" means here

Not delight, not polish, not a personality. The operator stays because:

- the dashboard is the **fastest place to see the whole fleet**;
- it is the **safest place to act**, because consequences are exact;
- it **remembers the operator's place** even when sessions change;
- it **never makes them re-derive** what the supervisor already knows;
- it **teaches the CLI** instead of hiding it; and
- it **admits ignorance** rather than filling gaps with plausible nonsense.

---

## 4. The interaction model

The whole model is two lenses over one instance:

```
Instance (one HLAO_HOME, one authority)
├── Fleet — home
│   ├── Needs you        permission · failed · error notice
│   ├── Running          busy
│   ├── Quiet            idle / starting, queue visible
│   └── Ended            retained closed/failed
│
└── Session lens — one selected session
    ├── state area       identity · status · turn · queue · policy · usage · plan
    ├── gate             only when waiting_permission
    ├── transcript       turns · events · paging · gaps · provider state
    ├── composer         draft · send · queue · drop
    └── actions          wire verbs + labelled client assemblies
```

No third level. No object between instance and session. No status that the supervisor did not
report.

### 4.1 Objects and words

The dashboard exposes only HLAO objects. It may derive *operator aids* from them, but those aids
are visibly local and never become a new source of truth.

| Concept | Wire source | UI treatment |
|---|---|---|
| **Instance** | `hello`, `HLAO_HOME` | Always identifiable; the boundary for all data and resolution. |
| **Session** | `SessionView` | The only noun for an agent process. Identified by handle; labelled by name, then provider title. |
| **Handle** | `SessionView.id` | Canonical identity. Always copyable. Never hidden behind a label. |
| **Name** | `SessionView.name` | Operator label. Mutable; unique resolution is not guaranteed. |
| **Title** | `SessionView.title` | Provider display fallback only. Never addressable. |
| **Turn** | `turn`, `turnStartedAt`, `lastStopReason` | The unit of work inside a session. A turn ending is not job completion. |
| **Event** | `EventView` | One typed fact in a session's history. `seq` is its address. |
| **Queue item** | `sessions.queue`, `QueueItemView` | A prompt waiting behind the active turn. Visible, ordered, attributable, removable. |
| **Permission request** | `pendingPermission` | A blocking orchestration state. Answerable by the operator or another session. |
| **Policy** | `permissionPolicy` | HLAO's `allow`/`ask`/`deny` decision for the session. |
| **Mode** | `modes` | Provider-native permission mode. Provider-specific values. |
| **Config option** | `configOptions` | Provider-native setting (model, reasoning effort, …). Provider-specific values. |
| **Plan** | `plan` | Provider-reported plan. Display only; never an editable task board. |
| **Compaction** | `compaction` | Provider context compaction state and summary. |
| **Notice** | `notice` events | Provider or derived user-facing signal (including context pressure). |
| **Usage** | `usage` | Latest reported context/cost snapshot. Not a cumulative bill. |

Derived, **client-local** concepts — so labelled wherever they could be mistaken for server
state:

- **Attention** — the structural ranking of sessions that need the operator (§4.3).
- **Unread** — events with `seq` greater than the operator's locally stored `lastSeenSeq`.
- **Draft** — operator text not yet sent, stored per session.
- **Acknowledged failure** — a local reading state that removes a failed session from the
  attention block without changing its status.
- **Dismissed notice** — a local reading state that removes an error notice from the attention
  block; the notice remains in the transcript and is never hidden.
- **Filter / sort / grouping** — a local view over the full fleet; never a scope.

**Words the UI must not use as objects:** task, job, workflow, board, card, run, assignment,
milestone, ticket. "Job" may appear in explanatory prose, but never as a thing with status.
Plans are provider plans, not a global backlog. A root session and its descendants may be
called a **root subtree** for display; that does not create a job object or a rollup status.

### 4.2 Two lenses: fleet and session

The interaction model has exactly two levels of attention:

1. **Fleet** — the whole instance, ranked for attention. This is home.
2. **Session lens** — one live session, with its state, transcript, composer, and actions.

The model requires:

- **NAV1** The fleet is always one action away. There is no navigation stack deeper than
  fleet → session.
- **NAV2** Selecting a session does not stop fleet awareness. When space allows, fleet and
  session are simultaneously observable; when it does not, a permanent, single-action return to
  the fleet exists and the attention count remains visible.
- **NAV3** Selection is by **session handle**, not by row index, name, or title. Names and
  titles can change; rows can reorder; the selected session must not.
- **NAV4** The current lens is restorable after a reload (URL, local state, or both). If the
  environment offers back/forward navigation, it must not scatter the operator's place.
- **NAV5** Links between sessions (parent, root, child, `session.message` sender) switch the
  lens to that session. They never open a modal that hides the fleet.
- **NAV6** The fleet is a view over every session in the instance, including retained closed
  sessions in an explicitly labelled Ended group. Filtering or grouping never changes what
  exists or what is addressable.

### 4.3 Attention: the core ranking

**Definition.** A session is *in attention* only when its reported state meets one of the
structural conditions below. Attention is not importance, urgency prediction, or content
judgment.

| Rank | Condition | Why it is attention | Ordering |
|---|---|---|---|
| 1 | `status === "waiting_permission"` | The session cannot proceed without an answer. | Oldest `requestedAt` first. |
| 2 | `status === "failed"` and not locally acknowledged | A terminal failure the operator has not seen. | Newest `endedAt` first. |
| 3 | `notice` with severity `error` (for example, context pressure at 90%) and not locally dismissed | A reported condition that may require operator action. | Newest first. |
| — | Everything else | Running, idle, starting, closed, ordinary activity. | Not in attention. |

Rules:

- **AT1** Attention is derived **only** from `SessionView` and typed events. No heuristic
  "stuck", "slow", "probably looping", or "looks done".
- **AT2** "Needs you" is a structural claim: *the session cannot proceed without a human*, or
  *it has terminally failed*. It is never a claim that the session's content is important.
- **AT3** The dashboard is allowed to be wrong about the world, never about the wire. If a
  condition cannot be stated as a field or event, it does not enter attention.
- **AT4** A busy session is not attention. Elapsed time is displayed as a fact ("running 42m"),
  never converted into "stuck".
- **AT5** `idle` is not completion. It means no active turn; a queue may still exist. `settled`
  (view field) means idle with an empty queue. Neither means the work is done. Note the wire's
  two meanings of "settled": `SessionView.settled` is `status === "idle" && queued === 0`, while
  `wait --until settled` treats `waiting_permission` and terminal sessions as satisfied. The
  dashboard displays the **view field**; it never maps either meaning to "done".
- **AT6** Acknowledging a failure is a **reading state**, not a resolution state. It hides the
  item from attention locally and changes no server fact. It is labelled as local.
- **AT7** Attention membership changes only on a state transition. Updates to `lastActivityAt`
  or `lastEvent` do not reorder the attention block.
- **AT8** If nothing needs the operator, the dashboard says so plainly ("Nothing needs you")
  and shows the fleet. It does not manufacture a feed to fill the space.
- **AT9** The attention count is visible from the session lens. Selecting a session never hides
  the fact that another session is blocked.
- **AT10** If a pending request is resolved by another client while the operator is looking, it
  leaves attention based on the updated view; if that session's events are loaded, the
  attributed `permission.resolved` event explains it. Not a silent disappearance, and not a
  locally invented success.
- **AT11** A new session never steals attention merely by existing. It is marked as new. The
  exception is a session the operator just spawned, which is selected by intent.

### 4.4 Liveness and time

The dashboard is push-first and event-driven. It may fall back to polling only when the
supervisor lacks the persistent-stream capabilities, and must say so.

- **LV1** Use one fleet subscription for views and one event subscription for the selected
  session(s). A fleet-only subscription does not stream events; the UI must not imply that it
  does.
- **LV2** Apply view notifications by session id as **full replacements**, not field merges. A
  response and a notification describing the same change may arrive in either order; state
  application must be idempotent.
- **LV3** Apply event batches by `seq`: ignore duplicates and out-of-order events; advance the
  cursor to the notification's cursor. Never reorder history.
- **LV4** On reconnect, resubscribe with the last cursors and replace views from the initial
  result. If `truncated` is reported, mark the exact gap at the point where history is missing.
- **LV5** On a supervisor restart (new pid/`startedAt`, or `hello.lastCrash`), **clear live
  fleet and session state** before showing the new instance. Prior live sessions are gone; the
  dashboard must not present cached rows as live. If a local snapshot is retained for
  continuity, it is explicitly labelled "last seen before restart — not live".
- **LV6** Relative times (age, elapsed, queued-for) are computed from server timestamps. They
  may tick locally; they never become judgments. Display both absolute and relative time where
  it matters, and make the absolute form available wherever a relative age is shown.
- **LV7** When disconnected, stop claiming "now": show the last update time and a connection
  state. On reconnect, the fresh view replaces the stale one.
- **LV8** Reconnect is automatic with backoff and no modal storm. A failed reconnect is a
  persistent, quiet state with a manual retry, not a dialog per attempt.
- **LV9** A stream close is not data loss. Only a resume that reports `truncated` produces a gap
  marker.
- **LV10** The dashboard runs only while open. It must not claim background monitoring after
  the process exits; notifications are real only while it is running.

### 4.5 Action model

Every action is one of:

1. a **wire method** (`sessions.send`, `sessions.permit`, …), or
2. a **client assembly** explicitly labelled as such (`find`, bulk operations, export,
   broadcast if ever added), built by looping over wire methods.

Rules:

- **AC1** No action exists in the UI that cannot be expressed on the wire or as a labelled
  client assembly. No dashboard-only semantics, no hidden automation, no server-side state the
  CLI cannot see.
- **AC2** Show intent, never unconfirmed outcome. A send is "sending" until a response or event
  confirms queued/running; a permit answer is "sending answer" until the server confirms. The
  UI must not locally flip a status.
- **AC3** When `spawn.idempotency` / `send.idempotency` is advertised, generate a key for each
  attempt. A retry after a disconnect must not create a duplicate session or prompt; reconcile
  by `messageId` when `send.messageId` is available. If the capability is absent, omit the key
  and warn that an ambiguous retry may duplicate.
- **AC4** Destructive actions state the exact targets and consequence: what will stop, what will
  be discarded, what will be lost. No generic "Are you sure?" and no vague "This cannot be
  undone."
- **AC5** Every mutating action exposes **Copy as CLI** with the exact handle and equivalent
  flags. For a labelled bulk assembly, show the selector/loop form or the per-target commands,
  so the operator can still do it by hand.
- **AC6** Disabled actions explain why they are disabled (wrong status, missing capability,
  ambiguous target, no pending request, session ended).
- **AC7** Every mutation is attributed in the transcript (`by` / `from`). Operator actions show
  as the operator; automatic policy answers show `policy:<name>`; other sessions show their
  handle or label.
- **AC8** Bulk actions are assemblies, not a new primitive: preview the resolved target set,
  show per-target results, and never let one failure silently stop the rest. Bound in-flight
  requests (the supervisor caps a connection at 64) and show queued work and progress.
- **AC9** Report what changed, not "ok": the discarded count, the close result, the new name
  (with the unchanged handle), the option chosen.
- **AC10** The dashboard never answers a permission request on the operator's behalf. Server
  policy may auto-answer; that is shown as an event, not simulated in the client.
- **AC11** No silent queue destruction. `cancel` has two distinct meanings; the UI must make the
  operator choose which one.
- **AC12** No fake undo. If an action cannot be reversed, say so and offer the real next step
  (export, spawn a replacement, copy the text).

### 4.6 Keyboard and command surface

The dashboard is keyboard-complete. Pointing is optional, never required.

- **KB1** Every action and every navigable object is reachable by keyboard. The mouse is an
  accelerator, not a prerequisite.
- **KB2** A command surface (palette or equivalent) can: go to a session, spawn, answer a
  pending permission, open search, jump to the next attention item, return to the fleet,
  switch instance, and invoke every session action. This is the discoverable path; direct
  shortcuts are an acceleration.
- **KB3** Target resolution mirrors the wire: exact handle, then unique name, then unique
  handle prefix. Ambiguity shows candidates and requires a choice. The dashboard never picks a
  candidate by substring when more than one matches.
- **KB4** Before executing, the command surface shows **the scope and the exact target** (handle
  plus label), especially for destructive or bulk actions.
- **KB5** Live updates never steal focus. A permission appearing while the operator types does
  not open a modal over the composer; it appears in attention and remains answerable.
- **KB6** Escape always means "leave the current transient state" (close palette, cancel an
  edit, dismiss a non-destructive panel). It never cancels a running turn or closes a session.
- **KB7** Focus is visible, moves predictably, and returns to its origin after a dialog. There
  are no keyboard traps outside intentional modal confirmations.
- **KB8** Shortcuts are discoverable in place (menus, palette hints, help), not folklore.
- **KB9** The keyboard model does not depend on a specific keymap; individual bindings are a
  prototype choice, but the intent set and safety invariants above are requirements.
- **KB10 — Accessible by construction.** Status is conveyed by text and structure, not color
  alone; icons have labels; absolute timestamps are available wherever a relative age is shown;
  focus order follows the interaction order; non-essential motion respects reduced-motion; the
  surface remains usable at increased text size and narrow width.

The required intent set (bindings deliberately unspecified):

> focus fleet · next/previous attention · open session · return to fleet · search · spawn ·
> send · stop turn · stop and discard queue · close · permit allow/deny/option · toggle always ·
> rename · switch instance · jump to latest · load older · copy handle · copy as CLI · dismiss
> notification · open provider details.

---

## 5. Surface requirements

The numbering is stable so implementation and review can refer to it.

### 5.1 Fleet

- **FL1 — Identity.** Each row shows a display label chosen as operator name → provider title →
  handle. The handle is always available without opening the session and is copyable. A title
  never masquerades as a name.
- **FL2 — State at a glance.** Each row shows `status`, turn number, queue depth, and the
  attention reason if any. For `waiting_permission`, show the request title and age. For
  `failed`, show the reported failure facts (exit/signal, `lastStopReason`, and `lastEvent`) and
  the age.
- **FL3 — Last activity is a fact.** Show `lastEvent` type/title/time. If `lastEvent` is null
  and the `session.lastEvent` capability is present, say "no events yet"; if the capability is
  absent, say "not reported by this supervisor". Do not synthesize a preview from anything else.
- **FL4 — Grouping.** Attention is a pinned group. Other groups (Running, Quiet, Ended) are
  views. Optional lineage grouping uses `rootId`/`depth` and is never a containment boundary:
  every row remains addressable and actionable.
- **FL5 — Ordering.** Order is deterministic: the attention block uses the ranks in §4.3;
  non-attention groups use the operator's chosen sort. To keep the surface calm, the rendered
  order is committed on group/rank transitions and on explicit refresh or sort changes, not on
  every `lastActivityAt` update. Row identity is the handle. A row being interacted with
  (focused, hovered, menu open) is position-locked until the interaction ends.
- **FL6 — Selection stability.** Updates never move the selected row's identity or change the
  selection. If the selected row moves, the selection follows the session, not the position.
- **FL7 — New sessions.** Appear without stealing selection or focus. Marked as new locally.
  The one exception is an operator-initiated spawn, which selects the new session.
- **FL8 — Removed sessions.** `session.removed` removes the row with a non-modal notice. If it
  was selected, the session lens shows a "removed from this instance" state; if events are
  still displayed from local memory, they are labelled "not live". Never keep claiming a
  removed session is live.
- **FL9 — Counts and filters.** The fleet footer reports live/retained/total counts. Filters
  show "showing N of M" and never change the instance counts. Filters are local views, not
  scopes; they do not change what is addressable elsewhere.
- **FL10 — Empty states.** No sessions, no attention, no filter matches, and disconnected are
  distinct states. Each names the next action (spawn, clear filter, start supervisor, retry).
- **FL11 — Scale.** The fleet remains scannable at 100+ sessions. The default does not follow
  full event streams for every session; fleet rows rely on views and `lastEvent`. A merged
  full-fidelity timeline is a labelled client assembly, not a default, because the supervisor
  has no fleet-wide event stream.
- **FL12 — Instance identity.** The fleet always names the instance it is showing (home path
  and/or a stable instance label). Two instances are never silently combined.
- **FL13 — Local new-activity marker.** A row whose session has `lastSeq > lastSeenSeq` is
  marked as having new activity. The marker is local and clears when the operator has seen the
  new events (at/near the live edge) or explicitly marks the session seen; an action taken in a
  visible session advances the local cursor for its own effect. If a read reports
  `earliestRetainedSeq > lastSeenSeq`, the unread range is partly evicted: show "new activity"
  without a count and explain on open. It never implies the agent knows what the operator read.

### 5.2 Session lens: state

- **SV1 — Orientation.** The session surface answers, in a persistent state area: what is this
  (label + handle), where does it run (backend, cwd), what state is it in, what turn, how many
  queued, what policy/mode/config, what context/cost is reported, what plan and compaction are
  current, who spawned it, and how it ended (if it did). Long provider option lists may be
  progressively disclosed; none of these facts may require visiting a separate settings page.
- **SV2 — Unknown is a value.** Missing `usage`, `exit`, `lastStopReason`, `title`, `plan`,
  `compaction`, `agentName`, or `pendingPermission` renders as "not reported"/"none", never as
  zero, empty success, or a blank that looks healthy.
- **SV3 — Three layers, three controls.** HLAO policy (`allow`/`ask`/`deny`), provider mode, and
  provider config options are presented as separate layers with separate consequences. They
  are never collapsed into one "permissions" dial.
- **SV4 — Provider controls are gated.** Modes/config options appear only when advertised by
  the session; values are the provider's names and descriptions. A session with no modes shows
  no mode control, not a dead one. A rejected change is reported with the server error and
  leaves the displayed value unchanged; no local guess.
- **SV5 — Plan and compaction are read-only.** They are displayed as provider-reported state.
  No checkboxes, no editing, no "approve plan", no conversion into a global task list.
- **SV6 — Ended states are distinct.** `closed` and `failed` are different. Both are terminal
  and retained for a limited time. The composer is disabled with a reason; export, copy, and
  lineage remain available. There is no fake "resume" action.
- **SV7 — Actor attribution.** Prompts, permissions, policy changes, renames, queue drops,
  cancels, closes, and modes show who acted (`operator`, session handle/label, `policy:*`,
  `agent` when the adapter changed it).
- **SV8 — Turn context.** Show the current turn number, start time, and elapsed time while
  active. Never label a long turn "stuck".
- **SV9 — No subtree status.** A root subtree may show counts (N sessions, M waiting, K failed)
  but no aggregated "job status", no progress percentage, and no "done".
- **SV10 — Selection survives state changes.** Starting → busy → waiting → idle → closed never
  resets the lens or scroll. The operator's place is theirs.
- **SV11 — Terms explain themselves.** Ambiguous terms — `idle`, `settled`, `ask`, policy vs
  provider mode, compaction, plan, notice — have an inline explanation or accessible glossary
  that uses the same words as the CLI. The explanation is available where the term is used,
  without losing the session context.

### 5.3 Transcript

- **TR1 — Turns are the skeleton.** Events are grouped by turn. A turn header states the turn
  number, start/end, and `lastStopReason` when known. A turn ending is displayed as "turn ended:
  <stopReason>", never "done".
- **TR2 — Known events have intent.** Known types get a specific, compact treatment; see
  Appendix B. Structural events are not rendered as noise. The transcript is a history of
  orchestration, not a raw protocol dump.
- **TR3 — Streaming coalesces.** Agent message chunks, thoughts, tool updates, compaction chunks,
  and inter-session message chunks coalesce by their ids. A streamed message appears once and
  grows in place. Coalescing must not cause layout jumps or duplicate lines.
- **TR4 — Tool calls are one row.** A tool call is one row; `tool.update` mutates that row in
  place (status, result). Details and raw payloads are available on explicit inspection only,
  and the UI labels them as raw provider data.
- **TR5 — Tail-follow only at the bottom.** If the operator is at the latest event, new events
  append and the view stays at the bottom. If they have scrolled up, nothing moves; show a
  "N new messages" affordance and an explicit jump-to-latest. The count is agent messages since
  the read cursor, not the event-sequence delta: tool calls, updates, thoughts, and usage are
  activity, not unread replies, and would otherwise inflate the count into the thousands. Never
  yank the viewport.
- **TR6 — History is paged and bounded.** Opening a session loads the latest bounded page.
  Older pages load on demand through the backward cursor. When `truncated` is set, show "history
  begins at seq N" at the exact boundary. Never render an evicted gap as if nothing happened.
  The banner can be dismissed locally for that boundary; a later read that evicts more history
  shows it again. The bounded log is not the whole record: the provider keeps its own
  transcript. When the session reports a provider id and the supervisor supports `spawn.fork`,
  the banner offers a fork that opens that transcript; `spawn.resume` is the reattach path after
  a restart.
- **TR9 — Restored history is marked.** Events with `replay: true` come from ACP
  `session/load`, not from live observation. Mark them (`history` in the gutter), never count
  them as new activity, and keep the `session.resumed` / `session.forked` row visible as the
  boundary. Do not present replayed text as something that just happened.
- **TR7 — Return to the last read position.** If local `lastSeenSeq` is known and still
  retained, show a divider there and offer "jump to last read" and "jump to latest". If the
  cursor was evicted, clamp to the earliest retained event and say so.
- **TR8 — Permissions are inline and actionable.** A `permission.requested` event is one
  actionable card with the request title/kind, the offered options, and the age. A
  `permission.resolved` event records the option and actor. Do not repeat the full option block
  in the header and the transcript; summarize once and link the control.
- **TR9 — Provider events render per the taxonomy.** Plan updates, compaction, notices, usage,
  user messages, and inter-session messages are first-class; none require raw. Unknown types
  fall back to `type · title/preview`.
- **TR10 — Thoughts are secondary.** Agent thoughts are available but collapsed or de-emphasized
  by default, with an explicit toggle. A collapsed thought shows the latest streamed line, so
  the operator can see what the agent is thinking without opening it; the full text remains one
  click away. Thoughts are never mixed into final agent messages as if they were output.
- **TR14 — View modes are one exclusive choice.** The transcript offers exactly three modes:
  Default (conversation and activity, system events hidden), System (also show usage, plan,
  compaction, commands, stderr, and session metadata), and Minimal (messages plus one collapsed
  activity row between them). There is no separate system toggle. Minimal counts tool calls,
  MCP calls, and thoughts and shows the latest tool/MCP name or last thought line; opening the
  row restores the individual events. Failures, notices, discarded prompts, and terminal
  markers never collapse, because a compact view must not hide a decision or a problem. The
  wire has no MCP event type, so MCP calls are recognized from adapter naming or explicit
  markers; the count's tooltip says that this is an inference.
- **TR11 — Agent text is untrusted.** Strip control characters; do not render raw HTML or
  script; do not auto-load remote content; make links explicit; code blocks are copyable, not
  executable. This mirrors the CLI's sanitization guarantee.
- **TR12 — Copy and select.** Text is selectable; code and tool payloads can be copied; each
  event exposes its `seq`. Copy actions never include the supervisor token.
- **TR13 — Terminal and removed states.** A closed/failed session keeps its transcript readable
  for the retention period, with a terminal banner. A removed session shows the last loaded
  events as a labelled local snapshot, or a clean empty state if the client does not retain
  them. It never continues to look live.
- **TR14 — Scale.** A session with thousands of retained events remains responsive, and typing
  in the composer never waits on transcript rendering. The mechanism is an implementation
  choice; the interaction requirement is no perceptible lag and no unbounded memory growth.
- **TR15 — No dashboard-authored summary.** The dashboard does not paraphrase agent output,
  generate a "what happened" summary, or infer a verdict. The only summaries shown are the
  provider's own (compaction, plan, title, notices), with provenance.

### 5.4 Composer and queue

- **CO1 — Sending is explicit.** Multi-line prompts are supported. The send gesture is deliberate
  and cannot fire accidentally from a stray Enter while composing; the exact key binding is a
  prototype choice, the safety property is not.
- **CO2 — Drafts are operator state.** A draft is kept per session and survives navigation,
  reload, and reconnect. It is never auto-sent. If the target disappears, the draft is shown as
  orphaned and remains copyable.
- **CO3 — Confirmed state only.** After send, show "sending" until the response/event confirms
  `queued` or active. Reconcile the outbound message with `messageId`; show it exactly once.
- **CO4 — Busy is steerable or queueable.** Sending while busy is allowed. When the supervisor
  advertises `send.steering` and the session reports `steeringSupported`, the primary action is
  **Steer** (injected into the running turn) and a secondary **Queue** action places the prompt
  behind the turn. Otherwise the primary action queues the prompt. A queued prompt says it will
  run after the current turn, and the queue item is droppable.
- **CO5 — Permission-parked is sendable, with a warning.** A prompt can be queued while
  `waiting_permission`, but say plainly that it will not run until the current turn is
  answered. Do not disable the composer silently.
- **CO6 — Ended is not sendable.** For `closed`/`failed`, disable the composer with the reason
  and offer the real alternatives (copy draft, spawn a replacement). Preserve the draft.
- **CO7 — Failed send preserves the draft.** Show the error, keep the text, and retry with the
  same idempotency key. A retry must not duplicate a prompt that actually landed.
- **CO8 — Queue is inspectable.** Show the active turn and each queued prompt with sender,
  position, age, message id, and a bounded preview. Dropping a queue item shows its exact
  preview first; dropping is permanent and labelled.
- **CO9 — No invented messaging semantics.** No mentions, threads, reactions, or channels. A
  send to another session is an explicit target choice; a multi-target send, if ever added, is
  a labelled assembly with per-target results and no implied broadcast to a subtree.
- **CO10 — Text only.** HLAO carries orchestration text, not payloads. No file/image
  attachments in the composer. Referencing a path is a text action; the dashboard does not
  smuggle bytes through the harness.
- **CO11 — Outbound text is preserved.** No client-side truncation of the prompt; show the
  length if useful, but send the full text.

### 5.5 Permission gate

- **PM1 — A gate is a stop, not a toast.** A pending request is visible globally (attention
  count/row) and in the session, with the tool title and how long it has been waiting.
- **PM2 — Show what is being asked.** Display the request title, kind, tool call id, requested
  time, and every offered option exactly as the provider named it.
- **PM3 — No accidental allow.** There is no default preselected sensitive choice; Enter does
  not accept "allow". The operator chooses an option explicitly.
- **PM4 — "Always" is explicit and explained.** `permit --always` answers the current request
  and switches the session's policy to `allow`, preferring the provider's allow-always option
  when offered. Show that consequence before the action; never make it the default or a
  hidden modifier.
- **PM5 — No client auto-answer.** The dashboard never answers on a timer, on a rule, or in the
  background. Automatic answers from the server's policy are visible as `permission.resolved`
  events with `by: policy:<name>`.
- **PM6 — Race-safe.** If the request was already answered or cancelled, show the actual current
  state (`no_pending_permission`, resolved by another client, session already ended) and
  refresh. Never show a local success that the server did not confirm.
- **PM7 — Resolution is attributed.** Show which option was chosen and by whom, including
  cancellation/close reasons.
- **PM8 — Bulk permit is an assembly.** If offered, it lists every pending target with the
  exact option it will apply, requires confirmation, and reports per-target results. It never
  applies "always" implicitly.
- **PM9 — `ask` is warned everywhere.** Whenever the operator selects or sees `ask`, state that
  an unattended session can wait indefinitely and needs an answer from this dashboard or
  another client. This is a known product edge (R-14), not a defect the UI should hide.
- **PM10 — Policy and provider mode are not the same control.** Explain the layer: HLAO policy
  decides how requests are answered; provider mode can stop the provider from asking at the
  source. Changing one does not silently change the other.

### 5.6 Spawn

- **SP1 — One form, no wizard.** Spawn is a single, honest form. No multi-step flow that hides
  defaults or freezes choices before the operator sees them.
- **SP2 — Fields and defaults.** Backend (required), cwd (explicit; empty means "supervisor
  default" and is labelled as such), name (optional), first prompt (optional), permission
  policy (chosen value or "config default"; `ask` warned), parent (default root; explicit child
  option), skill pointer (default on), and advanced provider values only when the operator
  chooses to open them.
- **SP3 — Backends are discovered, not assumed.** Use `backends.list`; unavailable backends are
  listed with the reason and cannot be submitted. When the spawn cwd changes, refresh
  `backends.list` with that cwd so project-config backends and availability are current. If the
  `backends.list` capability is unavailable, explain the limitation and either accept a typed
  backend name or disable spawn; never invent a backend. The last-used backend may be
  remembered locally, but the effective choice is always visible before spawn.
- **SP4 — Defaults are honest.** Show what the dashboard will send and label anything left to
  the supervisor as a default. If the wire does not report the supervisor's cwd or the config's
  effective policy, say "supervisor default" / "config default" rather than displaying a guessed
  value as if it were effective.
- **SP5 — Retry is safe.** Generate an idempotency key per spawn attempt; a retry after a
  dropped response must not create a second session. If a duplicate is returned, select the
  existing session and say so.
- **SP6 — Success selects the new session.** The view enters `starting`, then live, with the
  handle visible. If no first prompt was given, an idle session is a valid outcome, not an
  incomplete task.
- **SP7 — Failure is clean.** No phantom row. Show the adapter's stderr tail and preserve the
  form for correction/retry.
- **SP8 — Parent is lineage, not authority.** Choosing a parent sets `parentSessionId` and is
  explained as lineage only. It grants no visibility or control that the operator did not
  already have.
- **SP9 — Spawn creates no task.** Do not name the session from the prompt automatically, do
  not create a task object, and do not infer a cwd from a "job". The session is the object.
- **SP10 — First-turn wait is optional.** If offered, it is bounded and says that a timeout
  leaves the session running and the turn continuing. The default should favor returning
  immediately with a live session over blocking the UI.
- **SP11 — Advanced provider values are honest.** Modes, model, and config options are
  provider-specific and may not be enumerable before a session exists. If exposed pre-spawn,
  they are free-form and clearly labelled as provider-specific; otherwise, prefer setting them
  after spawn where the session advertises the valid values.

### 5.7 Lifecycle actions

- **LC1 — Rename is inline.** Empty clears the name. Warn if another live session already has
  it; do not block (the wire allows duplicates), but always show the handle so addressing stays
  unambiguous. Renaming never changes the handle.
- **LC2 — Stop is two verbs.** Present "Stop turn, keep queue" (`cancel keepQueue`) and "Stop
  turn and discard N queued prompts" (`cancel`) as distinct actions when a queue exists. Show
  the count and previews before discarding. When the queue is empty, present one action.
- **LC3 — Cancel is not close.** Cancelling leaves the session alive and usable. A pending
  permission is resolved as cancelled; say so. The operator can send again after the turn ends.
- **LC4 — Close ends the session.** Explain that it becomes terminal and remains readable only
  for the retention period. Closing a subtree enumerates the descendants, closes deepest-first,
  and reports counts/results; never a silent tree operation.
- **LC5 — Force is an escape hatch.** `force` skips graceful ACP close. It is advanced, labelled,
  and never the default. Offer it when the normal close does not resolve the situation.
- **LC6 — Forget is history loss.** Only terminal sessions can be forgotten, and only when they
  have no retained descendants (the wire rejects the latter). State that the retained event log
  is discarded and offer export first. Do not present forget as cleanup with no consequence.
- **LC7 — Shutdown is a danger-zone action.** If the dashboard offers `supervisor.shutdown`, it
  lists the live sessions that will close and states that retained histories will be lost,
  offers export, and requires an explicit confirmation. It is never a toolbar button.
- **LC8 — Export is paged and honest.** Export uses `sessions.read` paging. Report the event
  count and whether the history was already truncated. Never claim a complete transcript when
  the supervisor evicted part of it.
- **LC9 — Everything is recorded.** Every lifecycle mutation produces an event with the actor.
  If the transcript does not show it, the action did not happen as far as the UI is concerned.
- **LC10 — No silent retries.** A failed lifecycle action is reported with the server error;
  retries are the operator's choice.

### 5.8 Provider-native state

- **PV1 — Plan is a plan, not a board.** Show the current plan for the session, with entries or
  file/markdown content as reported. Compact plan deltas may appear in the transcript.
  Entries are not editable, checkable, or aggregated across sessions.
- **PV2 — No invented plan.** If no plan is reported, say so (or show nothing), not an empty
  checklist.
- **PV3 — Compaction is visible.** Show status, summary, error, and when it updated. An
  in-progress compaction is a live state with a marker in the transcript. A completed summary
  is expandable. Do not imply the dashboard can trigger or prevent compaction.
- **PV4 — Notices are signals, not noise.** Render severity, text, and time. Error-severity
  notices may enter attention; warnings stay in the session unless the operator configures
  otherwise. Notices do not become toasts for every occurrence.
- **PV5 — Usage is a snapshot.** Show the latest `used/size` and reported cost. Context
  percentage only when `size > 0`. Token counts are not additive across turns or sessions; never
  label them "total tokens". Cost is "reported", not a bill. Missing usage is "not reported".
- **PV6 — Session messages are inter-session.** Render sender, recipient, text, and time.
  Link the sender if it is addressable in this instance. Never style it as an operator prompt.
  Gate on `session.messages`.
- **PV7 — Titles are fallback labels.** A provider title may display when there is no operator
  name. It is not an address and not an identity. The handle remains visible.
- **PV8 — Agent identity is context.** Show backend and `agentName@agentVersion` when reported.
  Absent means unknown, not "unknown agent" as a warning.
- **PV9 — Capability gating.** Missing `session.plan`, `session.compaction`, `session.notices`,
  `session.title`, `session.agent`, or `session.messages` means render the basic view, not a
  broken widget or an error dialog.
- **PV10 — Provider values are not ours.** Never hardcode model names, mode names, descriptions,
  or thresholds. Use what the session advertises. The 75/90% context notices are the
  supervisor's derived state; the UI does not recompute its own thresholds.

### 5.9 Search and find

- **SE1 — Two explicit scopes.** Search in the current session (`sessions.read` with `grep`)
  and search across the instance (`sessions.list` + paged `read --grep`). The scope is visible
  before the search runs.
- **SE2 — Honest filters.** Live vs retained (`includeClosed`), event type, and literal text
  are explicit. Searching raw provider payloads is an explicit opt-in and is labelled as such.
- **SE3 — Results have provenance.** Each result shows session label + handle, `seq`, time,
  event type, and a bounded snippet with the match. Selecting a result opens that session at
  that event with surrounding context.
- **SE4 — Caps are visible.** Show scanned sessions/pages, whether a scan was capped, and the
  time of the scan ("as of"). A search is a snapshot of retained memory, not an index.
- **SE5 — No index, no cross-instance.** The dashboard does not build a durable search index
  and never searches another instance.
- **SE6 — Search is read-only.** Running a search never mutates state or marks events read.
- **SE7 — Cancellable.** A long scan can be stopped without affecting the sessions or the rest
  of the UI.
- **SE8 — Live work continues.** Search runs alongside live updates; results do not freeze the
  fleet, and new events after the scan are not presented as part of the original result.

### 5.10 Instance and connection

- **IN1 — Identity is always visible.** Show the home path and/or stable instance label, the
  supervisor pid, package version, protocol major.minor, and `startedAt` (at least in a details
  surface). This is how the operator knows which world they are in.
- **IN2 — Choosing a home is explicit.** First run uses the default home or asks the operator.
  The choice is remembered locally. A wrong home is a wrong instance, not an empty fleet.
- **IN3 — Starting a supervisor is explicit.** The dashboard may offer "Start supervisor", but
  it must not silently spawn or stop one. If it starts one, the connection state says so.
- **IN4 — Handshake first.** Call `hello`, require major 2, and read capabilities. Minor
  versions and unknown capabilities are ignored; known missing capabilities degrade. Gate
  optional view fields on their capabilities (`session.usage`, `session.settled`,
  `session.lastEvent`, `session.compaction`, `session.plan`, `session.title`, `session.agent`,
  `session.messages`). Gate optional methods/params on `read.before`, `read.filters`,
  `send.messageId`, `send.idempotency`, `spawn.idempotency`, `backends.list`,
  `supervisor.lastCrash`, and the stream capabilities. An absent field or method is not an
  error.
- **IN5 — Version mismatch is blocking and explained.** If the major differs, show both
  versions and the fact that the dashboard cannot speak to this supervisor. Do not attempt
  partial operations.
- **IN6 — Config state is visible.** An invalid config that prevents startup is a connection
  error naming the file; no supervisor is running and no spawn is possible. A `configError`
  reported by an already-running supervisor is a banner: new spawns are blocked while live
  sessions are unaffected. Offer `reload` where permitted. Do not imply that editing the file
  changes a running supervisor without reload.
- **IN7 — Reconnect is automatic.** Backoff, resubscribe with cursors, replace views, and show a
  quiet connection status. No modal per attempt. If a browser bridge sits in front of the
  socket, the bridge's own liveness is part of the connection state; the wire adds no
  heartbeat.
- **IN8 — Gaps are exact.** Only a `truncated` resume produces a gap marker; a stream close
  alone does not.
- **IN9 — Restart clears the world.** A new supervisor identity (new pid/`startedAt`) means the
  old live table and its history are gone. Clear fleet/session live state, surface
  `lastCrash` once if present, and mark any locally retained snapshot as not live. Never show a
  stale row as if it were still running.
- **IN10 — Unauthorized is a home/token problem.** Explain the likely cause and offer choosing
  another home. Do not retry in a loop.
- **IN11 — Backpressure is a reconnect, not a failure.** If the supervisor closes a slow
  consumer, reconnect with cursors. If it repeats, reduce the set of followed sessions and tell
  the operator why.
- **IN12 — Multiple instances are separate worlds.** One active instance per connection/window.
  Switching is explicit and restores that instance's local UI state. Handles resolve only in
  the active instance. Drafts and selections are keyed by instance. No cross-instance merged
  notifications; if a notification from a background instance is shown, it names the instance.
- **IN13 — No credential leakage.** The token never appears in the UI, a copy action, a URL, a
  log line, or a browser origin. A browser front end talks to a local bridge that holds the
  token.
- **IN14 — Closing the app ends observation.** Say that notifications and live updates stop
  when the app is not running. Do not imply a background daemon.
- **IN15 — Local diagnostics are separate.** If the dashboard exposes supervisor logs or a
  doctor view, label them as local diagnostics, not orchestration state, and never infer
  session state from them.

### 5.11 First run

- **FR1 — The boundary is stated once.** On first launch, state in one short screen: this is a
  client for one HLAO instance; it reads the local supervisor; it stores no orchestration data;
  closing it ends live observation. No tour, no demo data.
- **FR2 — Empty is empty.** No sample sessions, no fake activity, no placeholder transcript.
  The empty fleet offers the real next action: choose a home, start a supervisor, fix config,
  or — when connected — spawn.
- **FR3 — Connection before theater.** Do not show a fleet scaffold that implies data before
  `hello` succeeds; show the connection state. When connected, load the real fleet.
- **FR4 — The first spawn is the tutorial.** The spawn form, with visible defaults, is the
  primary onboarding path; help is inline where terms appear, not a separate manual.

### 5.12 Notifications and unread

- **NT1 — Unread is local.** "Unread" means events after the operator's locally stored
  `lastSeenSeq`. It is never shared, never authoritative, and never displayed as if the agent
  knows it was read.
- **NT2 — Notification classes are structural.** By default: `waiting_permission` and `failed`
  are notify-worthy; error-severity notices are always in-app attention and optional for OS
  notification; settle transitions are optional and off by default; ordinary messages and tool
  events never notify.
- **NT3 — OS notifications are interruptions.** Send them only when the window is unfocused,
  coalesce per session/state, and make click-through focus the exact session and request.
  Never send one per event, and never notify for a state change the operator just caused in
  the visible session.
- **NT4 — Quiet by default.** The dashboard with nothing blocking should produce no
  interruptions. Every class is configurable, and warning/info notices default to in-app only.
- **NT5 — Never notify "done".** A settle notification says "no active turn and the queue is
  empty", not "completed". A turn-end notification names the stop reason. The operator decides
  what it means.
- **NT6 — Running means running.** Notifications exist only while the dashboard process is
  alive. If it is closed, the operator is not being monitored; state this plainly.
- **NT7 — Accessible announcements.** New permission, session failed, connection lost, session
  removed, and send failure are announced to assistive technology. Ordinary events are not.
- **NT8 — Stale notifications are cleared.** Resolving a permission elsewhere, closing a
  session, or losing an instance removes the corresponding notification. A notification never
  points at a state that no longer exists.

---

## 6. Local persistence boundary

The dashboard may remember the **operator**, never the **work**.

| May persist locally | May **not** persist | Lifecycle rule |
|---|---|---|
| Instance home, recent homes, connection preferences | Supervisor token in a browser origin | Token stays in the local bridge/process only. |
| Selected session per instance (handle + `createdAt`), filters, sort, grouping, panel sizes | Session status, turn, queue, plan, compaction, usage as authoritative state | Replaced from the server on every connect. |
| Drafts, keyed by instance + session identity (handle + `createdAt`) | A transcript presented as the authority or as complete | Drafts survive; transcripts are bounded local cache at most. |
| Local `lastSeenSeq` / read markers | Unread state shared with agents or other clients | Local only; recomputed after eviction. |
| Locally acknowledged failures | A local "failed resolved" fact | Acknowledgment changes no server state; it is cleared if the session changes. |
| Notification preferences | A background monitor or schedule | No timers or monitoring after exit. |
| Recent backend/cwd choices | Tags/annotations that other participants are expected to rely on | v1 does not add a tagging system; names are the shared label. |

Rules:

- **LS1** Every persisted field either describes the operator's view (preference, draft, read
  position, acknowledgment) or is a cache that is replaced on connect. There is no third
  category.
- **LS2** Key all local state by instance. A handle is not globally unique, and may be reused
  after a supervisor restart or retention expiry. Per-session local state is keyed by instance
  **plus a stable local identity** (for example handle + `createdAt`), not by handle alone. A
  draft or acknowledgment for one instance must never appear in another, or on a different
  session that happens to reuse the handle.
- **LS3** On a supervisor restart, clear orchestration caches and invalidate per-session
  cursors/selections that cannot be matched to the new live table. Keep operator state
  (selection, drafts, filters) but mark targets that no longer exist as orphaned; never silently
  retarget a draft or an action.
- **LS4** Provide a way to clear local state. No hidden uploads, no telemetry that includes
  agent content, no sync service in v1.
- **LS5** Local state is not an API for agents. The dashboard does not expose a second surface
  that agents can read or write; the CLI/wire remains the shared surface.

---

## 7. Honesty rules (the "never" list)

These are the fastest review checklist. A UI that violates any of them is not this dashboard.

- **H1** Never display a session state the supervisor did not report.
- **H2** Never call `settled`, `idle`, or `end_turn` "done", "complete", or "success".
- **H3** Never infer "stuck", "healthy", "looping", or "probably finished" from elapsed time or
  content.
- **H4** Never auto-answer a permission request in the client.
- **H5** Never silently truncate, evict, merge, or skip history; mark the exact gap.
- **H6** Never show a stream close as data loss until resume reports `truncated`.
- **H7** Never show a send, permit, rename, or close as succeeded before the server confirms.
- **H8** Never display an unknown value as zero, empty, or a green state.
- **H9** Never display latest usage snapshots as cumulative spend or total tokens.
- **H10** Never turn a provider plan into an editable task list, global board, or progress
  verdict.
- **H11** Never create a task/job/workflow object, a rollup status, or a completion percentage.
- **H12** Never show a stale row as live after a supervisor restart, disconnect, or removal.
- **H13** Never merge two instances or resolve a handle across instances.
- **H14** Never expose the supervisor token or put it in a shareable link.
- **H15** Never claim read-only mode is a security boundary; it is a client-side guard at most.
- **H16** Never reorder rows, steal focus, or move the viewport under an active interaction.
- **H17** Never notify on ordinary activity; reserve interruption for blocking or terminal
  states.
- **H18** Never claim background monitoring when the app is closed.
- **H19** Never make supervisor shutdown, close-subtree, or forget a casual one-click action.
- **H20** Never paraphrase agent output or generate a "what happened" summary. Show provider
  text and provenance.
- **H21** Never present a client assembly (find, bulk, export, broadcast) as a server primitive.
- **H22** Never hide a disabled action's reason.

---

## 8. Edge-case catalog

Every row is a required interaction, not an implementation suggestion.

| Situation | What the operator sees | The next action |
|---|---|---|
| No supervisor running | "No HLAO supervisor at `<home>`" with the home path; fleet empty and non-live. | Choose another home, or explicitly start one. |
| Supervisor started | Connection state names the pid/version; fleet loads. | None; normal use. |
| Wrong token / unauthorized | Home/token mismatch explanation, no retry storm. | Choose home / fix permissions. |
| Major version mismatch | Both protocol versions, blocking message, no partial operation. | Update the dashboard or point at the right home. |
| Capability missing | The dependent view renders as "not supported by this supervisor" with the basic view intact. | None; use the available view. |
| Invalid config at connect | Connection error names the file; no supervisor starts; no spawn possible. | Fix the file, then start/reconnect. |
| `configError` after reload | Banner; new spawns blocked; live sessions unchanged. | Fix and reload. |
| No backends available | Spawn form lists them as unavailable with reasons. | Fix config/install; no dead spawn button. |
| Spawn failure | No phantom row; adapter stderr tail; form preserved. | Correct and retry (idempotent). |
| Adapter crash / `failed` | Session leaves attention only after local acknowledgment; transcript preserved; ended facts. | Export, inspect, spawn a replacement. |
| `waiting_permission` | Attention rank 1; tool title and age; explicit options. | Allow/deny/option/always, or cancel. |
| Second concurrent permission request | Only one pending request is representable; the other is cancelled with an `error` event. | Read the error; answer the remaining request; the provider limitation is stated. |
| Permission resolved elsewhere | Attributed `permission.resolved`; gate closes; no local success flash. | Continue reading. |
| Waiting permission for a long time | Age grows; `ask` consequence stated; no "stuck" verdict. | Answer, change policy, or cancel. |
| Long-running turn | Elapsed time grows; status stays `busy`. | Wait, send (queues), or stop. |
| Queue non-empty on cancel | Two actions, count and previews; discard is explicit. | Choose keep or discard. |
| Close subtree | Descendants enumerated; deepest-first; per-target result. | Confirm or cancel. |
| Forget terminal session | History-loss warning; export offered. | Export then forget, or cancel. |
| Shutdown | Live sessions listed; retained histories loss stated; explicit confirmation. | Export / confirm / cancel. |
| Stream closed / backpressure | Quiet reconnecting state; no loss claimed. | None; automatic resume. |
| Resume `truncated` | Gap marker at the earliest retained seq. | Load retained history, fork the provider session, or continue live. |
| History evicted while scrolled | Clamped position; "history begins at seq N"; provider fork offered when available. | Fork to open the provider transcript, or continue; export what is loaded. |
| Provider session resumed/forked | Replayed events marked `history`; structural boundary row. | Continue from the replayed state. |
| Supervisor restarted / `lastCrash` | Fleet cleared; once-only crash notice; stale local snapshots labelled. | Start a new session; old work is gone. |
| Session removed while selected | "No longer in this instance" state; local events labelled not live. | Return to fleet / export what is loaded. |
| Unknown event type | Generic `type · title/preview` row; fields inspectable. | None; it is still visible. |
| Unknown provider field | Ignored; known fields still render. | None. |
| Ambiguous name/prefix | Candidate list with handles; no automatic choice. | Choose the exact handle. |
| Server returns `ambiguous_id` | Candidate list from `details.candidates`; no action applied. | Choose the exact handle. |
| Send before the session is ready (`session_not_ready`) | Draft preserved; explain that the session is still starting. | Retry when ready. |
| Closed/failed session selected | Terminal banner; composer disabled with reason; copy/export/lineage available. | Export, copy, or spawn a replacement. |
| Send to an ended session | `session_closed` explanation; draft preserved. | Copy draft / spawn replacement. |
| Send fails after disconnect | Draft preserved; error; retry with idempotency. | Retry safely. |
| Usage not reported | "Not reported", not 0. | None. |
| Plan absent | "No plan reported", not an empty checklist. | None. |
| Compaction in progress | Status and partial summary; live marker. | Continue reading. |
| Context pressure notice | Warning/error near usage and in transcript; error may enter attention. | Read it; adjust scope if appropriate. |
| Search scan capped | "Scanned N of M; capped at …", as-of time. | Narrow the query or scope. |
| App reload | Selection, filters, drafts, and read position restored. | None. |
| Instance switch | Separate fleet and local state; explicit instance identity. | Work in the selected world. |
| App closed | No notifications, no monitoring; stated in settings/help. | Reopen to resume. |

---

## 9. Acceptance scenarios

These are the minimum end-to-end interaction tests. Each maps to wire behaviour and should be
runnable against a scripted or real supervisor.

**SC1 — Fan-out triage.** Spawn five sessions, one of which parks on a permission request.
Pass: without opening any session, the fleet shows the blocked session as attention rank 1 with
the tool title and age; the other four are not in attention; the attention count is visible.

**SC2 — Permission round-trip.** Answer the parked request with an explicit option. Pass: the
gate shows "sending" until the server confirms; the transcript records the option and actor;
the session resumes; a second answer attempt reports `no_pending_permission` and does not flip
local state.

**SC3 — Permission resolved elsewhere.** Resolve the request from the CLI while the dashboard is
open. Pass: the gate closes, the transcript shows the actor, and no error dialog appears.

**SC4 — Cancel semantics.** With two queued prompts and an active turn, invoke both cancel
forms. Pass: the UI shows the count and previews before discard; "keep queue" leaves the queue
running; discard reports the discarded count; the session remains alive.

**SC5 — Reconnect with resume.** Kill the stream (or the bridge) while the session is streaming.
Pass: the dashboard reconnects without a modal storm, resubscribes with cursors, shows no
duplicates, and displays a gap only if the resume reports `truncated`.

**SC6 — Truncation.** Resume with a cursor older than the retained log. Pass: the transcript
shows a precise "history begins at seq N" marker and the earliest retained events; it does not
claim completeness.

**SC7 — Supervisor restart.** Stop and restart the supervisor while the dashboard is open. Pass:
the fleet clears, the old live sessions are not shown as live, `lastCrash` is surfaced once if
present, and locally retained drafts are marked orphaned rather than retargeted.

**SC8 — Spawn failure and retry.** Force an adapter startup failure. Pass: no phantom session
appears; the adapter stderr tail is shown; the form is preserved; retry uses an idempotency key
and a successful retry creates exactly one session.

**SC9 — Queue and composer.** Send while busy; then send while permission-parked; then drop one
queued item. Pass: the message appears once, with queued position and age; the permission case
warns that it will not run until answered; dropping shows the exact preview and removes exactly
one item.

**SC10 — Unknown event and capability.** Drive an event type the client does not know and a
supervisor without provider-state capabilities. Pass: a generic row is visible and inspectable;
the session still renders basic state; no dead controls or error dialogs.

**SC11 — Ambiguous target.** Create two sessions with the same name (or a shared prefix) and
invoke go-to by that token. Pass: the command surface lists candidates with handles and
requires a choice; nothing is actioned until one is chosen.

**SC12 — Removal while selected.** Let a selected session be forgotten or expire from retention.
Pass: the lens shows "no longer in this instance"; loaded events are labelled not live; the
fleet no longer shows the row; no further live claims are made.

**SC13 — Provider state.** Drive a plan with item updates, a compaction, a context-pressure
notice, usage, a title, and an agent identity. Pass: the plan is read-only and current; the
compaction summary is expandable; the notice has severity and time; usage is a labeled snapshot;
the title is a fallback label only; the agent identity is shown; no task board appears.

**SC14 — Search honesty.** Run an instance-wide search that exceeds the page cap. Pass: the
scope and live/retained choice are visible; results show session, seq, time, type, and snippet;
the cap and as-of time are stated; selecting a result opens the event in context; a second
search is not presented as the same snapshot.

**SC15 — Calm under stream.** Stream a high-volume agent message while the operator is scrolled
up and typing. Pass: chunks coalesce in place; the viewport does not move; focus stays in the
composer; a "new events" affordance appears; no notification fires for ordinary output.

**SC16 — Instance boundary.** Open two instances with overlapping session handles. Pass: each
fleet carries its own identity; switching restores the correct selection and drafts; no handle
resolves across instances; notifications name their instance if both exist.

**SC17 — App reload.** Reload the dashboard while a draft, selection, filter, and read marker
exist. Pass: all return; live views are replaced from the server; no draft is auto-sent; an
evicted read marker clamps with an explanation.

---

## 10. Non-goals

The following are deliberately out of scope. Each would either create a second authority, invent
semantics the wire does not have, or turn the dashboard into a different product:

- A scheduler, cron UI, workflow graph, DAG editor, task board, kanban, backlog, or ticket
  system.
- A durable transcript store, cross-restart recovery, or "resume after crash" (P0-14).
  The dashboard reports the loss; it does not pretend to recover it.
- A global registry, cross-instance federation, or multi-user server.
- Tags, projects, teams, assignments, or any taxonomy the agents do not share. Names and the
  root subtree are the available organization.
- Per-tool permission rule builders, budgets, or spend enforcement. The wire has a tri-state
  policy and provider modes; the dashboard reflects them.
- Provider subagent trees or ACP `subagents`; HLAO deliberately does not surface them.
- A terminal emulator, PTY fallback, or raw stdout viewer. HLAO is ACP-only.
- File/image attachments or any payload channel. The prompt is text; context is verbatim or by
  reference.
- An LLM that summarizes, prioritizes, or judges sessions for the operator. The dashboard is
  not a judgment layer.
- Background monitoring after the app exits; a daemon; scheduled checks.
- A mobile or multi-user product. A narrow window is a layout concern, not a second model.
- Visual design, component library, and stack. Those belong to the prototype; this document
  constrains behaviour only.

---

## 11. Open choices for the prototyping agent

These are implementation or product-surface choices that do **not** change the model above.
They should be decided in the prototype and recorded, not silently assumed:

1. **Exact keymap and send gesture.** The intent set is fixed; the bindings are not.
2. **Narrow-window composition.** Whether the fleet and lens share a screen or swap; the
   invariant is one-action return and a persistent attention count.
3. **Whether a client-side read-only posture is offered.** If so, it is a guard, clearly
   labelled advisory; the token remains full authority.
4. **OS notification integration.** Platform permissions, coalescing, and click-through details;
   the class policy is fixed.
5. **Multi-window behavior.** One instance per window or per connection; instance isolation and
   local-state keying are not negotiable.
6. **Whether to surface supervisor logs/doctor locally.** Useful diagnostics, but separate from
   orchestration state and not required for v1.
7. **Default sort within non-attention groups.** Recent activity is the recommended default;
   stable creation order is the conservative alternative. Either way, the stability rules in
   FL5 apply.
8. **How provider markdown is rendered.** CommonMark + GFM through a maintained React
   renderer. Raw HTML stays inert, remote images are links rather than auto-loads, and links
   are explicit. The package choice is recorded in `STACK.md`.
9. **Whether spawn exposes pre-session provider options** as free-form advanced fields, or only
   post-spawn from the advertised modes/config options. The honesty rule is the same either
   way.
10. **Browser or local app.** If a browser front end exists, the local bridge and token
    isolation are required; the interaction model is unchanged.

---

## Appendix A — Action → wire mapping

This is the complete action surface. Anything not listed here is not an action the dashboard
may offer in v1.

| UI action | Wire method / assembly | Notes |
|---|---|---|
| Connect / identify | `hello` | Legacy hello first if the supervisor may be older; require major 2. |
| Fleet views | `sessions.list` + `stream.subscribe { fleet: true }` | Include retained closed sessions for the Ended group. |
| Session state | `sessions.get` / fleet view | Prefer the subscribed view; `get` for a one-off refresh. |
| Session history | `sessions.read` (tail, `since`, `before`, filters, `raw` on demand) | Bounded pages; cursors preserved per session. |
| Live session events | `stream.subscribe { sessionIds }` | Re-subscribe with the new id set and current cursors; no update method. |
| Spawn | `sessions.spawn` | Idempotency key; optional prompt/wait; explicit policy/parent. |
| Send | `sessions.send` | Idempotency key; reconcile by `messageId`. |
| Queue inspect | `sessions.queue` | Active + queued with previews/ids. |
| Drop queued prompt | `sessions.queue_drop` | By message id, after preview. |
| Stop turn | `sessions.cancel { keepQueue: true }` | Queue continues. |
| Stop and discard | `sessions.cancel` | Report discarded count. |
| Close session | `sessions.close` | Graceful; `force` advanced. |
| Close subtree | client assembly: list descendants + `sessions.close` | Deepest-first; per-target results. |
| Forget | `sessions.forget` | Terminal only; history loss. |
| Rename | `sessions.rename` | Empty clears; duplicate warning. |
| Answer permission | `sessions.permit` | Option id, or allow/deny; `always` explicit. |
| Change policy | `sessions.set_policy` | `ask` warning. |
| Change provider mode | `sessions.set_mode` | Only advertised modes. |
| Change config option | `sessions.set_config_option` | Only advertised options. |
| Backends | `backends.list` | Availability and source. |
| Search in session | `sessions.read { grep }` | Literal; page loop; as-of. |
| Search instance | `sessions.list` + paged `sessions.read { grep }` | Labelled assembly; caps visible. |
| Export | paged `sessions.read` | Report count and truncation. |
| Reload config | `supervisor.reload` | Operator-only; affects new spawns only. |
| Shut down supervisor | `supervisor.shutdown` | Danger zone; export first; explicit confirmation. |
| Resume stream | `stream.subscribe` with `since` cursors | `stream.resume` capability optional. |
| Stop a subscription | `stream.unsubscribe` | When a session is closed in the UI or no longer followed. |

Not on the wire, therefore not a v1 action: logs, doctor, config show/validate (local CLI
diagnostics), `find` as a single method, bulk selectors as a single method, `@last`, and
`down` as a CLI command. If offered, they are local diagnostics or labelled client assemblies.

---

## Appendix B — Event taxonomy and default treatment

The treatment is an information hierarchy, not a visual spec.

| Event type(s) | Treatment |
|---|---|
| `session.created`, `session.initialized`, `session.renamed`, `session.closed`, `session.failed` | Structural. Summarized in the session header/terminal banner; a one-line transcript event at the point it occurred. |
| `turn.started`, `turn.ended`, `cancel.requested` | Turn skeleton. Turn headers and end markers; stop reason shown. |
| `prompt.sent`, `prompt.queued`, `prompt.discarded` | Conversation. One block per prompt with sender and message id; discarded prompts show the reason. |
| `agent.message` | Primary output. Coalesced by message id; the main reading target. |
| `agent.thought` | Secondary. Collapsed/de-emphasized by default; the collapsed summary shows the latest streamed line; the full text is available on toggle. |
| `user.message` | Conversation. Provider-reported user-role content; render as a user block, but do not treat it as the authoritative record of what the operator sent (`prompt.sent` is). |
| `session.message` | Inter-session conversation. Sender/recipient; link the sender if addressable. |
| `tool.call`, `tool.update` | Work. One row per tool call; updates mutate in place; details/raw on demand. |
| `permission.requested`, `permission.resolved` | Gate history. Actionable request + attributed resolution; one card, not repeated. |
| `plan`, `plan.update` | Provider state. Header/plan strip plus compact deltas; read-only. |
| `compaction` | Provider state. Header/status marker plus expandable summary; no raw needed. |
| `notice` | Signal. Inline with severity/time; error severity may join attention. |
| `usage` | Snapshot. Header/usage display; latest only; no cumulative claim. |
| `session.info` | Provider title. Display fallback; one-line update. |
| `policy.changed`, `mode`, `config` | State change. Header/control update plus a one-line attributed transcript event. |
| `commands` | Provider capability/availability update. Secondary; not presented as an operator action. |
| `error` | Diagnostic. Inline; does not by itself mark the session failed. |
| `stderr`, `subagent`, `raw` | Diagnostics. Available on demand; not the default reading surface. |

Unknown types: a generic row with the type and the best available title/preview from `data`,
with an explicit "inspect data" affordance. Never dropped.

---

## Appendix C — Status language cheat sheet

| Wire state | UI phrase | Must not imply |
|---|---|---|
| `starting` | "Starting" | Ready, idle. |
| `busy` | "Running turn N" | Stuck after a threshold. |
| `waiting_permission` | "Waiting for permission" | That the operator has seen it. |
| `idle` | "Idle" + queue count if any | Done. |
| `idle` with `queued > 0` | "Idle · N queued" | Settled, complete. |
| `settled: true` | "No active turn · queue empty" | Job complete. |
| `closed` | "Closed" + ended time | Failed, forgotten. |
| `failed` | "Failed" + exit/signal/last event | That the work is resumable. |
| `lastStopReason: end_turn` | "Turn ended: end_turn" | Success, completion. |
| `truncated` | "History begins at seq N"; provider fork offered when available | Complete history, or that the provider lost it. |
| `replay: true` | `history` gutter marker + `session.resumed`/`session.forked` row | New live activity. |
| Session removed | "No longer in this instance" | Forgot vs expired (the wire does not say). |
