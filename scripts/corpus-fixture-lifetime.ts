// Private intake alone borrows one parent-owned execution expiry; it is neither identity nor kill authority.
import { createTimeLib } from "@orb/kit/time";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { inheritedProcessEnv, processEnvValue } from "@orb/tooling/floor/process/process-env";
import { describeRunMarkerSweep, joinRunMarkerSweep, runMarkerTranscriptTeardown } from "@orb/tooling/floor/process/run-marker";
import { TERM_GRACE_BASE_MS } from "@orb/tooling/floor/process/stop-escalation";

const CLOCK = createTimeLib();
export const PRIVATE_EXECUTION_EXPIRY_ENV = "CORPUS_PRIVATE_EXECUTION_EXPIRES_AT_MS";

/** Overwrite inherited metadata once, before the private child starts, reserving native retirement inside its hard budget. */
export function privateCorpusExecutionEnv(hardBudgetMs: number, now: () => number = CLOCK.now): NodeJS.ProcessEnv {
  return inheritedProcessEnv({ [PRIVATE_EXECUTION_EXPIRY_ENV]: String(now() + Math.max(0, hardBudgetMs - budget(TERM_GRACE_BASE_MS))) });
}

/** Admit only a finite nonnegative parent expiry; startup time is already spent, never granted again. */
export function privateCorpusExecutionSignal(expiry = processEnvValue(PRIVATE_EXECUTION_EXPIRY_ENV), now: () => number = CLOCK.now): AbortSignal {
  const expiresAtMs = expiry === undefined || expiry.trim() === "" ? Number.NaN : Number(expiry);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < 0) {
    throw new Error("Private corpus execution expiry is missing or invalid");
  }
  const remainingMs = Math.ceil(expiresAtMs - now());
  return remainingMs <= 0 ? AbortSignal.abort(new DOMException("Private corpus execution deadline expired", "TimeoutError")) : AbortSignal.timeout(remainingMs);
}

/** Keep the existing Ctrl-C guard; timeout completion additionally joins this launcher's fresh marker. */
export function privateCorpusTranscriptTeardown(
  marker: string,
  deps?: Parameters<typeof joinRunMarkerSweep>[1],
): ReturnType<typeof runMarkerTranscriptTeardown> {
  return {
    ...runMarkerTranscriptTeardown(marker, deps),
    afterTimeoutKill: async () => describeRunMarkerSweep(await joinRunMarkerSweep(marker, deps)),
  };
}
