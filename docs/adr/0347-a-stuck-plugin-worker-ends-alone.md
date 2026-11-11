---
kind: adr
status: active
updated: 2026-11-11
---

# A stuck plugin Worker ends alone

## Context

The CPU window (D346) cannot end one native call or one interrupt poll period: QuickJS polls by step count, never inside a native, and the guest picks how long each runs. A string search such as `'a'.repeat(N).indexOf(…)` ran 14 s with no poll at all, and one poll period of a slicing loop ran 19.8 s. While either runs, nothing in that Worker's thread runs, so neither the entry check nor the settlement wall can fire.

The parent then killed the one broker that serves every owner at its command timeout. Every other owner's resident plugins failed, each failed call counted as a strike, and a bystander plugin ended disabled as errored.

## Decision

**The broker ends a stuck Worker alone.** Each Worker reports its open span of guest work and that span's window in two shared slots. The broker reads them every `PLUGIN_WORKER_SPAN_CHECK_MS` on its own clock, noting when it first saw each span. A span still open `PLUGIN_WORKER_OVERRUN_MAX_MS` past its window ends that Worker. The allowance covers the longest honest overrun, a synchronous seam call that waits on the parent inside a span. In order:

1. The broker cancels the runtime's bridge calls to the parent, so an in-flight `net.fetch` or `llm.quiet` aborts. A write the parent has already started runs to its end and its result is dropped; a storage write is one statement, so it lands whole.
2. The broker terminates the Worker. The guest's realm, its parked jobs, its held settlements and its pending guest promises end with it.
3. The broker tells the parent the runtime ended. The parent forgets it from the runtime pool without crashing the plugin, so the plugin's next call starts a fresh runtime from its durable source.
4. The broker answers the runtime's commands. The oldest, the one the Worker was running or was blocked behind, fails as an ended invocation; a snippet reports it as a runtime error. Any command queued behind it never ran and fails as host-unavailable.

The broker is killed only when the broker itself stops answering: its watchdog ends it when its heartbeat stops, and the parent ends it when a command outlives the parent's command timeout.

**A teardown a plugin did not cause is never a strike against it.** The crash policy counts a rejected invocation as a strike. A refusal for a runtime replaced before the command ran, for a lost or killed broker, or for shutdown is host-unavailable: a conflict, which the policy never counts. The plugin whose own invocation outran its window takes the strike.

**Homes.**

- `PLUGIN_WORKER_OVERRUN_MAX_MS` and `PLUGIN_WORKER_SPAN_CHECK_MS` in `packages/server/src/infra/plugin-host/budgets.ts`.
- `CpuSpanReport` in `packages/server/src/infra/plugin-host/contract/port.ts`: built by `packages/server/src/infra/plugin-host/worker-runtime.ts` and called by each span in `packages/server/src/infra/plugin-host/cpu-guard.ts`.
- `endStuckRuntime` and the span check in `packages/server/src/infra/plugin-host/broker-entry.ts`.
- `handleRuntimeEnded`, `PluginHostUnavailableError` and `onDisconnect` in `packages/server/src/infra/plugin-host/process-runtime.ts`.
- The strike classifier `isHostAdmissionRefusal` in `packages/server/src/domain/plugin/activation/activate.ts`.
- Tests: `tests/server/infra/plugin-host/stuck-worker.int.test.ts`.

## Consequences

A Worker is held at most a span's window plus `PLUGIN_WORKER_OVERRUN_MAX_MS`, one check late, and every other Worker, any owner's, keeps serving meanwhile. A plugin whose invocation is ended this way is rebuilt on its next call and loses its in-memory state. A plugin that stalls every invocation takes a strike each time and is disabled at the crash threshold. After a lost broker, a resident plugin's calls fail as host-unavailable until it is enabled again, and it is never disabled for them.

## Alternatives rejected

- **A per-command deadline in the broker.** A runtime's commands queue behind each other inside its Worker, so a command's age says nothing about whether its Worker is stuck. The open span does.
- **Killing the broker at the parent's command timeout as the bound.** It ends every owner's runtimes for one guest's stall.
- **Trusting the Worker's clock for the span's age.** A stuck Worker cannot report one; the broker times the span by when it first saw it.
