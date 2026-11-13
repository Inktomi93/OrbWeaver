// Private intake alone borrows one parent-owned execution expiry; it is neither identity nor kill authority.
// A budgeted consumer says so when its budget ends it: the group kill leaves no runner summary and no failed case, so
// without the launcher's own line the stop reads as a crash.
import process from "node:process";
import { createTimeLib } from "@orb/kit/time";
import type { BoxLoadReader } from "@orb/tooling/floor/host/load-budget";
import { budget, readBoxLoad } from "@orb/tooling/floor/host/load-budget";
import type { TranscriptOptions, TranscriptResult } from "@orb/tooling/floor/process/proc";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { describeRunMarkerSweep, joinRunMarkerSweep, runMarkerTranscriptTeardown } from "@orb/tooling/floor/process/run-marker";
import { TERM_GRACE_BASE_MS } from "@orb/tooling/floor/process/stop-escalation";

const CLOCK = createTimeLib();
export const PRIVATE_EXECUTION_EXPIRY_ENV = "CORPUS_PRIVATE_EXECUTION_EXPIRES_AT_MS";

/** Overwrite inherited metadata once, before the private child starts, reserving native retirement inside its hard budget. */
export function privateCorpusExecutionEnv(
  hardBudgetMs: number,
  now: () => number = CLOCK.now,
  read: BoxLoadReader = readBoxLoad,
  inherit: typeof inheritedProcessEnv = inheritedProcessEnv,
): NodeJS.ProcessEnv {
  return inherit({ [PRIVATE_EXECUTION_EXPIRY_ENV]: String(now() + Math.max(0, hardBudgetMs - budget(TERM_GRACE_BASE_MS, read))) });
}

/** Admit only a finite nonnegative parent expiry; startup time is already spent, never granted again. */
export function privateCorpusExecutionSignal(expiry: string | undefined, now: () => number = CLOCK.now): AbortSignal {
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

/** A consumer run under a time budget. `unfinished` names the projects the run had been asked for; it is read only when
 *  the budget ends the run, since the launcher cannot see which of them the killed runner had finished. */
interface BudgetedConsumer {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly options: TranscriptOptions & { readonly teardown: NonNullable<TranscriptOptions["teardown"]> };
  readonly unfinished: () => readonly string[] | Promise<readonly string[]>;
}

/**
 * Run one consumer and, when its budget ends it, write one line naming the budget, the elapsed time and the unfinished
 * projects before the result returns. The result is unchanged, so a budget stop keeps its null code.
 *
 * @remarks The teardown's timeout hook is the signal: the transcript door calls it only when its timer fires, so a
 * child that dies on a signal inside its budget writes no line.
 */
export async function spawnBudgetedConsumer(
  consumer: BudgetedConsumer,
  write: (line: string) => void = (line) => void process.stderr.write(line),
  now: () => number = CLOCK.now,
): Promise<TranscriptResult> {
  const { teardown, timeoutMs } = consumer.options;
  const startedAt = now();
  const state = { expired: false };
  const result = await spawnNicedTranscript(consumer.cmd, consumer.args, {
    ...consumer.options,
    teardown: {
      ...teardown,
      afterTimeoutKill: (): Promise<string | null> => {
        state.expired = true;
        return teardown.afterTimeoutKill();
      },
    },
  });
  if (state.expired) {
    const elapsedMs = now() - startedAt;
    write(
      `Corpus consumer budget expired: budget=${String(timeoutMs)}ms elapsed=${String(elapsedMs)}ms unfinished=${JSON.stringify(await consumer.unfinished())}\n`,
    );
  }
  return result;
}
