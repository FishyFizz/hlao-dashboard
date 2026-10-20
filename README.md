# HLAO dashboard

A local dashboard for an HLAO instance. It is a **client**, not core: it speaks the supervisor's
socket protocol and uses no private access. It can be replaced or omitted without changing the
supervisor.

**Status: scaffold only.** No implementation yet. The tree, the pinned contract, and the project
rules are in place; the client and UI are not started.

## Rules this client is built against

From `docs/protocol-stability.md` (HLAO 0.10, wire protocol 2.4) and `contracts/protocol.md`:

- Require wire **major 2** and feature-detect `hello.capabilities`. Do not key behavior off the
  HLAO package version or a minor number.
- Run as a **local process** that can open the named pipe / Unix socket and read the token from
  `<HLAO_HOME>/supervisor.json`. If a browser front end is added, it talks to a local bridge and
  never receives the supervisor token.
- Treat event `data` as an open object and leave room for the provider-state fields added in
  0.11: compaction, plan, title, agent identity, and messages.
- A stream close is not data loss until resume from the last cursor reports `truncated`.

## Layout

```
contracts/protocol.md   verbatim copy of the parent repo's wire contract
src/                    client and UI (empty; not started)
README.md               this file
LICENSE                 MIT, same as the parent project
```

`contracts/protocol.md` is a **pinned copy**, not an import. It corresponds to the parent repo at
commit `52402c7` (wire protocol 2.4, 2026-10-20). Re-sync it deliberately when the parent contract
changes and this client handles the delta; do not edit it here to describe a local variant.

## Relationship to the parent repo

This is a separate git repository, checked out under the HLAO working tree for convenience. The
parent repo ignores this directory. The contract is copied rather than referenced so this project
can move out to its own checkout or remote without rewriting history.

## Non-goals for now

- No UI, client code, or dependencies.
- No changes to the supervisor or the wire protocol.
- No transport beyond the existing local socket; a browser bridge is a later decision.
