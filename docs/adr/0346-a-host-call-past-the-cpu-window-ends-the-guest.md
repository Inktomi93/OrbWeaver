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
- **Work outside an invocation spends one account per instance.** A settlement or a pump outside any invocation opens its window at that account's remainder and charges it. Only an invocation's opening refills it. When it is spent, the host stops pumping the instance's job queue until the next invocation opens, and the entry check refuses any host call such work makes.
- **The settlement wall bounds occupancy.** It ends an invocation `cpuDeadlineMs + settleGraceMs` after its synchronous run, awaiting included, and reads no window. Every guest invocation races it: activation, snippet, tool, transform, macro, event, command, UI action. Activation races it twice, in `evalGuest` and then in `settleActivationJobs`, so activation can hold its runtime for two walls. A guest that chains host calls each just under `HOST_FN_DEADLINE_MS` spends almost no account and is ended there.

**Every call into the realm runs inside a span.** Between spans the window reads as passed, so guest code that a missed site reaches is ended at its first poll. Only the realm's build, before any guest source runs, has no window.

**The entry check.** Every host function checks the window at its entry, before it reads any argument, through `cpuWindowPassed`. The interrupt handler reads the same deadline.

- Past the window, the host ends the guest with the engine's own interrupt exception. It runs a host-owned endless step in the realm, which the passed window stops at its first poll, and hands that exception back unchanged.
- That exception is the one a guest `catch` or `finally` cannot hold, so the invocation ends as a busy loop does. A host-built error would be caught, and the loop would go on.
- The host checks again before every read or write that can run a guest callback: each property read and key enumeration of the depth walk, each registrar read, and each `setProp` that builds the host surface.

**No host read coerces a guest value through guest code.**

- A log line or a token count takes an object or a function as its kind alone.
- `orb.host` reads its version only from a number.
- Every synchronous host throw is built with `newHostError` (`newError()` plus `defineProp`), never through the binding's `newError`, which sets the message through `setProp`.

**Homes.**

- `openCpuInvocation`, `openCpuWindow`, `withinCpuWindow`, `pumpGuestJobs` and `cpuWindowPassed` in `packages/server/src/infra/plugin-host/cpu-guard.ts`.
- `runToSettlement`, `raceSettlement` and `settleActivationJobs` in `packages/server/src/infra/plugin-host/sandbox.ts`.
- `newHostFunction`, `stopPastWindow`, `readGuestProp` and `setHostProp` in `packages/server/src/infra/plugin-host/marshal.ts`, which build every host function the realm and the membrane install.
- `handleSafeToDump` and `attachAsync` in `packages/server/src/infra/plugin-host/membrane.ts`.
- `logText`, `buildHostSurface` and `orb.host` in `packages/server/src/infra/plugin-host/realm.ts`.
- Tests: `tests/server/infra/plugin-host/membrane.int.test.ts`.

## Consequences

A guest past its CPU account ends at its next host call or its next guest-reachable host read, and the next invocation and a clean shutdown follow. A guest may await as long as the settlement wall allows and keep its budget for the work after. After its command returns, a guest's continuations hold one budget in total until the host invokes it again, whether they chain through host calls, through refused host calls or through microtasks alone. The check cannot bound four things:

- one poll period of guest work: a loop whose body is a heavy native call, such as a wide `Array.prototype.slice`, overruns by that call's time once per poll, with no host call needed;
- the one native call already running at the deadline, such as a guest `JSON.stringify` or a host `JSON.parse` of up to what fits in the guest's heap;
- host work already admitted: up to the in-flight cap, each under `HOST_FN_DEADLINE_MS`, continues past the window;
- memory.

An interrupt inside a pump or a settlement stops the guest's work but leaves that continuation's promise unsettled, so such an invocation ends at the settlement wall, spending no CPU meanwhile.

Jobs parked on a spent outside account resume under the next invocation, because the engine keeps one job queue per runtime and cannot drop a job short of disposing the context. The next invocation's own pumps run them first, on its account. A plugin author sees continuations that pause until the plugin is next invoked. A runaway continuation spends that invocation's account before the invocation's own result settles, so the invocation ends at its wall, which starts after its synchronous run, and counts toward the crash policy's auto-disable. A settlement under a spent account still runs, in a passed window: a guest getter it reaches ends at its first poll, and that guest promise then never settles. A plugin that logs an object now logs its kind, not its `toString` text. A host error's `name` and `message` are read-only own properties.

## Alternatives rejected

- **A per-invocation byte cap.** It bounds bytes, not time: a loop of small calls still overruns. It needs a number that would refuse some legitimate heavy plugin. It does not reach the post-settle pumps.
- **A check against the old wall-clock window.** It ends any guest that awaits a host call past its window and then calls the host.
- **A fresh window per span.** An invocation could then buy a new budget with every await, up to the settlement wall. Outside an invocation, a chain of host calls would buy a new budget with every settlement, without end, and a chain through refusals that need no I/O would never return the Worker to its event loop.
- **Refusing host calls on a spent outside account, without parking the queue.** A chain of microtasks that never calls the host would then run up to one poll period at every pump, and every settlement pumps.
- **Dropping parked jobs.** The engine offers no call that removes a queued job short of disposing the context.
- **The clock check alone.** By measurement it costs 25 ns per call against 3 to 5 µs for a small crossing. But a catching loop could still swallow an interrupt fired inside a host read of guest code, so the reads were changed too.
- **A catchable host refusal past the window.** A guest that catches it keeps looping. It ends only when a poll happens to land in guest bytecode.
- **`defineProp` for the host surface.** It runs no guest setter, but the binding cannot make the property writable, so the surface would become read-only.
