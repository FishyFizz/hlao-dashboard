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
