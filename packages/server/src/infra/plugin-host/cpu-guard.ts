// infra/plugin-host/cpu-guard — the guest-CPU interrupt, homed as ONE CONTEXT-LIFETIME handler reading a
// MUTABLE window instead of a per-invocation install/remove pair.
//
// WHY THE LIFETIME SHAPE (a whole-process DoS, not a tuning choice). QuickJS executes guest bytecode in
// TWO places, not one: the invocation itself, and the POST-invocation job pump that resumes a guest
// continuation when a fire-and-forget host call settles later (`membrane.attachAsync`'s detached pump). While
// the interrupt was installed by `Sandbox.runToSettlement` and REMOVED in its
// `finally`, those pumps ran guest bytecode with NO handler installed at all — so
// `orb.host(1).storage.get(k).then(function () { while (true) {} })` in a plugin's `main.js` ran UNBOUNDED on
// the Node MAIN THREAD: no interrupt, no rejection, no crash counter, no auto-disable, and no recovery short
// of a process restart. Reachable at activation, with only `storage.kv` and zero interaction after enable.
//
// So the handler lives for the context's lifetime and every call into the realm runs inside a span that OPENS A
// WINDOW:
//   - an invocation (`runToSettlement`) opens a CPU ACCOUNT holding the per-instance budget. Each span inside it —
//     the synchronous run, each settlement and pump while the invocation awaits, the read of its result — opens a
//     window at the account's remainder and charges the account the time it ran. The await between spans charges
//     nothing, so a guest that waits seconds on a host call and then runs briefly is inside its budget (D346);
//   - a settlement or pump outside any invocation spends the instance's OUTSIDE account the same way. Only an
//     invocation's opening refills it, so post-invocation work holds one budget per invocation, not one per span; when
//     it is spent the pump parks the job queue until the next invocation (`pumpGuestJobs`), and arriving settlements
//     wait host-side until that invocation has answered (`settleInCpuWindow`, `releaseParkedSettlements`).
// A span opened inside an open span adds nothing (the outer window already bounds it), and every pump inside an
// invocation spends that invocation's account — so a nested pump can neither buy the invocation extra CPU nor blank
// its bound on the way out.
//
// BETWEEN SPANS THE WINDOW IS CLOSED, not absent: it reads as already passed. Guest code reached outside a span is a
// missed site, and the interrupt ends it at its first poll instead of never. Only the realm's build, before any
// guest source runs, has no window.
//
// TWO BOUNDS, KEPT APART. The account bounds WORK. How long an invocation may HOLD its runtime, awaiting included, is
// the settlement wall (`Sandbox.raceSettlement`, `cpuDeadlineMs + settleGraceMs`), which every invocation —
// activation, snippet, tool, transform, macro, event, command, UI action — races and which reads no window. A guest
// that chains host calls each just under `HOST_FN_DEADLINE_MS` spends almost no account and is still ended there.
//
// TWO CLOCKS, unchanged (budgets.ts): the deadline reads MONOTONIC REAL time (`performance.now`), NEVER the
// guest's injected clock seam — a frozen test clock or a system-time jump must not be able to disable the DoS
// kill. And the interrupt still preempts guest BYTECODE ONLY: a guest that has STOPPED executing
// (`new Promise(() => {})`, an await that never resumes) is the SETTLEMENT deadline's business
// (`Sandbox.raceSettlement`), and no window here can see it.
//
// THE WINDOW IS NOT ABSOLUTE. QuickJS polls the interrupt only about every ten thousand calls and loop steps, and never
// while the host works. So every host call also asks `cpuWindowPassed` at its entry, and again before each read or
// write that can run a guest callback (`marshal.ts`), and ends a guest past its window there. What that cannot bound —
// one poll period of guest work, the native call already running at the deadline, host work already admitted,
// memory — is D346's.

import { performance } from "node:perf_hooks";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { PLUGIN_INVOCATION_CPU_MS } from "./budgets.ts";
import type { CpuSpanReport } from "./contract/port.ts";

/** The deadline before the first span opens: the realm is being built from host code only, so nothing to bound. */
const BUILDING = Number.POSITIVE_INFINITY;
/** The deadline between spans: already passed. Every host engine call that can reach guest code runs inside a span
 *  (D346), so guest code here is a missed site, and the interrupt ends it at its first poll instead of never. */
