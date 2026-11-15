// The write door's find-pattern cost check (D53). A V8 regex compile cannot be interrupted, so the turn's watchdog
// cannot bound it: a pattern of capture groups or deep nesting at the stored length cap compiles for seconds on the
// event loop. Every write that stores a find pattern therefore runs its first exec once, in a one-shot worker, and
// refuses a pattern whose compile and first run cost more than {@link FIND_COMPILE_LIMIT_MS} of thread CPU.
//
// CPU, not wall time, decides: a loaded host or a slow worker start never refuses an honest pattern. The worker's
// wall deadline only reclaims a worker that never answers; the pattern it was on is refused as not measured, and
// any after it as unchecked. A worker that cannot start leaves the whole batch unchecked. Each is named.

import { Worker } from "node:worker_threads";
import type { SubstituteFindRegex } from "@orb/kit/regex";
import { compileProbeResultSchema } from "./compile-probe-contract.ts";

/** The thread CPU a find pattern's compile and first run may cost. Ten times the worst real one: the 242 scripts of a
 *  public HUD preset, measured in this probe on a host loaded past its core count, peak at 37 ms (its 10,189-character
 *  pattern). A compile-heavy pattern at the stored length cap costs 0.7-0.9 s here, and as much on the event loop. */
export const FIND_COMPILE_LIMIT_MS = 370;

// Reclaims a worker that never answers. Far past any honest probe, which finishes in milliseconds per pattern.
const PROBE_WALL_DEADLINE_MS = 30_000;
// A hostile compile is CPU, not memory, but its heap is still bounded so one probe cannot grow the process.
const PROBE_HEAP_MB = 256;

/** One stored find pattern, as the executor will compile it. */
export interface FindCompileProbe {
  readonly findRegex: string;
  readonly substituteRegex?: SubstituteFindRegex | undefined;
}

/** A refused pattern's reason, in words a summary can print after the script's name. */
export type FindCompileVerdict = { readonly ok: true; readonly cpuMs: number } | { readonly ok: false; readonly reason: string };

function verdictOf(cpuMs: number): FindCompileVerdict {
  return cpuMs <= FIND_COMPILE_LIMIT_MS
    ? { ok: true, cpuMs }
    : { ok: false, reason: `its find pattern costs ${Math.round(cpuMs)} ms to compile and first run, over the ${FIND_COMPILE_LIMIT_MS} ms limit` };
}

/** Measure each pattern's compile off the event loop. Resolves one verdict per pattern, in order. Throws only when the
 *  worker cannot be constructed, which refuses the write. */
export function probeFindCompiles(patterns: readonly FindCompileProbe[]): Promise<FindCompileVerdict[]> {
  if (patterns.length === 0) {
    return Promise.resolve([]);
  }
  const { promise, resolve } = Promise.withResolvers<FindCompileVerdict[]>();
  const verdicts: FindCompileVerdict[] = [];
  let stoppedAtDeadline = false;
  const worker = new Worker(new URL("./compile-worker.ts", import.meta.url), {
    workerData: {
      patterns: patterns.map(({ findRegex, substituteRegex }) => (substituteRegex === undefined ? { findRegex } : { findRegex, substituteRegex })),
    },
    env: {},
    resourceLimits: { maxOldGenerationSizeMb: PROBE_HEAP_MB },
  });
  const deadline = setTimeout(() => {
    stoppedAtDeadline = true;
    // eslint-disable-next-line orb/detached-work-traced -- the worker's `exit` settles the batch and names the pattern it stopped; a terminate that fails leaves a worker that already exited. Ends if the probe gains a caller that awaits the kill.
    worker.terminate().catch(() => undefined);
  }, PROBE_WALL_DEADLINE_MS);
  worker.on("message", (value: unknown) => {
    const parsed = compileProbeResultSchema.safeParse(value);
    verdicts.push(parsed.success ? verdictOf(parsed.data.cpuMs) : { ok: false, reason: "its find pattern could not be measured" });
  });
  // An `error` is always followed by `exit`, which settles the batch.
  worker.on("error", () => undefined);
  worker.once("exit", () => {
    clearTimeout(deadline);
    const inFlight = verdicts.length;
    for (let index = inFlight; index < patterns.length; index += 1) {
      verdicts.push({
        ok: false,
        reason:
          stoppedAtDeadline && index === inFlight
            ? `its find pattern did not finish compiling within ${PROBE_WALL_DEADLINE_MS} ms`
            : "its find pattern could not be checked; save it again",
      });
    }
    resolve(verdicts);
  });
  return promise;
}
