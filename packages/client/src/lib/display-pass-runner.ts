// The main-thread side of the display-pass Worker: one long-lived Worker, one row at a time, and the three
// bounds that keep a hostile display script from freezing the viewer's tab.
//
// THE THREAT. A display script reaches a viewer's browser from their own library, from an imported preset or
// card, and from a room host's broadcast; it runs on text other people wrote. Its pattern can backtrack for
// minutes and its replacement can multiply the text. The browser has no regex timeout, so the scripts run in a
// Worker this module can terminate.
//
// THE BOUNDS, each a constant in `display-pass-protocol.ts`:
//   · per script — a script still running `DISPLAY_SCRIPT_DEADLINE_MS` after its start notice arrived is
//     killed with the Worker. The row runs again without it, in a fresh Worker, on what is left of its budget.
//   · per row — the Worker stops a row once it has spent `DISPLAY_ROW_BUDGET_MS`; the row keeps what ran, and
//     the scripts that took longest on it are stopped until the rest fit in half the budget.
//   · per output — a script whose output passes `DISPLAY_OUTPUT_MAX_CHARS` is dropped from the row and stopped.
// A stopped script stays stopped for the page session (keyed by its id and its pattern, so an edit runs
// again), so a hostile script costs its bound once, not once per row. The main thread never runs a script:
// the only per-row main-thread work is a result arriving, so no per-frame budget is needed.
//
// THE VIEWER LEARNS through ONE notice, updated in place as stops accumulate (a preset of two hundred slow
// scripts must not stack two hundred toasts), and through `stoppedDisplayScripts`, the store the room's
// regex roster reads. There is never a main-thread fallback: when the Worker cannot start, every row renders
// without its scripts and one notice says so.
//
// QUEUE ORDER: a row on screen first, then the newest; the caller supplies both through its priority read,
// which is read at each dispatch because a row scrolls in and out while it waits.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { DisplayStopReason } from "./display-pass-copy.ts";
import {
  DISPLAY_SCRIPTS_UNAVAILABLE_DESCRIPTION,
  DISPLAY_SCRIPTS_UNAVAILABLE_TITLE,
  displayScriptsStoppedDescription,
  displayScriptsStoppedTitle,
} from "./display-pass-copy.ts";
import type { DisplayPassReply, DisplayPassRun } from "./display-pass-protocol.ts";
import { DISPLAY_ROW_BUDGET_MS, DISPLAY_SCRIPT_DEADLINE_MS } from "./display-pass-protocol.ts";
import type { DisplayPass } from "./message-render.ts";
import { notify } from "./notify.ts";

/** Where a waiting row stands in the queue: on screen first, then the highest `order` (the newest row). */
interface DisplayPassPriority {
  readonly visible: boolean;
  readonly order: number;
}

export interface DisplayPassRequest {
  readonly signal?: AbortSignal | undefined;
  readonly priority: () => DisplayPassPriority;
}

/** A script the display pass stopped this session. */
export interface StoppedDisplayScript {
  readonly id: RegexScriptRow["id"];
  readonly name: string;
  readonly reason: DisplayStopReason;
}

/** How long a fresh Worker may take to report its first script before the browser is judged unable to run it. */
const WORKER_START_LIMIT_MS = 10_000;
const STOPPED_NOTICE_ID = "display-scripts-stopped";
const UNAVAILABLE_NOTICE_ID = "display-scripts-unavailable";

interface Job {
  readonly id: number;
  readonly pass: DisplayPass;
  readonly priority: DisplayPassRequest["priority"];
  readonly resolve: (text: string) => void;
  /** Main-thread time of the first dispatch; a rerun after a kill spends what is left of the same budget. */
  firstRunAt: number | null;
}

interface Active {
  readonly job: Job;
  /** The scripts this run carries: the pass's scripts minus the ones already stopped. */
  readonly scripts: readonly RegexScriptRow[];
  /** The index of the script whose start notice arrived last; -1 before the first. */
  index: number;
}

let worker: Worker | null = null;
let unavailable = false;
let nextJobId = 0;
let active: Active | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const queue: Job[] = [];

const stoppedKeys = new Set<string>();
let stopped: readonly StoppedDisplayScript[] = [];
const stoppedListeners = new Set<() => void>();

/** The scripts stopped this session, as a store for `useSyncExternalStore`. */
export const stoppedDisplayScripts = {
  subscribe(listener: () => void): () => void {
    stoppedListeners.add(listener);
    return (): void => {
      stoppedListeners.delete(listener);
    };
  },
  getSnapshot(): readonly StoppedDisplayScript[] {
    return stopped;
  },
};

function stopKey(script: RegexScriptRow): string {
  return `${script.id}\u0000${script.findRegex}`;
}

function stopScripts(scripts: readonly RegexScriptRow[], reason: DisplayStopReason): void {
  const fresh = scripts.filter((script) => !stoppedKeys.has(stopKey(script)));
  const latest = fresh.at(-1);
  if (latest === undefined) {
    return;
  }
  for (const script of fresh) {
    stoppedKeys.add(stopKey(script));
  }
  stopped = [...stopped, ...fresh.map((script) => ({ id: script.id, name: script.name, reason }))];
  for (const listener of stoppedListeners) {
    listener();
  }
  notify.warn({
    id: STOPPED_NOTICE_ID,
    title: displayScriptsStoppedTitle(stopped.length),
    description: displayScriptsStoppedDescription(latest.name, reason, stopped.length),
  });
}

/** The row spent its budget: stop the scripts that took longest on it until the rest fit in half the budget,
 *  so the next row with similar text runs whole. */
