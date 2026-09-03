import { setTimeout as sleep } from "node:timers/promises";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { budget, loadKillError } from "../../_shared/load-budget.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

const SESSION_CALL_BASE_MS = 5000;
const TERMINATION_ACK_WAIT_MS = 100;

async function terminatePageExecution(session: ProbeSession): Promise<void> {
  const cdp = await session.page.context().newCDPSession(session.page);
  try {
    // @orb-gate-ignore caught-failure-ownership(promise:send): the reload below is the second cancellation path and the watchdog reports the original timeout to the caller. Ends if reload stops following this bounded acknowledgement wait.
    await Promise.race([cdp.send("Runtime.terminateExecution").catch(() => undefined), sleep(TERMINATION_ACK_WAIT_MS)]);
    // @orb-gate-ignore caught-failure-ownership(promise:reload): reload is best-effort cancellation after the timeout already owns the caller-visible error; the next-call survival gate detects a context that failed to recover. Ends if the timeout stops being reported or the survival gate is removed.
    await session.page.reload({ waitUntil: "commit", timeout: SESSION_CALL_BASE_MS }).catch(() => undefined);
  } finally {
    await cdp.detach();
  }
}

/** Bound one daemon call without closing the browser or context that the next call owns. */
export async function runSessionCallWithinBudget(
  state: { readonly name: string; readonly session: ProbeSession },
  op: string,
  run: () => Promise<number>,
): Promise<number> {
  const budgetMs = budget(SESSION_CALL_BASE_MS);
  const deadline = Promise.withResolvers<Error>();
  const timer = setTimeout(
    () => deadline.resolve(loadKillError({ what: `session ${state.name} call \`${op}\``, budgetMs, baseMs: SESSION_CALL_BASE_MS })),
    budgetMs,
  );
  const work = run().then((code) => ({ code, timeout: null as Error | null }));
  const result = await Promise.race([work, deadline.promise.then((timeout) => ({ code: null, timeout }))]);
  clearTimeout(timer);
  if (result.timeout !== null) {
    await terminatePageExecution(state.session);
    // @orb-gate-ignore caught-failure-ownership(promise:work): the deadline error is the caller-visible report; draining prevents a late rejected call from becoming unhandled after that report. Ends if the deadline stops being thrown below.
    await work.catch(() => undefined);
    throw result.timeout;
  }
  return result.code as number;
}
