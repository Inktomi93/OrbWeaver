---
kind: adr
status: active
updated: 2026-11-11
---

# A host call past the CPU window ends the guest

## Context

A plugin guest gets a CPU budget per invocation and per post-settle job pump. The engine enforces it with an interrupt handler that QuickJS polls only about every ten thousand calls and loop steps, never while the host is working. A guest can therefore spend its time where no poll lands:

- in host calls: one 1 MiB argument read costs 6 to 9 ms, so a loop of them ran an 8 MiB-value snippet more than a minute past a five-second window;
- in its own callbacks that a host read runs: a `toString`, a `valueOf`, a getter, or a setter on `Error.prototype` that the engine's error builder runs.

When the interrupt fires inside such a callback, the host read drops it, and the guest loops on without end. Any member who can run a snippet could hold a Worker at full CPU forever, and shutdown waited on it.

The window also counted wall time from the invocation's start, so time spent awaiting a host call used it up. A check that enforced it strictly would end every guest that awaits a slow `llm.quiet` or `net.fetch` and then calls the host.

## Decision

**Two bounds, kept apart.**

- **The CPU account bounds work.** An invocation holds one account, the per-instance budget. Each span of guest execution inside it opens a window at the account's remainder and charges the account the time it ran: the synchronous run, every pump while the invocation awaits, and the read of its result. The await between spans charges nothing. A pump outside any invocation gets a window of the whole budget.
- **The settlement wall bounds occupancy.** It ends an invocation `cpuDeadlineMs + settleGraceMs` after its synchronous run, awaiting included, and reads no window. Every guest invocation races it: activation, snippet, tool, transform, macro, event, command, UI action. A guest that chains host calls each just under `HOST_FN_DEADLINE_MS` spends almost no account and is ended there.

**The entry check.** Every host function checks the window at its entry, before it reads any argument, through `cpuWindowPassed`. The interrupt handler reads the same deadline.

- Past the window, the host ends the guest with the engine's own interrupt exception. It runs a host-owned endless step in the realm, which the passed window stops at its first poll, and hands that exception back unchanged.
- That exception is the one a guest `catch` or `finally` cannot hold, so the invocation ends as a busy loop does. A host-built error would be caught, and the loop would go on.
- The depth walk over a guest argument checks again at every node, because each node's reads can run a getter or a proxy trap.

**No host read coerces a guest value through guest code.**

- A log line or a token count takes an object or a function as its kind alone.
- `orb.host` reads its version only from a number.
- Every synchronous host throw is built with `newHostError` (`newError()` plus `defineProp`), never through the binding's `newError`, which sets the message through `setProp`.

**Homes.**

- `openCpuInvocation`, `openCpuWindow` and `cpuWindowPassed` in `packages/server/src/infra/plugin-host/cpu-guard.ts`.
- `runToSettlement` and `raceSettlement` in `packages/server/src/infra/plugin-host/sandbox.ts`.
- `newHostFunction` and `stopPastWindow` in `packages/server/src/infra/plugin-host/marshal.ts`, which build every host function the realm and the membrane install.
- `handleSafeToDump` in `packages/server/src/infra/plugin-host/membrane.ts`.
- `logText` and `orb.host` in `packages/server/src/infra/plugin-host/realm.ts`.
- Tests: `tests/server/infra/plugin-host/membrane.int.test.ts`.

## Consequences

A guest past its CPU account ends at its next host call, whatever it does inside that call, and the next invocation and a clean shutdown follow. A guest may await as long as the settlement wall allows and keep its budget for the work after. The check cannot bound four things:

- the one host call already running at the deadline: a guest `JSON.stringify` and a host `JSON.parse` of up to what fits in the guest's heap, tens to a few hundred ms;
- host work already admitted: up to the in-flight cap, each under `HOST_FN_DEADLINE_MS`, continues past the window;
- host-side handling of a host call's result, which runs outside any span;
- memory.

An interrupt inside a pump stops the guest's work but leaves that continuation's promise unsettled, so such an invocation ends at the settlement wall, spending no CPU meanwhile. A plugin that logs an object now logs its kind, not its `toString` text. A host error's `name` and `message` are read-only own properties.

## Alternatives rejected

- **A per-invocation byte cap.** It bounds bytes, not time: a loop of small calls still overruns. It needs a number that would refuse some legitimate heavy plugin. It does not reach the post-settle pumps, which open their own windows.
- **A check against the old wall-clock window.** It ends any guest that awaits a host call past its window and then calls the host.
- **A fresh window per span.** An invocation could then buy a new budget with every await, up to the settlement wall.
- **The clock check alone.** By measurement it costs 25 ns per call against 3 to 5 µs for a small crossing. But a catching loop could still swallow an interrupt fired inside a host read of guest code, so the reads were changed too.
- **A catchable host refusal past the window.** A guest that catches it keeps looping. It ends only when a poll happens to land in guest bytecode.
