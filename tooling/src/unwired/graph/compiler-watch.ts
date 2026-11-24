// A watch over the compiler processes a run starts (../native.ts COMPILER_CHANNEL): each with the step it started in, so
// a run that fails can name how a compiler ended on its own, never closed by its world, and the step the failure came
// on. A compiler's death is otherwise only a dead pipe.
import type { ChildProcess } from "node:child_process";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import type { CompilerStart } from "../native.ts";
import { COMPILER_CHANNEL, compilerStartOf } from "../native.ts";

// How long a failed run waits for a compiler it did not close to report its exit: a dead compiler's pipe fails at once,
// and Node delivers the exit on the next turns of its loop.
const EXIT_WAIT_MS = 2000;

// A compiler the watch saw start, and the step it started in.
interface StartedCompiler {
  readonly start: CompilerStart;
  readonly step: string;
}

// How a compiler process ended, or null while it runs.
const endOf = (child: ChildProcess): string | null => {
  if (child.signalCode !== null) {
    return `ended by signal ${child.signalCode}`;
  }
  return child.exitCode === null ? null : `exited with code ${String(child.exitCode)}`;
};

// A compiler its world closed: asked to stop, and gone with exit code 0.
const closedClean = (child: ChildProcess): boolean => child.killed && child.signalCode === null && child.exitCode === 0;

export class CompilerWatch implements Disposable {
  readonly #started: StartedCompiler[] = [];
  readonly #step: () => string;
  readonly #onCompiler = (message: unknown): void => {
    const start = compilerStartOf(message);
    if (start !== undefined) {
      this.#started.push({ start, step: this.#step() });
      this.#onStart(start);
    }
  };
  readonly #onStart: (start: CompilerStart) => void;

  /** Watch every compiler started from now on; `step` names the step running at each start, `onStart` hears each one. */
  constructor(step: () => string, onStart: (start: CompilerStart) => void = (): void => undefined) {
    this.#step = step;
    this.#onStart = onStart;
    subscribe(COMPILER_CHANNEL, this.#onCompiler);
  }

  /** Log each compiler that ended on its own before the run failed, with its exit code or signal, when the run failed
   *  and the step it was in. A compiler its world closed ends clean (`killed`, exit code 0) and is no news; one that died
   *  first and was closed after it still ended by its own signal or code. */
  async noteEnds(failedAt: Date, step: string, log: (line: string) => void): Promise<void> {
    const open = this.#started;
    const pending = open.filter(({ start }) => endOf(start.process) === null).map(({ start }) => once(start.process, "exit"));
    if (pending.length > 0) {
      const waited = new AbortController();
      await Promise.race([Promise.all(pending), delay(EXIT_WAIT_MS, undefined, { signal: waited.signal }).catch(() => undefined)]);
      waited.abort();
    }
    for (const { start, step: started } of open) {
      const end = endOf(start.process);
      if (end !== null && !closedClean(start.process)) {
        log(
          `the compiler for ${start.config} (pid ${String(start.process.pid)}, started in ${started}) ${end}; the run failed at ${failedAt.toISOString()} in ${step}`,
        );
      }
    }
  }

  [Symbol.dispose](): void {
    unsubscribe(COMPILER_CHANNEL, this.#onCompiler);
  }
}
