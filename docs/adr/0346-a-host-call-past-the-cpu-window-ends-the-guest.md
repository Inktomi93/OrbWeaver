---
kind: adr
status: active
updated: 2026-11-11
---

# A host call past the CPU window ends the guest

## Context

A plugin guest gets a CPU budget per invocation, and its continuations run in job pumps after the invocation returns. The engine enforces it with an interrupt handler that QuickJS polls only about every ten thousand calls and loop steps, never while the host is working. A guest can therefore spend its time where no poll lands:

- in host calls: one 1 MiB argument read costs 6 to 9 ms, so a loop of them ran an 8 MiB-value snippet more than a minute past a five-second window;
- in its own callbacks that a host read or write runs: a `toString`, a `valueOf`, a getter, a proxy trap, a `then` getter that a promise resolve reads, or a setter on a prototype that a host `setProp` runs.

When the interrupt fires inside such a callback, the host read drops it, and the guest runs on. One host call that runs many such callbacks overruns by one poll period per callback. Guest code that the host reaches with no window open runs without any bound.

The window also counted wall time from the invocation's start, so time spent awaiting a host call used it up. A check that enforced it strictly would end every guest that awaits a slow `llm.quiet` or `net.fetch` and then calls the host.

## Decision

**Two bounds, kept apart.**

- **The CPU account bounds work.** An invocation holds one account, the per-instance budget. Each span of guest execution inside it opens a window at the account's remainder and charges the account the time it ran: the synchronous run, every settlement of a host call's guest promise and every pump while the invocation awaits, and the read of its result. The await between spans charges nothing.
- **Work outside an invocation spends one account per instance.** A settlement or a pump outside any invocation opens its window at that account's remainder and charges it. Only an invocation's opening refills it. When it is spent, the host runs no more guest work for the instance: it stops pumping the job queue, holds each arriving settlement host-side, and the entry check refuses any host call such work makes. After the next invocation answers, the host releases the held settlements, oldest first, on the refilled account, and holds the rest again once that window passes.
- **The settlement wall bounds occupancy.** It ends an invocation `cpuDeadlineMs + settleGraceMs` after its synchronous run, awaiting included, and reads no window. Every guest invocation races it: activation, snippet, tool, transform, macro, event, command, UI action. Activation races it twice, in `evalGuest` and then in `settleActivationJobs`, so activation can hold its runtime for two walls. A guest that chains host calls each just under `HOST_FN_DEADLINE_MS` spends almost no account and is ended there.

**Every call into the realm runs inside a span.** The span gives guest code the host reaches, such as a `then` getter a settlement reads, the open window, so it finishes or is charged and interrupted like any guest work. Between spans the window reads as passed, so guest code that a missed site reaches is ended at its first poll. Only the realm's build, before any guest source runs, has no window. The two controls are kept apart: the span keeps an honest settlement whole, and the closed window bounds a site the span list missed.

**The entry check.** Every host function checks the window at its entry, before it reads any argument, through `cpuWindowPassed`. The interrupt handler reads the same deadline.

- Past the window, the host ends the guest with the engine's own interrupt exception. It runs a host-owned endless step in the realm, which the passed window stops at its first poll, and hands that exception back unchanged.
- That exception is the one a guest `catch` or `finally` cannot hold, so the invocation ends as a busy loop does. A host-built error would be caught, and the loop would go on.
- The host checks again before every read or write that can run a guest callback: each property read and key enumeration of the depth walk, each registrar read, and each `setProp` that builds the host surface.

**No host value is built, and no guest value read, through guest code.**

- A log line or a token count takes an object or a function as its kind alone.
- `orb.host` reads its version only from a number.
- Every host error is built with `newHostError`: an object on the realm's `Error.prototype` plus `defineProp`. Never `newError()`, whose stack capture runs the guest's `Error.prepareStackTrace`, and never the binding's thrown-error path, which sets the message through `setProp`.
- An invocation's result settles through `Promise.resolve` and `Promise.prototype.then` captured before guest code ran, never the guest's global `Promise`.
- The engine still builds a backtrace when an error object is thrown through guest frames, and it builds errors of its own (a `JSON.parse` failure, the interrupt); each runs the guest's `prepareStackTrace` inside the span of that guest work.

**Homes.**

