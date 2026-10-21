# Changelog

## Unreleased

- Replaced the transcript's independent **System** toggle with one view-mode
  control: **Default**, **System**, and **Minimal**. Minimal keeps agent,
  operator, and peer messages and collapses the work between them into one
  expandable row: tool calls, MCP calls, and thoughts are counted, and the row
  shows the latest tool/MCP name or the last streamed thought line. Failures,
  notices, discarded prompts, and terminal markers stay visible. MCP calls are
  recognized from adapter naming (`mcp__<server>__<tool>`) or explicit markers
  because the wire has no MCP event type.
- Collapsed thoughts now show the latest streamed line (the tail is kept when a
  line is too long) instead of only a character count. The full thought is
  still one click away. Consecutive thought chunks without a message id now
  coalesce into one continuous thought, so the minimal-mode count is a count of
  thoughts rather than chunks.
- `npm start -- --home DIR` starts the local bridge (4780) and the Vite dev
  server (5173) together, passes the home through to the bridge, and stops both
  on Ctrl-C. `HLAO_HOME` is honoured when `--home` is omitted; `--vite-port`
  changes only the page port. `server/dev.mjs` is the launcher.
- Pinned wire projection updated to 2.8: `sessions.read` accepts
  `afterAt`/`beforeAt`, `regex`, and `context`; `ReadResult` carries optional
  `matchedSeqs`; and `SessionView.firstPrompt` is a display-only fallback for a
  session with no operator name or provider title. The fleet rail, search, and
  Inspector use it; the demo supervisor advertises the four new capabilities and
  honors the filters. `contracts/protocol.md` is re-synced from the parent repo.
  The setup screen now reads the protocol constants instead of a hardcoded
  wire 2.7 label.
- Provider session identity and recovered history. Diagnostics shows the
  durable provider id and the fork source; the spawn form can resume it
  (`spawn.resume`) or fork a copy (`spawn.fork`), and the Inspector offers both
  actions. Events restored by ACP `session/load` carry `replay: true` and are
  marked `history` in the gutter; the replay boundary is not counted as unread
  activity, and `session.resumed` / `session.forked` rows mark it explicitly.
- When the bounded live log evicts, the transcript banner now says the provider
  still holds the transcript and offers "Fork to open history" when the
  supervisor advertises `spawn.fork`. The message no longer implies the record
  is gone.
- Pinned wire projection updated to 2.7: `spawn.resumeSessionId` /
  `forkSessionId`, `SpawnResult.resumed` / `forked`, `SessionView.forkedFrom`,
  `EventView.replay`, and the `session.resumed` / `session.forked` event types.
  The demo supervisor advertises both capabilities and synthesizes replayed
  history. `contracts/protocol.md` is re-synced from the parent repo.
- Export includes `replayedEvents` and labels a transcript whose history was
  restored by the provider.
- Fixed tool-call details in the transcript. Live events and ordinary pages
  carry no private ACP payloads, so opening a tool row now reads that call once
  with `raw: true` and shows the provider's actual input and output labelled as
  raw provider data. An adapter's empty initial `rawInput`/`content` no longer
  masks the real value from a later update, the newest output wins, and the
  header title reflects the command reported by `tool.update`.
- Replaced the provider effort slider with a cyan-filled segmented bar, matching
  the permission policy selector's shape.
- Maintenance pass, no surface changes: one status vocabulary (full label,
  short label, lamp class) shared by the rail, tables, and specimen; one
  terminal-session predicate; one local-id helper, wire-error reader, and set of
  capability names; and one `Notice` component for the repeated warning markup.
  Attention notifications and the live-region announcer, hash routing, and the
  spawn cwd browser now live in their own modules. Transcript rows share one
  frame/gutter/meta shell. Removed dead exports and unused CSS rules. Small
  consistency fixes: the command-palette hint uses the documented "running"
  label, previous-attention with nothing selected starts at the first item, and
  the demo shutdown reports the contracted `retainedDiscarded` count.
- Rendered provider markdown in transcript messages with `react-markdown`,
  `remark-gfm`, and `remark-breaks`: headings, lists, tables, task lists,
  quotes, links, and fenced code. Code blocks have their own copy control.
  Raw HTML stays inert, external links open explicitly, and remote images are
  shown as links instead of being auto-loaded.
- Preserved whitespace-only streamed message chunks. They carry spaces and the
  blank lines that separate Markdown headings, lists, and tables; dropping them
  merged those blocks into the preceding line (seen in smoke-run2 seq 12652).
