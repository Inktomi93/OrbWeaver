---
kind: adr
status: active
updated: 2026-11-12
---

# No plugin owner holds the whole Worker pool

## Context

All plugin Workers run under one broker and are shared across owners. A Worker in use can stay held for a span bound (D347), and one member may run several snippets or own several plugins. When one owner held every Worker, another owner's call waited for that owner's stuck work: 15.5 s measured.

The common install has one owner. A Worker reserved there for an owner who does not exist costs that owner a Worker and protects no one.

## Decision

**While more than one owner can run plugin code, an owner holds at most all but one of the Workers in use.** `pluginOwnerShare(capacity)` is `max(1, capacity − 1)`. An owner is a resident plugin's installer or the member running a snippet. A Worker is in use while a lease pins it; an idle warm runtime does not count, so residency is unchanged.

**A sole owner uses every Worker.** The owners who can run plugin code are the owners of every enabled resident plugin, running or asleep, and the owners of the runtimes and requests the pool holds. The host holds all of them in memory, so no call reads the database to decide. A member who may run snippets but has run none counts from its first request. A disabled owner whose plugin stays loaded (D147) still counts until the next boot.

**A second owner's first request, while a sole owner holds every Worker, waits for the first Worker to free.** A Worker in use cannot be taken back, so the wait is at most that Worker's span bound. From the moment the request is queued the share binds for every owner, so the freed Worker goes to the newcomer, never to the first owner's next call.

**Every owner holds at most all but one of the request queue,** a sole owner included. That costs a sole owner one place it does not notice, and it guarantees a second owner's first request a place.

**A request that cannot proceed is passed over, never waited on.** That covers an owner at its share, and a runtime still starting. The pool serves the next request it can, in arrival order.

**An owner's call past its share waits for one of that owner's own Workers.** It is not refused, because a resident call is set off by events the member did not start one by one. Past the queue share it is refused as busy, retryable, never a strike.

A pool of one Worker cannot be shared. The share is then the whole pool and this guarantee does not hold.

**Homes.**

- `pluginOwnerShare` and `PLUGIN_RUNTIME_REQUEST_QUEUE_MAX` in `packages/server/src/infra/plugin-host/budgets.ts`.
- The admission, the owners and the drain in `packages/server/src/infra/plugin-host/warm-runtime-pool.ts`. The resident owners come from the logical bindings in `packages/server/src/infra/plugin-host/process-runtime.ts`.
- `owner` on the process host's inputs in `packages/server/src/infra/plugin-host/contract/port.ts`, set by `packages/server/src/domain/plugin/activation/activate.ts` and `packages/server/src/domain/plugin/verbs/run-snippet.ts`.
- Tests: `tests/server/infra/plugin-host/warm-runtime-pool.test.ts` and `tests/server/infra/plugin-host/stuck-worker.int.test.ts`.

## Consequences

With a second owner present, another owner's call never waits on one owner's work: with that owner at its share, a Worker is free of it or held by someone else. A sole owner keeps every Worker. Warm residency is unchanged.

## Alternatives rejected

- **Reserve a Worker in every install.** It costs the common single-owner install a Worker for a contention that cannot occur there.
- **Reserve Workers only while another owner waits, with no share.** A stuck Worker cannot be taken back, so the waiting owner waits for every stuck Worker in turn.
- **Refuse the over-share call.** It fails tool calls and transforms the member did not start one by one, for concurrency the member cannot see.
- **Cap concurrent snippets below the Worker count.** Resident invokes take Workers too, and one owner's plugins could still hold them all.
