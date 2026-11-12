---
kind: adr
status: active
updated: 2026-11-11
---

# A stuck plugin Worker ends alone

## Context

The CPU window (D346) cannot end one native call or one interrupt poll period: QuickJS polls by step count, never inside a native, and the guest picks how long each runs. While either runs, nothing in that Worker's thread runs, and a Worker drains every queued port message before any of its timers, so neither the entry check nor the settlement wall can fire. A guest can also chain spans, each short, one per floated host result.

All plugin Workers run under one broker. When the broker ends, every owner's resident plugins fail with it, so nothing one plugin does may end it.

## Decision

**The broker ends a stuck Worker alone.** Each Worker reports its open span of guest work, that span's window, and its running total of closed span time in shared slots. The broker reads them every `PLUGIN_WORKER_SPAN_CHECK_MS` on its own clock. It ends that Worker at either bound, past `PLUGIN_WORKER_OVERRUN_MAX_MS`:

- one span still open past its window, timed from when the broker first saw it;
- the spans of the command the Worker serves, summed since the broker first saw it as the oldest pending, past the command kind's `PLUGIN_COMMAND_CPU_BUDGET_MS`.

The allowance covers the longest honest overrun, a synchronous seam call that waits on the parent inside a span. In order:

1. The broker cancels the runtime's bridge calls to the parent, so an in-flight `net.fetch` or `llm.quiet` aborts. A write the parent has already started runs to its end and its result is dropped; a storage write is one statement, so it lands whole.
2. The broker terminates the Worker. Its realm, parked jobs, held settlements and pending guest promises end with it.
3. The broker tells the parent the runtime ended. The parent forgets it from the runtime pool without crashing the plugin, whose next call starts a fresh runtime.
4. The broker answers the runtime's commands. The oldest, the one the Worker was running or was blocked behind, fails as an ended invocation; a snippet reports it as a runtime error. Any command queued behind it never ran and fails as host-unavailable. With no command pending, the ended refusal rides on the notice, and the plugin's next invocation fails with it once.

**Only liveness replaces the broker.** The broker's main thread writes its watchdog a heartbeat, stamped with its send time, every `PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS`. It writes on its own pipe (`PLUGIN_BROKER_BEAT_FD`) from a timer no command or Worker touches, so no beat waits behind a frame. The write never blocks that thread: a beat due while the last is unwritten is skipped, so a stalled watchdog leaves the broker serving and costs at most one miss. The watchdog judges on the same period, after it has read the beats waiting in that pipe. An interval counts as missed only when that judgement finds no newer beat. After `PLUGIN_BROKER_HEARTBEAT_MISSES_MAX` consecutive misses the watchdog ends the broker, and the parent fails every command the broker held as host-unavailable. Before the first beat only the start-up deadline applies. No command timer ends the broker.

The bound is eight times the worst send gap of healthy brokers, 125 ms, measured on loaded floor runs, cold broker starts and a surface walk. So a broker that stops answering ends about 1 s later. Liveness means nothing on a swapping host, where a stall can outlast any bound. A full IPC queue ends no process: it refuses the one frame that would overflow it (D348).

**Repeated broker losses are bounded.** A lone loss recovers at once. Inside `PLUGIN_BROKER_LOSS_WINDOW_MS` each further loss holds every plugin call for `pluginBrokerRestartHoldMs`, which doubles, so a loss a call can cause repeats only that often. One loss past `PLUGIN_BROKER_LOSSES_MAX` stops the host until the server restarts, and each resident plugin's row records why. Losses close together mean something reproduces one, and an outage the owner reads beats a silent loop.