- Matched the fleet refresh control to the 24px Sort/Ended row and reduced its
  icon to 14px.
- Fixed the shell grid when no banner is present: the status bar no longer
  lands in the zero-height row and the 24px footer stays at the bottom.
- Removed infinite lamp animations. State is carried by static fill/outline;
  long-lived fleet and session views no longer pin a compositor/SwiftShader
  core.
- Coalesced supervisor notifications into a 50ms store pass, moved age labels
  to one shared clock, and paused tail-follow immediately on wheel-up so a
  live burst cannot outrun a scrolling operator.
- Compacted the session lens: one-line permission/usage rows, a single tool
  header, a two-row composer, and a transcript that yields space so the
  composer stays inside the viewport.
- Removed the "Load older events" button. Earlier pages now load automatically
  near the top, preserve the reading anchor, and stop at an honest 10,000-event
  local cap.
- Made secondary metadata quiet by default. The state strip now shows policy,
  turn, context, last event, and unread; provider mode, cwd, agent package,
  cost, timestamps, creator, and instance are behind "More". Provider details,
  usage details, permission consequences, lineage, and diagnostics are
  collapsed until requested.
- Removed the duplicate "Spawn a replacement" action from the disabled
  terminal composer; the terminal banner is the single action.
- Normalized structural transcript text to the 9px event scale (usage,
  permission, plan rows).
- Hid usage, plan, and compaction stream rows by default behind a "System"
  transcript toggle; current usage remains in the state strip and inspector.
- Aligned the state-strip facts on one 16px line and turned "More" into a fixed
  anchor with an overlaying details panel, so opening it no longer reflows the
  strip or moves the toggle.
- Removed the extra transcript/composer frame layers, made the editor three
  rows tall and vertically resizable, removed the always-on composer footer,
  and showed transcript jump/action controls only when they are needed. The
  transcript and editor now use the reclaimed height for content.
- Reduced copy affordances to 18px in transcript rows, the inspector, state
  details, and the session header.
- Removed the redundant LIVE/handle title from the transcript bar; the range
  and follow state remain.
- Coalesced permission requests and their resolutions into one transcript line.
- Removed the separate "Inspect payload" row: the tool header is now the
  toggle, with a compact `+`/`-` marker.
- Serialized object-shaped tool input/output and fell back to the reported tool
  title, eliminating false "No payload reported" rows for Bash calls.
- Extended the **System** transcript filter to cover stderr, command lists,
  session initialization, and session info, so adapter startup chatter no longer
  floods the beginning of a session. Errored/in-progress compaction remains
  visible.
- Turned the closed/failed terminal status into a full-width band with a single
  bottom rule, aligned with the state strip and transcript instead of retaining
  the old inset card frame.
- Switched the whole UI to Geist Mono and removed the unused Geist sans font.
- Collapsed the provider panel to a single `"<backend> details"` disclosure.
- Replaced the permission-policy select with a full-width segmented bar; the
  selected fill is status-colored (allow green, ask amber, deny red).
- Rendered provider effort config options as a discrete, labeled slider and
  committed changes on release rather than during the drag.
- Rebuilt the spawn panel around the prompt: prompt first, backend/name on one
  row, and all field hints removed.
- Added bridge-backed cwd browsing with parent/drive navigation and a
  `Use this folder` action; demo mode hides it because there is no filesystem.
- Reused the color-coded policy selector in spawn with three states and allow
  selected by default; removed the "config default" choice.
- Fixed the spawn-dialog toggle thumb (vertically centered, full 14px travel).

## 0.1.0 — 2026-10-20

- Added the live dashboard: structural attention, fleet rail and home table,
  session lens, permission gate, paged transcript, composer and queue, spawn,
  search, command palette, lifecycle actions, provider panels, export, and
  keyboard navigation.
- Added the local Node bridge: loopback HTTP + SSE, persistent supervisor
  stream, stable-per-home UI key, Origin checks, static serving, and reconnect.
- Added the versioned local persistence boundary for operator state, URL
  restoration by handle plus creation time, restart clearing, and orphaned
  drafts.
- Added the explicitly labelled simulated supervisor for demo mode, with seeded
  permission, failure, notice, provider, lineage, and queue states.
- Added Vitest coverage for attention ranking, unread bounds, target
  resolution, event sequencing, transcript coalescing, and the demo
  supervisor.
- Added architecture and ADR documentation; updated README, DESIGN, and STACK.
