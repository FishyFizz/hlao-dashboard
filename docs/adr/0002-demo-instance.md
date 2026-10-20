# 0002 — Explicit simulated instance for the demo

**Status:** accepted, 2026-10-20.

## Context

The interaction model needs to be exercised without a live HLAO supervisor:
permission gates, queueing, cancellation, spawn failures, reconnect states, and
provider-native panels. Fake data shown as live would violate the honesty rules.
A design specimen alone cannot prove the client paths.

## Decision

Ship a `DemoSupervisor` that implements the wire method and notification shapes
in the browser. It is opt-in:

- the setup screen offers **Explore demo instance** when bridge connection fails;
- `?demo=1` opens it directly;
- the top bar carries a `demo` tag and a persistent banner says the instance is
  simulated and no work runs.

The demo uses the same transport contract as the bridge, so the store, attention
ranking, subscriptions, and actions are not special-cased. It seeds a fleet with
a waiting permission, an unacknowledged failure, an error notice, busy/idle/
closed sessions, provider state, lineage, and queue items. Mutations simulate
turns and provider updates.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Seed the real app with fake sessions | Would display invented orchestration state as if the supervisor reported it. |
| Static screenshots / gallery only | Cannot exercise permission races, queue semantics, reconnect, or spawn. |
| A separate demo build or branch | Diverges from the product and stops testing the real client. |
| Auto-fallback to demo whenever the bridge is down | Hides a connection problem and blurs the boundary. The choice is explicit. |

## Consequences

- Demo state is in memory and resets on reload. Seeded session creation times
  change, so local drafts and read markers from a prior demo run become orphaned
  rather than silently retargeted.
- The demo is clearly labelled in the top bar and banner. It is not a second
  protocol; it implements the same contract for the client's benefit.
- The demo cannot be shut down from the Help danger zone; exit demo instead.