**A late command fails alone.** The parent times only each runtime's oldest outstanding command, from when it became the oldest, so time queued behind earlier commands is never charged to it. `EVENT_QUEUE_DEPTH` bounds the queue and refuses the next invoke. A runtime starts its next invoke one macrotask after the previous one answers, so the broker never charges that invoke's first span to the command before it. Past `PLUGIN_COMMAND_TIMEOUT_MS` for its kind, the parent fails that command as an ended invocation and asks the broker to end the runtime; the broker does so, as above, only if it still holds that command. For every kind, the worst case is under that backstop: the budget, the allowance and two checks, the settlement walls the kind waits out, the host work no span counts, one `HOST_FN_DEADLINE_MS` of slack, and the liveness bound. The slack is chosen, about twice the slowest Worker start measured (2.65 s).

**A plugin answers for its own stall, and only for its own.** The crash policy counts a rejected invocation as a strike. The plugin takes the strike for an invocation ended at its wall or by its Worker's end, for a stall after its command returned (on its next invocation), and for its own command that runs past the parent's backstop. A refusal for a runtime replaced before the command ran, for a broker replaced on its heartbeat or otherwise lost, or for shutdown is host-unavailable: a conflict, which the policy never counts. A command still inside its worst case when the broker hangs fails with the broker, never at its backstop, so a broker hang strikes no plugin and a bystander is never struck. A watchdog hang has no check of its own and falls to the backstops, which strike.

**Homes.**

- `PLUGIN_WORKER_OVERRUN_MAX_MS`, `PLUGIN_WORKER_SPAN_CHECK_MS`, `PLUGIN_COMMAND_CPU_BUDGET_MS`, `PLUGIN_COMMAND_TIMEOUT_MS`, `PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS`, `PLUGIN_BROKER_HEARTBEAT_MISSES_MAX`, `PLUGIN_BROKER_LIVENESS_BOUND_MS` and the loss bound in `packages/server/src/infra/plugin-host/budgets.ts`; `PLUGIN_BROKER_BEAT_FD` in `packages/server/src/infra/plugin-host/process-protocol.ts`.
- The heartbeat check in `broker-watchdog.ts` and `watchdog-policy.ts`.
- The invoke queue in `packages/server/src/infra/plugin-host/port.ts`.
- `CpuSpanReport` in `packages/server/src/infra/plugin-host/contract/port.ts`: built by `worker-runtime.ts`, called by each span in `cpu-guard.ts`.
- The heartbeat, `endStuckRuntime`, `commandOverran`, the span check and the `end-runtime` request in `packages/server/src/infra/plugin-host/broker-entry.ts`.
- `handleRuntimeEnded`, `owedRefusal`, `armBackstop`, `backstop`, `recordBrokerLoss`, `PluginHostUnavailableError` and `onDisconnect` in `packages/server/src/infra/plugin-host/process-runtime.ts`.
- The strike classifier `isHostAdmissionRefusal` in `packages/server/src/domain/plugin/activation/activate.ts`.
- Tests: `tests/server/infra/plugin-host/`.

## Consequences

One command holds its Worker for at most its kind's budget plus `PLUGIN_WORKER_OVERRUN_MAX_MS` of guest work, one check late, and every other Worker, any owner's, keeps serving meanwhile. A full queue waits at most `EVENT_QUEUE_DEPTH` commands' worst cases. Work after a command returns is held to one span's window plus the allowance. A plugin whose Worker or broker is ended is rebuilt on its next call, with no owner action, and loses its in-memory state; a call in flight when its broker is replaced fails as host-unavailable.

## Alternatives rejected

- **A per-command deadline in the broker.** A runtime's commands queue behind each other inside its Worker, so a command's age says nothing about whether its Worker is stuck. Its spans do.
- **One bound per span alone.** A chain of spans, each under it, holds the Worker until the parent's backstop.
- **Killing the broker at the parent's command timeout.** It ends every owner's runtimes for one guest's stall.
- **A longer parent timer from send.** Queue time grows with the queue, so it only delays the same kill.
- **Trusting the Worker's clock for an open span's age.** A stuck Worker cannot report one; the broker times the open span by when it first saw it.
