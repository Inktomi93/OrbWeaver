import { setTimeout as sleep } from "node:timers/promises";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { budget, loadKillError } from "../../_shared/load-budget.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

const SESSION_CALL_BASE_MS = 5000;
const SESSION_NAVIGATION_CALL_BASE_MS = 180_000;
/** The QUIET-BOX base for a REAL CDP round-trip (`Runtime.terminateExecution` ack, then a `page.reload`
 *  commit) — never an idle TTL, so unlike `SESSION_CALL_BASE_MS` this one IS load-scaled (#1759). The
 *  original 100ms flat missed its own cancellation ack under contention even ONCE scaled by `budget()`:
 *  at loadavg 28/24 cores the factor is only ~1.17 (`computeLoadFactor` is `loadavg1/cpuCount`, capped at
 *  8), so 100ms scaled to ~117ms — still too tight for a REAL CDP round-trip, and `recovered` read
 *  `false` for a cancellation that would have settled given real time. The daemon then tore the whole
 *  session down as TERMINAL, so the next call booted a fresh page with nothing navigated instead of
 *  reusing the one this test expects to survive (measured: reproduced at loadavg 28-61 on three trees).
 *  500ms is the new quiet-box base — small relative to the whole call's 5s+ budget, and it still scales
 *  further under heavier contention. `budget()` is read PER CALL, not at module load (a long-lived daemon
 *  serves calls across changing load). */
const TERMINATION_ACK_WAIT_BASE_MS = 500;

class TerminalSessionCallError extends Error {}

type SessionCallOwner = { readonly name: string; readonly session: ProbeSession } | { readonly name: string; readonly recover: () => Promise<void> };

export function isTerminalSessionCallError(error: unknown): boolean {
  return error instanceof TerminalSessionCallError;
}

/** Navigation and matrix/scenario orchestration already own stage-aware load budgets up to 90s + 60s.
 * The daemon watchdog is the outer leak boundary, so it must sit beyond those verdict-producing inner
 * clocks instead of racing them. */
export function sessionCallWatchdogBaseMs(navigates: boolean, armBaseMs: number | null = null): number {
  return Math.max(navigates ? SESSION_NAVIGATION_CALL_BASE_MS : SESSION_CALL_BASE_MS, armBaseMs ?? 0);
}

async function terminatePageExecution(session: ProbeSession): Promise<void> {
  const cdp = await session.page.context().newCDPSession(session.page);
  try {
    // @orb-waive caught-failure-ownership(cdp.send): the reload below is the second cancellation path and the watchdog reports the original timeout to the caller. Ends if reload stops following this bounded acknowledgement wait.
    await Promise.race([cdp.send("Runtime.terminateExecution").catch(() => undefined), sleep(budget(TERMINATION_ACK_WAIT_BASE_MS))]);
    // @orb-waive caught-failure-ownership(session.page.reload): reload is best-effort cancellation after the timeout already owns the caller-visible error; the next-call survival gate detects a context that failed to recover. Ends if the timeout stops being reported or the survival gate is removed.
    await session.page.reload({ waitUntil: "commit", timeout: SESSION_CALL_BASE_MS }).catch(() => undefined);
  } finally {
    await cdp.detach();
  }
}

/** Bound one daemon call without closing the browser or context that the next call owns. */
export async function runSessionCallWithinBudget(
  state: SessionCallOwner,
  op: string,
  run: () => Promise<number>,
  baseMs: number = SESSION_CALL_BASE_MS,
): Promise<number> {
  const budgetMs = budget(baseMs);
  const deadline = Promise.withResolvers<Error>();
  const timer = setTimeout(() => deadline.resolve(loadKillError({ what: `session ${state.name} call \`${op}\``, budgetMs, baseMs })), budgetMs);
  // @orb-waive caught-failure-ownership(Promise.resolve): the rejection is retained in the discriminated work outcome and the rejected arm below rethrows the original binding; timeout recovery also awaits this owned outcome. Ends if the rejected arm stops propagating the original failure.
  const work = Promise.resolve()
    .then(run)
    .then(
      (code) => ({ status: "done" as const, code }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
  const result = await Promise.race([work, deadline.promise.then((error) => ({ status: "timeout" as const, error }))]);
  clearTimeout(timer);
  if (result.status === "done") {
    return result.code;
  }
  if (result.status === "rejected") {
    throw result.error;
  }

  // Recovery owns BOTH the cancellation protocol and the original work. Reusing the session while either
  // is still live would allow the timed-out call to mutate the same page concurrently with its successor.
  // Both promises are rejection-owned here; the deadline remains the caller-visible error.
  const recovery = Promise.all([
    // @orb-waive caught-failure-ownership(then): failed injected or browser cancellation becomes `false`, which makes `recovered` false and throws TerminalSessionCallError; the daemon then emits DEAD/toolError, records terminalReason, tears down, and kills its owned process group. Ends if false stops forcing terminal teardown.
    ("recover" in state ? state.recover() : terminatePageExecution(state.session)).then(
      () => true,
      () => false,
    ),
    work,
  ]).then(([cancelled]) => cancelled);
  const ackWaitMs = budget(TERMINATION_ACK_WAIT_BASE_MS);
  const recovered = await Promise.race([recovery, sleep(ackWaitMs).then(() => false)]);
  if (!recovered) {
    throw new TerminalSessionCallError(
      `${result.error.message}; cancellation did not settle the call within ${ackWaitMs}ms, so session ${state.name} is terminal and will close`,
      { cause: result.error },
    );
  }
  throw result.error;
}