function stopSlowest(scripts: readonly RegexScriptRow[], timings: readonly number[]): void {
  const byCost = timings.map((ms, index) => ({ ms, index })).toSorted((a, b) => b.ms - a.ms);
  let remaining = timings.reduce((sum, ms) => sum + ms, 0);
  const slowest: RegexScriptRow[] = [];
  for (const { ms, index } of byCost) {
    const script = scripts[index];
    if (remaining <= DISPLAY_ROW_BUDGET_MS / 2 || script === undefined) {
      break;
    }
    slowest.push(script);
    remaining -= ms;
  }
  stopScripts(slowest, "slow");
}

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function armTimer(ms: number, onFire: () => void): void {
  clearTimer();
  timer = setTimeout(onFire, ms);
}

function takeNext(): Job | undefined {
  let bestIndex = -1;
  let best: DisplayPassPriority | null = null;
  for (const [index, job] of queue.entries()) {
    const priority = job.priority();
    if (best === null || (priority.visible && !best.visible) || (priority.visible === best.visible && priority.order > best.order)) {
      best = priority;
      bestIndex = index;
    }
  }
  return bestIndex === -1 ? undefined : queue.splice(bestIndex, 1)[0];
}

/** The browser cannot run the Worker: every waiting row renders without its scripts, now and for the session. */
function giveUp(): void {
  unavailable = true;
  clearTimer();
  worker?.terminate();
  worker = null;
  const waiting = [...(active === null ? [] : [active.job]), ...queue.splice(0)];
  active = null;
  for (const job of waiting) {
    job.resolve(job.pass.text);
  }
  notify.warn({ id: UNAVAILABLE_NOTICE_ID, title: DISPLAY_SCRIPTS_UNAVAILABLE_TITLE, description: DISPLAY_SCRIPTS_UNAVAILABLE_DESCRIPTION });
}

/** The running script overran its deadline: kill the Worker mid-instruction, stop that script, and run the
 *  row again without it. */
function onDeadline(): void {
  if (active === null) {
    return;
  }
  const { job, scripts, index } = active;
  active = null;
  timer = undefined;
  worker?.terminate();
  worker = null;
  const culprit = scripts[index];
  if (culprit !== undefined) {
    stopScripts([culprit], "slow");
  }
  queue.push(job);
  pump();
}

function onReply(event: MessageEvent<DisplayPassReply>): void {
  const message = event.data;
  if (active === null || message.jobId !== active.job.id) {
    return;
  }
  if (message.kind === "start") {
    active.index = message.index;
    armTimer(DISPLAY_SCRIPT_DEADLINE_MS, onDeadline);
    return;
  }
  clearTimer();
  const { job, scripts } = active;
  active = null;
  if (message.cut === "budget") {
    stopSlowest(scripts, message.timings);
  } else if (message.cut === "oversize") {
    const culprit = scripts[message.timings.length - 1];
    stopScripts(culprit === undefined ? [] : [culprit], "oversize");
  }
  job.resolve(message.text);
  pump();
}

function spawn(): Worker | null {
  try {
    const spawned = new Worker(new URL("./display-pass.worker.ts", import.meta.url), { type: "module", name: "orb-display-pass" });
    spawned.addEventListener("message", onReply);
    // A module that fails to load (a refused policy, a network failure) reports here and never answers.
    spawned.addEventListener("error", giveUp);
    return spawned;
  } catch {
    return null;
  }
}

function pump(): void {
  while (active === null && !unavailable) {
    const job = takeNext();
    if (job === undefined) {
      return;
    }
    const scripts = job.pass.scripts.filter((script) => !stoppedKeys.has(stopKey(script)));
    const now = performance.now();
    job.firstRunAt ??= now;
    const budgetMs = DISPLAY_ROW_BUDGET_MS - (now - job.firstRunAt);
    if (scripts.length === 0 || budgetMs <= 0) {
      job.resolve(job.pass.text);
      continue;
    }
    worker ??= spawn();
    if (worker === null) {
      queue.push(job);
      giveUp();
      return;
    }
    active = { job, scripts, index: -1 };
    const run: DisplayPassRun = { kind: "run", jobId: job.id, text: job.pass.text, scripts, macroCtx: job.pass.macroCtx, call: job.pass.call, budgetMs };
    worker.postMessage(run);
    // The first start notice re-arms this with the script deadline; a Worker that never sends one cannot run.
    armTimer(WORKER_START_LIMIT_MS, giveUp);
  }
}

function abandoned(): DOMException {
  return new DOMException("The row no longer needs its display pass.", "AbortError");
}

/** Run a display pass's scripts in the Worker. Resolves with the scripted text; a stopped script is left out,
 *  and a browser that cannot run the Worker resolves with the text unscripted. An aborted request that has not
 *  started leaves the queue and rejects with an `AbortError`. */
export function runDisplayPass(pass: DisplayPass, request: DisplayPassRequest): Promise<string> {
  if (unavailable) {
    return Promise.resolve(pass.text);
  }
  return new Promise<string>((resolve, reject) => {
    const signal = request.signal;
    if (signal?.aborted === true) {
      reject(abandoned());
      return;
    }
    const job: Job = { id: nextJobId++, pass, priority: request.priority, resolve, firstRunAt: null };
    signal?.addEventListener(
      "abort",
      (): void => {
        const at = queue.indexOf(job);
        if (at !== -1) {
          queue.splice(at, 1);
          reject(abandoned());
        }
      },
      { once: true },
    );
    queue.push(job);
    pump();
  });
}