const CLOSED = Number.NEGATIVE_INFINITY;

/** One context's guest-CPU state: the per-instance budget, plus the currently OPEN window as an ABSOLUTE
 *  monotonic ms, or {@link BUILDING} or {@link CLOSED} when no window is open. */
interface CpuGuard {
  budgetMs: number;
  deadlineAtMs: number;
  /** The open invocation's unspent budget, or `null` outside an invocation. */
  account: CpuAccount | null;
  /** The instance's unspent budget for guest work outside any invocation. Only an invocation's opening refills it,
   *  and the host decides when an invocation opens, so a guest cannot buy itself more. */
  readonly outside: CpuAccount;
  /** Settlements held host-side while the outside account is spent, oldest first. */
  readonly parked: (() => void)[];
  /** Whether a span is open; a span opened inside one adds nothing. */
  spanOpen: boolean;
  /** Where each outermost span is reported to the broker, or `null` outside a broker's Worker. */
  readonly report: CpuSpanReport | null;
}

interface CpuAccount {
  remainingMs: number;
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

// The ONE reading of the window: the interpreter's interrupt and the host-call entry check both ask this, so they
// can never disagree about whether a guest is past its window.
function windowPassed(guard: CpuGuard): boolean {
  return performance.now() > guard.deadlineAtMs;
}

function createGuard(ctx: QuickJSContext, budgetMs: number, report: CpuSpanReport | null): CpuGuard {
  const guard: CpuGuard = { budgetMs, deadlineAtMs: BUILDING, account: null, outside: { remainingMs: budgetMs }, parked: [], spanOpen: false, report };
  GUARDS.set(ctx, guard);
  ctx.runtime.setInterruptHandler(() => windowPassed(guard));
  return guard;
}

/** Whether the guest-CPU window on `ctx` has passed — the same answer the interrupt handler gives. True between spans
 *  ({@link CLOSED}); false while the realm is being built, or when no guard was installed. */
export function cpuWindowPassed(ctx: QuickJSContext): boolean {
  const guard = GUARDS.get(ctx);
  return guard !== undefined && windowPassed(guard);
}

/** FAIL-CLOSED resolution: a span on an unregistered context gets the shared default budget rather than an
 *  unbounded run. This makes "a job pump with no CPU bound" unwritable by omission. */
function guardOf(ctx: QuickJSContext): CpuGuard {
  return GUARDS.get(ctx) ?? createGuard(ctx, PLUGIN_INVOCATION_CPU_MS, null);
}

/** Install the context-lifetime interrupt with this instance's budget and, in a broker's Worker, the report its broker
 *  watches for a stuck span (D347). Called ONCE per context at boot, before any guest source runs. Idempotent: a
 *  second call only re-budgets (it never stacks a second handler, which QuickJS could not hold anyway —
 *  `setInterruptHandler` REPLACES). */
export function installCpuGuard(ctx: QuickJSContext, budgetMs: number, report: CpuSpanReport | null): void {
  const existing = GUARDS.get(ctx);
  if (existing === undefined) {
    createGuard(ctx, budgetMs, report);
    return;
  }
  existing.budgetMs = budgetMs;
}

/** Open an invocation's CPU account and return its CLOSE, which restores the account it replaced. Opening also
 *  refills the account for guest work outside an invocation. Callers MUST close in a `finally`. */
export function openCpuInvocation(ctx: QuickJSContext): () => void {
  const guard = guardOf(ctx);
  const previous = guard.account;
  guard.outside.remainingMs = guard.budgetMs;
  guard.account = { remainingMs: guard.budgetMs };
  return (): void => {
    guard.account = previous;
  };
}

/** The account a span spends: the open invocation's, else the instance's account for work outside one. */
function spending(guard: CpuGuard): CpuAccount {
  return guard.account ?? guard.outside;
}

/** Open a guest-CPU window for one span of guest execution and return its CLOSE. The window is the remainder of the
 *  account the span spends, already passed when that account is spent, and the close charges the account. A span
 *  opened while one is open adds nothing — the nesting contract above. Callers MUST close in a `finally`: a window
 *  left open would preempt the next unrelated span the moment its deadline passed. */
export function openCpuWindow(ctx: QuickJSContext): () => void {
  const guard = guardOf(ctx);
  if (guard.spanOpen) {
    return (): void => undefined;
  }
  const account = spending(guard);
  const openedAtMs = performance.now();
  guard.spanOpen = true;
  guard.deadlineAtMs = account.remainingMs > 0 ? openedAtMs + account.remainingMs : CLOSED;
  guard.report?.opened(Math.ceil(account.remainingMs));
  return (): void => {
    const spentMs = performance.now() - openedAtMs;
    account.remainingMs = Math.max(0, account.remainingMs - spentMs);
    guard.deadlineAtMs = CLOSED;
    guard.spanOpen = false;
    guard.report?.closed(spentMs);
  };
}

/** Run `settle` — the settlement of a host call's guest promise, which can run a guest `then` getter — inside a span,
 *  or hold it host-side while the account it would spend is spent, an invocation's as well as the outside one. Held,
 *  an invocation that awaits it stops running guest work, so its settlement wall can fire. A held settlement runs after
 *  the next invocation answers, on the outside account that invocation refilled ({@link releaseParkedSettlements}), in
 *  the order it arrived; until then its guest promise stays pending, and teardown drains it as any other. */
export function settleInCpuWindow(ctx: QuickJSContext, settle: () => void): void {
  const guard = guardOf(ctx);
  if (spending(guard).remainingMs <= 0) {
    guard.parked.push(settle);
    return;
  }
  withinCpuWindow(ctx, settle);
}

/** Run held settlements, oldest first, in one span on the outside account, which an invocation has refilled since they
 *  were held; stop once that window passes, and hold the rest again. Call it after an invocation, never inside one:
 *  a held guest `then` getter must not spend the account of the invocation that released it. */
export function releaseParkedSettlements(ctx: QuickJSContext): void {
  if (!ctx.alive) {
    return;
  }
  const guard = guardOf(ctx);
  if (guard.account !== null || guard.outside.remainingMs <= 0 || guard.parked.length === 0) {
    return;
  }
  withinCpuWindow(ctx, () => {
    for (let settle = guard.parked.shift(); settle !== undefined; settle = guard.parked.shift()) {
      settle();
      if (windowPassed(guard)) {
        return;
      }
    }
  });
}

/** Run `work` — host code that calls into the realm — inside a span of guest execution: a guest callback the engine
 *  reaches from it (a `then` getter the promise resolve reads) is bounded by the window, and charged. */
export function withinCpuWindow<T>(ctx: QuickJSContext, work: () => T): T {
  const closeWindow = openCpuWindow(ctx);
  try {
    return work();
  } finally {
    closeWindow();
  }
}

/** Run the guest's pending jobs inside a span — the ONE spelling of the job pump. A runaway continuation is
 *  preempted with `InternalError: interrupted` (its own promise rejects guest-side, contained), and jobs the abort
 *  left QUEUED stay queued for the next pump; a context with aborted jobs still queued disposes cleanly (measured
 *  against this runtime). Inside an invocation a pump spends that invocation's account.
 *
 *  Outside an invocation a pump spends the instance's outside account, and a spent account PARKS the queue: no job
 *  runs until the next invocation refills it, and that invocation's own pumps run the parked jobs on its account.
 *  The engine keeps one queue per runtime and offers no way to drop a job short of disposing the context, so parked
 *  jobs resume rather than vanish. This is what stops a chain that never calls the host, which the entry check
 *  cannot see; the entry check remains the second guard for a chain that does. */
export function pumpGuestJobs(ctx: QuickJSContext): void {
  // A fire-and-forget host call can settle AFTER its instance was torn down (snippet end / deactivate);
  // touching a dead context is a use-after-free. The pump owns this guard so no call site can forget it.
  if (!ctx.alive) {
    return;
  }
  const guard = guardOf(ctx);
  if (guard.account === null && guard.outside.remainingMs <= 0) {
    return;
  }
  withinCpuWindow(ctx, () => {
    // DISPOSE THE RESULT, always: on the interrupt arm `executePendingJobs` hands back a HANDLE to the guest's
    // `InternalError`, and an undisposed handle at `ctx.dispose()` aborts the shared WASM module
    // (`list_empty(&rt->gc_obj_list)`) — a crash every CO-RESIDENT plugin would pay for. The success arm's
    // dispose is a no-op, so this is unconditional.
    const result = ctx.runtime.executePendingJobs();
    result.dispose();
  });
}
