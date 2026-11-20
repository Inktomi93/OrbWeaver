// The process side of snap: the one door every snap invocation runs through (`openSnapHost`). cli.ts opens a host
// whose runs each launch their own Chromium; a caller that runs many invocations in one process opens a host whose
// runs are contexts of one Chromium the host launches on first use and closes at its disposal.
//
// What a fresh process gave each invocation, the host gives each run: its own run slot, its own request ring and
// profile window numbers (per context), its own module ceilings (`beginLoadEpoch`) and an empty set of revealed
// private values (`forgetPrivateValues`). Runs are serial. A bounded run that throws ends as `runTool` ends a CLI
// process on the throw (`thrownOutcome`): its line on stderr and its exit code. One that passes its deadline has its
// browser closed under it so its pending work rejects and it ends; one that still has not ended after its settle
// ceiling, or whose browser will not close, marks the host dead, and every later run is refused rather than run
// beside it.
import { setTimeout as delay } from "node:timers/promises";
import { errorMessage } from "@orb/kit/error-message";
import { closeProbeSession } from "../../floor/browser/browser.ts";
import type { ProbeSession } from "../../floor/browser/browser-contract.ts";
import { instrumentRefusal } from "../../floor/browser/page-validate.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { OutputSink } from "../../floor/cli/log.ts";
import { installOutputSink, warn } from "../../floor/cli/log.ts";
import { thrownOutcome } from "../../floor/cli/run-tool.ts";
import { beginLoadEpoch } from "../../floor/host/load-budget.ts";
import { SNAP_CEILINGS_MS } from "../lib/budgets.ts";
import { forgetPrivateValues, scrubPrivateError } from "../lib/private-values.ts";
import type { BrowserSourceKind, RunBrowser, SnapBrowserSource } from "./browser-source.ts";
import { contextsIn, LAUNCH_PER_RUN } from "./browser-source.ts";
import { runSnapCommand } from "./command.ts";
import { parseSnapArgs } from "./parse.ts";
import { launchSnapSession } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// The shared Chromium is a host, not a run: no run's failure evidence is taken from its own context.
const SHARED_OWNER_ARGV = ["--no-failure-evidence"] as const;
const DEADLINE = Symbol("deadline");

/** A bounded run: where its `print`/`warn` lines go, and by when the host returns. The run itself gets the deadline
 *  less the host's settle after an abort, so a caller with its own limit passes what remains of it. */
export interface SnapRunBounds {
  readonly deadlineMs: number;
  readonly sink: OutputSink;
}

/** How a bounded run ended: with its exit code, or ended by the host at its deadline. */
export type SnapRunOutcome = { readonly kind: "exited"; readonly code: number } | { readonly kind: "deadline"; readonly deadlineMs: number };

export interface SnapHost extends AsyncDisposable {
  readonly run: {
    /** One snap invocation, its output on this process's stdout and stderr; resolves to its exit code. */
    (argv: readonly string[]): Promise<number>;
    /** One snap invocation, its output into `bounds.sink`; the host returns within `bounds.deadlineMs`. */
    (argv: readonly string[], bounds: SnapRunBounds): Promise<SnapRunOutcome>;
  };
}

async function raceDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof DEADLINE> {
  const timer = new AbortController();
  try {
    return await Promise.race([work, delay(ms, DEADLINE, { signal: timer.signal })]);
  } finally {
    timer.abort();
  }
}

class Host implements SnapHost {
  readonly #kind: BrowserSourceKind;
  #owner: Promise<ProbeSession> | null = null;
  #tail: Promise<unknown> = Promise.resolve();
  #dead: string | null = null;

  constructor(kind: BrowserSourceKind) {
    this.#kind = kind;
  }