- `openCpuInvocation`, `openCpuWindow`, `withinCpuWindow`, `settleInCpuWindow`, `releaseParkedSettlements`, `pumpGuestJobs` and `cpuWindowPassed` in `packages/server/src/infra/plugin-host/cpu-guard.ts`.
- `runToSettlement`, `raceSettlement` and `settleActivationJobs` in `packages/server/src/infra/plugin-host/sandbox.ts`.
- `newHostFunction`, `newHostError`, `settlementOf`, `stopPastWindow`, `readGuestProp` and `setHostProp` in `packages/server/src/infra/plugin-host/marshal.ts`, which build every host function the realm and the membrane install.
- `handleSafeToDump` and `attachAsync` in `packages/server/src/infra/plugin-host/membrane.ts`.
- `logText`, `buildHostSurface` and `orb.host` in `packages/server/src/infra/plugin-host/realm.ts`.
- Tests: `tests/server/infra/plugin-host/membrane.int.test.ts` and `tests/server/infra/plugin-host/cpu-guard.test.ts`.

## Consequences

A guest past its CPU account ends at its next host call or its next guest-reachable host read. A guest may await as long as the settlement wall allows and keep its budget for the work after. After its command returns, a guest's continuations and settlements hold one budget per invocation, whether they chain through host calls, through refused host calls, through microtasks alone or through `then` getters on settled results. The check cannot bound four things:

- one poll period of guest work, whose length the guest picks: a loop whose body is a heavy native call, such as a wide `Array.prototype.slice`, overruns by that call's time once per poll, with no host call needed (one period measured 19.8 s). Guest code that the closed window ends "at its first poll" carries the same cost;
- one native call, whose length the guest also picks: a string search such as `'a'.repeat(N).indexOf(…)` runs with no poll at all, for as long as its inputs make it (14 s measured at a few hundred KB, far under the heap cap);
- host work already admitted: up to the in-flight cap, each under `HOST_FN_DEADLINE_MS`, continues past the window;
- memory.

So the window alone does not bound how long a Worker is held: one native call or one poll period can outlive the parent's command timeout.

An interrupt inside a pump or a settlement stops the guest's work but leaves that continuation's promise unsettled, so such an invocation ends at the settlement wall, spending no CPU meanwhile.

Jobs parked on a spent outside account resume under the next invocation, because the engine keeps one job queue per runtime and cannot drop a job short of disposing the context. The next invocation's own pumps run them first, on its account. A plugin author sees continuations that pause until the plugin is next invoked. A runaway continuation spends that invocation's account before the invocation's own result settles, so the invocation ends at its wall, which starts after its synchronous run, and counts toward the crash policy's auto-disable. Held settlements keep their results host-side and run after the next invocation answers, so a guest `then` getter on a held result never spends the account of the invocation that releases it. A plugin that logs an object now logs its kind, not its `toString` text. A host error's `name` and `message` are read-only own properties, and it has no `stack` until the guest throws it on.

## Alternatives rejected

- **A per-invocation byte cap.** It bounds bytes, not time: a loop of small calls still overruns. It needs a number that would refuse some legitimate heavy plugin. It does not reach the post-settle pumps.
- **A check against the old wall-clock window.** It ends any guest that awaits a host call past its window and then calls the host.
- **A fresh window per span.** An invocation could then buy a new budget with every await, up to the settlement wall. Outside an invocation, a chain of host calls would buy a new budget with every settlement, without end, and a chain through refusals that need no I/O would never return the Worker to its event loop.
- **Refusing host calls on a spent outside account, without parking the queue.** A chain of microtasks that never calls the host would then run up to one poll period at every pump, and every settlement pumps.
- **Dropping parked jobs.** The engine offers no call that removes a queued job short of disposing the context.
- **Releasing held settlements as the next invocation opens.** A held `then` getter would then spend that invocation's account before its own work, and the invocation would end at its wall.
- **One of the two settlement controls alone.** The closed window alone ends an honest `then` getter longer than one poll, and that await never resumes. The span alone leaves a missed site unbounded.
- **The clock check alone.** By measurement it costs 25 ns per call against 3 to 5 µs for a small crossing. But a catching loop could still swallow an interrupt fired inside a host read of guest code, so the reads were changed too.
- **A catchable host refusal past the window.** A guest that catches it keeps looping. It ends only when a poll happens to land in guest bytecode.
- **`defineProp` for the host surface.** It runs no guest setter, but the binding cannot make the property writable, so the surface would become read-only.
