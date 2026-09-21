// infra/plugin-host/cpu-guard — the guest-CPU interrupt, homed as ONE CONTEXT-LIFETIME handler reading a
// MUTABLE window instead of a per-invocation install/remove pair.
//
// WHY THE LIFETIME SHAPE (#781 — a whole-process DoS, not a tuning choice). QuickJS executes guest bytecode in
// TWO places, not one: the invocation itself, and the POST-invocation job pump that resumes a guest
// continuation when a fire-and-forget host call settles later (`membrane.attachAsync`'s detached pump). While
// the interrupt was installed by `Sandbox.runToSettlement` and REMOVED in its
// `finally`, those pumps ran guest bytecode with NO handler installed at all — so
// `orb.host(1).storage.get(k).then(function () { while (true) {} })` in a plugin's `main.js` ran UNBOUNDED on
// the Node MAIN THREAD: no interrupt, no rejection, no crash counter, no auto-disable, and no recovery short
// of a process restart. Reachable at activation, with only `storage.kv` and zero interaction after enable.
//
// So the handler lives for the context's lifetime and every guest-bytecode span OPENS A WINDOW:
//   - `runToSettlement` opens the invocation's window and closes it when the invocation settles;
//   - each pump opens a fresh one for the duration of the pump.
// A window NARROWS, never widens (`min(previous, now + budget)`), and closing RESTORES the previous deadline
// rather than clearing it — so a pump nested inside a live invocation (the ordinary case: a guest awaits a
// host call and resumes mid-invocation) can neither buy that invocation extra CPU nor blank its bound on the
// way out.
//
// TWO CLOCKS, unchanged (budgets.ts): the deadline reads MONOTONIC REAL time (`performance.now`), NEVER the
// guest's injected clock seam — a frozen test clock or a system-time jump must not be able to disable the DoS
// kill. And the interrupt still preempts guest BYTECODE ONLY: a guest that has STOPPED executing
// (`new Promise(() => {})`, an await that never resumes) is the SETTLEMENT deadline's business
// (`Sandbox.raceSettlement`), and no window here can see it.

import { performance } from "node:perf_hooks";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { PLUGIN_INVOCATION_CPU_MS } from "./budgets.ts";

/** One context's guest-CPU state: the per-instance budget, plus the currently OPEN window as an ABSOLUTE
 *  monotonic ms. `Infinity` = no window open, which makes the installed handler inert (host-driven bytecode
 *  outside any span — e.g. the pristine `JSON.parse` of an inbound args payload — is bounded by the byte caps
 *  at its own seam, not by this). */
interface CpuGuard {
  budgetMs: number;
  deadlineAtMs: number;
}

/** Per-context guard state. WEAK by construction: this map must never keep a disposed context alive, and the
 *  handler closure dies with the context's own runtime (`newContext()` mints one runtime per context, so a
 *  guard can never reach another plugin instance).
 *
 *  ASSUMES(single-replica): NO DB-backed replacement seam exists or is sensible — the state keys off a LIVE
 *  in-memory `QuickJSContext`, an object that exists only inside THIS process's shared WASM runtime
 *  (`module.ts`); a guest-CPU deadline is a property of a running interpreter, not durable data. The whole
 *  plugin-host runtime is per-process by construction (see `port.ts`'s own `runtimes`/`processResidentRuntimes`
 *  `ASSUMES(single-replica)` posture). A replica running its own guest instances holds its own contexts and its
 *  own guards; there is nothing to share. */
const GUARDS = new WeakMap<QuickJSContext, CpuGuard>();

function createGuard(ctx: QuickJSContext, budgetMs: number): CpuGuard {
  const guard: CpuGuard = { budgetMs, deadlineAtMs: Number.POSITIVE_INFINITY };
  GUARDS.set(ctx, guard);
  ctx.runtime.setInterruptHandler(() => performance.now() > guard.deadlineAtMs);
  return guard;
}

/** FAIL-CLOSED resolution: a span on an unregistered context gets the shared default budget rather than an
 *  unbounded run. This makes "a job pump with no CPU bound" unwritable by omission. */
function guardOf(ctx: QuickJSContext): CpuGuard {
  return GUARDS.get(ctx) ?? createGuard(ctx, PLUGIN_INVOCATION_CPU_MS);
}

/** Install the context-lifetime interrupt with this instance's budget. Called ONCE per context at boot, before
 *  any guest source runs. Idempotent: a second call only re-budgets (it never stacks a second handler, which
 *  QuickJS could not hold anyway — `setInterruptHandler` REPLACES). */
export function installCpuGuard(ctx: QuickJSContext, budgetMs: number): void {
  const existing = GUARDS.get(ctx);
  if (existing === undefined) {
    createGuard(ctx, budgetMs);
    return;
  }
  existing.budgetMs = budgetMs;
}

/** Open a guest-CPU window and return its CLOSE. The window NARROWS an already-open one and the close RESTORES
 *  it (never clears it) — the nesting contract above. Callers MUST close in a `finally`: a window left open
 *  would preempt the next unrelated span the moment its deadline passed. */
export function openCpuWindow(ctx: QuickJSContext): () => void {
  const guard = guardOf(ctx);
  const previous = guard.deadlineAtMs;
  guard.deadlineAtMs = Math.min(previous, performance.now() + guard.budgetMs);
  return (): void => {
    guard.deadlineAtMs = previous;
  };
}

/** Run the guest's pending jobs UNDER a window — the ONE spelling of the job pump (#781). A runaway
 *  continuation is preempted with `InternalError: interrupted` (its own promise rejects guest-side, contained),
 *  and jobs the abort left QUEUED stay queued for the next pump, which opens its own window; a context with
 *  aborted jobs still queued disposes cleanly (measured against this runtime, 2026-08-28).
 *
 *  Not a bound on TOTAL guest CPU, and it does not claim to be: every host-call settlement buys one window, so
 *  the aggregate stays bounded by the ≤32 in-flight cap × the per-instance budget rather than by one number.
 *  What it removes is the UNBOUNDED span — a single continuation that never yields the Node main thread. */
export function pumpGuestJobs(ctx: QuickJSContext): void {
  // A fire-and-forget host call can settle AFTER its instance was torn down (snippet end / deactivate);
  // touching a dead context is a use-after-free. The pump owns this guard so no call site can forget it.
  if (!ctx.alive) {
    return;
  }
  const closeWindow = openCpuWindow(ctx);
  try {
    // DISPOSE THE RESULT, always: on the interrupt arm `executePendingJobs` hands back a HANDLE to the guest's
    // `InternalError`, and an undisposed handle at `ctx.dispose()` aborts the shared WASM module
    // (`list_empty(&rt->gc_obj_list)`) — a crash every CO-RESIDENT plugin would pay for. The success arm's
    // dispose is a no-op, so this is unconditional.
    const result = ctx.runtime.executePendingJobs();
    result.dispose();
  } finally {
    closeWindow();
  }
}