  run(argv: readonly string[]): Promise<number>;
  run(argv: readonly string[], bounds: SnapRunBounds): Promise<SnapRunOutcome>;
  async run(argv: readonly string[], bounds?: SnapRunBounds): Promise<number | SnapRunOutcome> {
    const previous = this.#tail;
    const next = (async (): Promise<number | SnapRunOutcome> => {
      await previous.catch(() => undefined);
      return bounds === undefined ? await this.#runOnce(argv) : await this.#runBounded(argv, bounds);
    })();
    this.#tail = next;
    return await next;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#tail.catch(() => undefined);
    const owner = this.#owner;
    this.#owner = null;
    if (owner !== null) {
      await closeProbeSession(await owner);
    }
  }

  async #source(watch: (browser: RunBrowser) => void): Promise<SnapBrowserSource> {
    if (this.#kind === "launch-per-run") {
      return { kind: LAUNCH_PER_RUN.kind, open: async (opts, needs): Promise<RunBrowser> => watched(await LAUNCH_PER_RUN.open(opts, needs), watch) };
    }
    this.#owner ??= launchSnapSession(parseSnapArgs([...SHARED_OWNER_ARGV]));
    const contexts = contextsIn(await this.#owner, "run");
    return { kind: contexts.kind, open: async (opts, needs): Promise<RunBrowser> => watched(await contexts.open(opts, needs), watch) };
  }

  async #invoke(argv: readonly string[], watch: (browser: RunBrowser) => void): Promise<number> {
    if (this.#dead !== null) {
      return instrumentRefusal(`this snap host is dead: ${this.#dead}`);
    }
    try {
      return await runSnapCommand(argv, await this.#source(watch));
    } catch (error) {
      throw scrubPrivateError(error);
    }
  }

  async #runOnce(argv: readonly string[]): Promise<number> {
    beginLoadEpoch();
    try {
      return await this.#invoke(argv, () => undefined);
    } finally {
      forgetPrivateValues();
    }
  }

  async #runBounded(argv: readonly string[], bounds: SnapRunBounds): Promise<SnapRunOutcome> {
    beginLoadEpoch();
    // The host returns by the deadline: the run gets what the settle after an abort does not need.
    const settleMs = SNAP_CEILINGS_MS.hostRunSettle;
    const runMs = bounds.deadlineMs - settleMs;
    if (runMs <= 0) {
      return instrumentRefusal(`a bounded run needs a deadline above the host's ${String(settleMs)} ms settle; it was given ${String(bounds.deadlineMs)} ms`);
    }
    let browser: RunBrowser | null = null;
    const release = installOutputSink(bounds.sink);
    try {
      // A throw ends a bounded run as `runTool` ends a CLI process on it: its line on stderr and its exit code.
      const running = this.#invoke(argv, (opened) => {
        browser = opened;
      }).catch((error: unknown) => {
        const thrown = thrownOutcome(error);
        warn(thrown.line);
        return thrown.code;
      });
      const ended = await raceDeadline(running, runMs);
      if (ended !== DEADLINE) {
        return { kind: "exited", code: ended };
      }
      // `browser` is assigned by the run's own open, which TypeScript cannot see across the await above.
      const held = browser as RunBrowser | null;
      try {
        await held?.abort();
      } catch (error) {
        // The run may still hold its browser, so no later run may start beside it.
        this.#dead = `a run passed its ${String(runMs)} ms run window and its browser would not close: ${errorMessage(error)}`;
        return { kind: "deadline", deadlineMs: bounds.deadlineMs };
      }
      if ((await raceDeadline(running, settleMs)) === DEADLINE) {
        this.#dead = `a run passed its ${String(runMs)} ms run window and had not ended ${String(settleMs)} ms after its browser was closed`;
      }
      return { kind: "deadline", deadlineMs: bounds.deadlineMs };
    } finally {
      release();
      forgetPrivateValues();
    }
  }
}

function watched(browser: RunBrowser, watch: (browser: RunBrowser) => void): RunBrowser {
  watch(browser);
  return browser;
}

/** Open the door snap invocations run through: each run launches its own Chromium, or each is a context of one. */
export function openSnapHost(kind: BrowserSourceKind): SnapHost {
  return new Host(kind);
}
