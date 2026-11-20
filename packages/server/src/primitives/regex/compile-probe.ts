// The write door's find-pattern cost check (D53). A V8 regex compile cannot be interrupted, so the turn's watchdog
// cannot bound it: a pattern of capture groups or deep nesting at the stored length cap compiles for seconds on the
// event loop. Every write that stores a find pattern therefore runs its first exec once, in a one-shot worker, and
// refuses a pattern whose compile and first run cost more than {@link FIND_COMPILE_LIMIT_MS} of thread CPU.
//
// CPU, not wall time, decides: a loaded host or a slow worker start never refuses an honest pattern. The worker's
// wall deadline only reclaims a worker that never answers; the pattern it was on is refused as not measured, and
// any after it as unchecked. A worker that cannot start leaves the whole batch unchecked. Each is named.
//
// At most {@link PROBE_WORKERS_AT_ONCE} probe workers run per server; a later save waits its turn in arrival order,
// so a burst of saves holds that many worker heaps at once, never one per save. A wait is not measured: the wall
// deadline starts when the worker does.

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

/** How many probe workers may run at once in the process. Each holds up to {@link PROBE_HEAP_MB} of heap, so this
 *  bounds the probes' memory on a small host; a probe takes milliseconds per pattern, so a queued save waits little. */
export const PROBE_WORKERS_AT_ONCE = 2;

/** The probe worker's thread name, as a diagnostic or `process.on("worker")` listener reads it. */
export const PROBE_WORKER_NAME = "orb-find-compile-probe";

/** Measure each pattern's compile off the event loop. Resolves one verdict per pattern, in order. Rejects only when the
 *  worker cannot be constructed or cannot be stopped at its deadline, which refuses the write. */
export type ProbeFindCompiles = (patterns: readonly FindCompileProbe[]) => Promise<FindCompileVerdict[]>;

/** The probe with its worker cap. The composition root builds one per server, so every write door of that server
 *  shares the {@link PROBE_WORKERS_AT_ONCE} slots. */
export function createFindCompileProbe(): ProbeFindCompiles {
  let running = 0;
  const waiting: (() => void)[] = [];
  // The next free worker slot, in arrival order.
  const take = (): Promise<void> => {
    if (running < PROBE_WORKERS_AT_ONCE) {
      running += 1;
      return Promise.resolve();
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    waiting.push(resolve);
    return promise;
  };
  // A waiting save inherits the slot directly, so the running count never dips and lets a newcomer in ahead of it.
  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) {
      running -= 1;
    } else {
      next();
    }
  };
  return async (patterns) => {
    if (patterns.length === 0) {
      return [];
    }
    await take();
    try {
      return await runProbeWorker(patterns);
    } finally {
      release();
    }
  };
}

// One worker over `patterns`; settles on the worker's `exit`, so the slot frees only once its heap is gone.
function runProbeWorker(patterns: readonly FindCompileProbe[]): Promise<FindCompileVerdict[]> {
  const { promise, resolve, reject } = Promise.withResolvers<FindCompileVerdict[]>();
  const verdicts: FindCompileVerdict[] = [];
  let stoppedAtDeadline = false;
  const worker = new Worker(new URL("./compile-worker.ts", import.meta.url), {
    workerData: {
      patterns: patterns.map(({ findRegex, substituteRegex }) => (substituteRegex === undefined ? { findRegex } : { findRegex, substituteRegex })),
    },
    env: {},
    name: PROBE_WORKER_NAME,
    resourceLimits: { maxOldGenerationSizeMb: PROBE_HEAP_MB },
  });
  const deadline = setTimeout(() => {
    stoppedAtDeadline = true;
    // The worker's `exit` settles the batch and names the pattern it stopped; a terminate that fails refuses the write.
    worker.terminate().catch(reject);
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
