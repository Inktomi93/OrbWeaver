---
kind: adr
status: active
updated: 2026-11-11
---

# A host call past the CPU window ends the guest

## Context

A plugin guest gets a CPU budget per invocation, and its continuations run in job pumps after the invocation returns. QuickJS polls the interrupt only about every ten thousand calls and loop steps, never while the host works. So a guest can spend its time where no poll lands: in host calls, or in its own callbacks a host read or write runs (a `toString`, a getter, a proxy trap, a `then` getter a resolve reads, a prototype setter). The binding drops an interrupt that fires inside such a callback. The window also counted the time spent awaiting a host call.

## Decision

**Two bounds, kept apart.**

- **The CPU account bounds work.** An invocation holds one account, the per-instance budget. Each span of guest execution inside it opens a window at the account's remainder and is charged the time it ran: the synchronous run, every settlement and pump while the invocation awaits, and the read of its result. The await between spans charges nothing.
- **Work outside an invocation spends one account per instance**, refilled only when an invocation opens. When it is spent, the host stops pumping the job queue, holds each arriving settlement host-side, and the entry check refuses any host call. After the next invocation answers, held settlements run oldest first on the refilled account until its window passes.
- **The settlement wall bounds occupancy.** It ends an invocation `cpuDeadlineMs + settleGraceMs` after its synchronous run, awaiting included. Every guest invocation races it; activation races it twice, in `evalGuest` and `settleActivationJobs`.

**Every call into the realm runs inside a span.** The span gives guest code the host reaches the open window, so an honest settlement finishes. Between spans the window reads as passed, so guest code a missed site reaches ends at its first poll. Only the realm's build, before any guest source, has no window. Each control has its own test.

**The entry check.** Every host function checks the window through `cpuWindowPassed` before it reads any argument, and again before every read or write that can run a guest callback (the depth walk, each registrar read, each host-surface `setProp`). Past the window it runs a host-owned endless step, which the interrupt stops at its first poll, and hands that uncatchable exception back unchanged. A host-built error would be caught, and a looping guest would go on.

**No host value is built, and no guest value read, through guest code.** A log line or a token count takes an object as its kind alone; `orb.host` reads only a number; a host error is an object on the realm's `Error.prototype` plus `defineProp`, never `newError()` (whose stack capture runs the guest's `Error.prepareStackTrace`); an invocation's result settles through `Promise.resolve` and `Promise.prototype.then` captured before guest code ran, never the guest's global `Promise`. The engine still runs `prepareStackTrace` for errors it builds (a backtrace for an error thrown through guest frames, a `JSON.parse` failure, the interrupt), inside the span of that guest work.

**Homes.**

- `openCpuInvocation`, `openCpuWindow`, `withinCpuWindow`, `settleInCpuWindow`, `releaseParkedSettlements`, `pumpGuestJobs` and `cpuWindowPassed` in `packages/server/src/infra/plugin-host/cpu-guard.ts`.
- `runToSettlement`, `raceSettlement` and `settleActivationJobs` in `packages/server/src/infra/plugin-host/sandbox.ts`.
- `newHostFunction`, `newHostError`, `settlementOf`, `stopPastWindow`, `readGuestProp` and `setHostProp` in `packages/server/src/infra/plugin-host/marshal.ts`.
- `handleSafeToDump` and `attachAsync` in `packages/server/src/infra/plugin-host/membrane.ts`; `logText`, `buildHostSurface` and `orb.host` in `packages/server/src/infra/plugin-host/realm.ts`.
- Tests: `tests/server/infra/plugin-host/membrane.int.test.ts` and `tests/server/infra/plugin-host/cpu-guard.test.ts`.

## Consequences

A guest past its CPU account ends at its next host call or guest-reachable host read. A guest may await as long as the wall allows and keep its budget for the work after. After its command returns, a guest's continuations and settlements hold one budget per invocation, however they chain. The window cannot bound four things:

- one poll period, whose length the guest picks (a slicing loop ran 19.8 s per period); guest code the closed window ends "at its first poll" carries the same cost;
- one native call, whose length the guest also picks (a string search ran 14 s with no poll);
- host work already admitted, up to the in-flight cap, each under `HOST_FN_DEADLINE_MS`;
- memory.

So the window does not bound how long a Worker is held. Worker termination does: D347.

An interrupt inside a pump or a settlement leaves that continuation's promise unsettled, so the invocation ends at its wall. Jobs parked on a spent outside account resume first in the next invocation's pumps, on its account, because the engine cannot drop a queued job; a runaway one ends that invocation at its wall, which counts as a strike. A plugin that logs an object logs its kind. A host error's `name` and `message` are read-only own properties, with no `stack` until the guest throws it on.

## Alternatives rejected

- **A per-invocation byte cap.** It bounds bytes, not time, and reaches no post-settle pump.
- **A check against the old wall-clock window.** It ends any guest that awaits a host call and then calls the host.
- **A fresh window per span.** An invocation could buy a new budget with every await; outside one, a chain of host calls would buy one per settlement without end.
- **Refusing host calls on a spent outside account, without parking.** A microtask chain that never calls the host would run a poll period at every pump.
- **Releasing held settlements as the next invocation opens.** A held `then` getter would spend that invocation's account before its own work.
- **One of the two settlement controls alone.** The closed window alone cuts an honest `then` getter longer than one poll; the span alone leaves a missed site unbounded.
- **A catchable host refusal past the window.** A guest that catches it keeps looping.
- **`defineProp` for the host surface.** The binding cannot make it writable, so the surface would become read-only.
