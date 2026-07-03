---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed: the buddy `observer/` reaction engine + live bus (PD-45 / PD-64)

> **Status: designed, deferred build.** Extracted from the gutted `domains/buddy.md` — the one
> subsystem the doc designed that is NOT built (registry rows PD-45 + PD-64 in
> `core/Core-Audits-and-Debt.md`; the chat/workload event sources it needs now exist, so it is
> buddy's call to land). Everything BUILT about `domain/buddy` lives in the code:
> `packages/server/src/domain/buddy/` file headers, `packages/db/src/schema/buddy.ts`,
> `@orb/contracts/buddy`, and `tests/server/domain/buddy/`.

## What already exists (build against it, don't re-design)

- **The pure machine is BUILT.** `substrate/mood.ts` carries the reactor-facing parts unused today:
  `moodForSignal` (full `Record<BuddySignalKind, Mood>`), `resolveMood` (priority + 2-min hold
  window), `statForSignal` (intentional partial). `contract/signals.ts` carries the 12-member
  `BUDDY_SIGNAL_KINDS` vocab + the `BuddySignal` shape (userId, `dedupKey`, description).
- **The schema is BUILT.** `buddies.mood/lastReactionAt/lastSignalKey/reactionsEnabled` and the
  full `buddy_quips` table (with the sweep + CAS notes in `schema/buddy.ts`) are live;
  `verbs/set-reactions.ts` writes the toggle the observer must respect.
- **`@orb/kit/replay-buffer` is BUILT** (shared with chat/workloads) — the bus consumes it.

## The deferred build (what buddy.md designed)

**Shape** — a third named subsystem, `domain/buddy/observer/`, mediated through `substrate/` like
`agent/`/`agency/` are:

```
observer/
├── start.ts          lifecycle: wires the env event sources + timers; SIGTERM teardown
├── react.ts          the reactor (CAS write + quip-gen + mood/stat/bond growth)
├── signal-router.ts  raw lite event → owner-resolved BuddySignal → dispatch
├── signals.ts        the pure builders (workloadSignal/chatSignal/traceSignal/presenceSignal +
│                     bucket5m) — move OUT of contract/ (types-only) per the PD-64 flag in
│                     contract/signals.ts
├── trace-sampler.ts  the 30s slow-turn / error-spike poll over the observability ring
├── db-reads.ts       createBuddyObserverReads — narrow SCHEMA-level reads (not cross-feature
│                     calls): workload owner by FK; chat host from chat_participants(role='host')
│                     (D18: no chats.ownerId column)
└── canned.ts         mood-keyed fallback quips (vLLM breaker open)
```

Plus `bus.ts` (per-user `quip`/`moodChanged`/`evolved` SSE channel over the kit replay buffer +
late-subscriber replay, fanned out by a tRPC `buddy.stream` subscription), a
`contract/observer-env.ts` (`BuddyObserverEnv` — lite event shapes, no cross-feature type import,
mirroring `contract/agent-env.ts`), and the `buddy_quips` queries (insert / loadRecent / sweep to
the newest ~20 per user) in `persistence/queries.ts` (the header there reserves them).

**Injection** (assembled at `entry/`; `startBuddyObserver` is started out-of-band at the
composition root — a supervised loop, not a service verb):

| Op | Provided by | Used for |
| --- | --- | --- |
| `onWorkloadEvent` / `onChatEvent` | workloads / chat buses | the live reaction triggers |
| `readRecentTraces` | foundation/observability ring | the 30s slow-turn / error-spike sampler |
| `resolveWorkloadOwner` / `resolveChatHost` | buddy's own `db-reads.ts` | whose buddy reacts |
| `roleClients.summarize` | infra vLLM | quip generation (canned fallback on breaker-open) |

**Reactor semantics (the load-bearing bits):**

- One normalized `BuddySignal` in → at most ONE quip + mood shift + stat/bond growth out.
  Throttled by a cooldown; deduped against `buddies.lastSignalKey`.
- Bypass-cooldown signals (`workload:failed`, `trace:error-spike`) can race the same row → the
  UPDATE is an **optimistic CAS gated on the loaded `updatedAt`** (0 rows ⇒ reload + recompute),
  bounded to 3 attempts; `bondXp` stays a server-side `sql` increment (`growBond` already is).
- `react()` is **fire-and-forget** — it must never throw into the event loop (catch + log).
- A presence sweep emits `presence:idle`/`wake`/`neglected`; `buddy:evolved` fires on a
  stage/form change and rides the bus as `evolved`.
- A seated buddy must not quip-react to its own room events — the signal router drops events whose
  acting principal is the reacting owner's own agent
  (`proposed/agent-principal-design/04-buddy-transition.md` §6; land the belt with this build).

**Invariant to pin at build time:** the reactor never throws into the loop; the CAS retry is
exercised by a concurrent-write test.

## Deferred settings note

There is deliberately no `UserSettings.buddy` block — `reactionsEnabled`/`agencyEnabled` are row
columns and the cooldown/neglect thresholds are constants. Promote to settings only if per-user
tuning is actually wanted.
