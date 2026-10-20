# Changelog

## Unreleased

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
