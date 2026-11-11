---
kind: adr
status: active
updated: 2026-11-11
---

# A stuck plugin Worker ends alone

## Context

The CPU window (D346) cannot end one native call or one interrupt poll period: QuickJS polls by step count, never inside a native, and the guest picks how long each runs. A string search such as `'a'.repeat(N).indexOf(…)` runs many seconds with no poll at all. While either runs, nothing in that Worker's thread runs, and a Worker drains every queued port message before any of its timers, so neither the entry check nor the settlement wall can fire. A guest can also chain spans, each short, one per floated host result.

All plugin Workers run under one broker. When a command outlives the parent's command timeout, the parent kills that broker, and every owner's resident plugins fail with it.

## Decision

**The broker ends a stuck Worker alone, before the parent's timeout.** Each Worker reports its open span of guest work, that span's window, and its running total of closed span time in shared slots. The broker reads them every `PLUGIN_WORKER_SPAN_CHECK_MS` on its own clock. It ends that Worker at either bound, past `PLUGIN_WORKER_OVERRUN_MAX_MS`:

- one span still open past its window, timed from when the broker first saw it;
- the spans of the command the Worker serves, summed since the broker first saw it as the oldest pending, past the command kind's `PLUGIN_COMMAND_CPU_BUDGET_MS`.

The allowance covers the longest honest overrun, a synchronous seam call that waits on the parent inside a span. For every command kind, the kind's budget plus the allowance, two checks and one `HOST_FN_DEADLINE_MS` of slack is under `PLUGIN_COMMAND_TIMEOUT_MS` for that kind. In order:

1. The broker cancels the runtime's bridge calls to the parent, so an in-flight `net.fetch` or `llm.quiet` aborts. A write the parent has already started runs to its end and its result is dropped; a storage write is one statement, so it lands whole.
2. The broker terminates the Worker. The guest's realm, its parked jobs, its held settlements and its pending guest promises end with it.
3. The broker tells the parent the runtime ended. The parent forgets it from the runtime pool without crashing the plugin, so the plugin's next call starts a fresh runtime from its durable source.
4. The broker answers the runtime's commands. The oldest, the one the Worker was running or was blocked behind, fails as an ended invocation; a snippet reports it as a runtime error. Any command queued behind it never ran and fails as host-unavailable. With no command pending, the ended refusal rides on the notice, and the plugin's next invocation fails with it once.

So the parent's timeout fires only when the broker itself stops answering, and the broker's watchdog ends a broker whose heartbeat stops.

**A plugin answers for its own stall, and only for its own.** The crash policy counts a rejected invocation as a strike. The plugin takes the strike for an invocation ended at its wall or by its Worker's end, for a stall after its command returned (on its next invocation), and for its own command that outlives the parent's timeout. A refusal for a runtime replaced before the command ran, for a lost or killed broker, or for shutdown is host-unavailable: a conflict, which the policy never counts, so a bystander is never struck.

**Homes.**

- `PLUGIN_WORKER_OVERRUN_MAX_MS`, `PLUGIN_WORKER_SPAN_CHECK_MS`, `PLUGIN_COMMAND_CPU_BUDGET_MS` and `PLUGIN_COMMAND_TIMEOUT_MS` in `packages/server/src/infra/plugin-host/budgets.ts`.
- `CpuSpanReport` in `packages/server/src/infra/plugin-host/contract/port.ts`: built by `packages/server/src/infra/plugin-host/worker-runtime.ts` and called by each span in `packages/server/src/infra/plugin-host/cpu-guard.ts`.
- `endStuckRuntime`, `commandOverran` and the span check in `packages/server/src/infra/plugin-host/broker-entry.ts`.
- `handleRuntimeEnded`, `owedRefusal`, the command timeout, `PluginHostUnavailableError` and `onDisconnect` in `packages/server/src/infra/plugin-host/process-runtime.ts`.
- The strike classifier `isHostAdmissionRefusal` in `packages/server/src/domain/plugin/activation/activate.ts`.
- Tests: `tests/server/infra/plugin-host/stuck-worker.int.test.ts`, `tests/server/infra/plugin-host/broker-bounds.test.ts` and `tests/server/infra/plugin-host/persistence/stall-strikes.int.test.ts`.

## Consequences

One command holds its Worker for at most its kind's budget plus `PLUGIN_WORKER_OVERRUN_MAX_MS` of guest work, one check late, and every other Worker, any owner's, keeps serving meanwhile. Work after a command returns is held to one span's window plus the allowance. A plugin whose Worker is ended is rebuilt on its next call and loses its in-memory state. A plugin that stalls repeatedly is disabled at the crash threshold. After a lost broker, a resident plugin's calls fail as host-unavailable until it is enabled again, and it is never disabled for them.

## Alternatives rejected

- **A per-command deadline in the broker.** A runtime's commands queue behind each other inside its Worker, so a command's age says nothing about whether its Worker is stuck. Its spans do.
- **One bound per span alone.** A chain of spans, each under it, holds the Worker until the parent's timeout.
- **Killing the broker at the parent's command timeout as the bound.** It ends every owner's runtimes for one guest's stall.
- **Trusting the Worker's clock for an open span's age.** A stuck Worker cannot report one; the broker times the open span by when it first saw it.
