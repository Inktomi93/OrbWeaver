// The main-thread side of the display-pass Worker: one long-lived Worker, one job at a time, and the three
// bounds that keep a hostile display script from freezing the viewer's tab. A job is a row's display pass or the
// regex editor's preview; a preview runs first and takes only the per-script deadline.
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
// THE VIEWER LEARNS through the stop store (`display-script-stops.ts`): its one notice and the room's regex
// roster. A preview's stop raises no notice: the panel that ran it says so beside the result. It lands in the same
// store, so a saved script stopped in the tester stays off in the transcript too. There is never
// a main-thread fallback: when the Worker cannot start, every row renders without its scripts and one notice says
// so, and every preview reports itself unavailable.
//
// QUEUE ORDER: a row on screen first, then the newest; the caller supplies both through its priority read,
// which is read at each dispatch because a row scrolls in and out while it waits.

import { DISPLAY_SCRIPTS_UNAVAILABLE_DESCRIPTION, DISPLAY_SCRIPTS_UNAVAILABLE_TITLE } from "./display-pass-copy.ts";
import type { DisplayPassReply, DisplayPassRun, RegexPreviewOutcome, RegexPreviewRequest, RegexPreviewRun } from "./display-pass-protocol.ts";
import { DISPLAY_ROW_BUDGET_MS, DISPLAY_SCRIPT_DEADLINE_MS } from "./display-pass-protocol.ts";
import type { StopSubject } from "./display-script-stops.ts";
import { isDisplayScriptStopped, stopDisplayScripts } from "./display-script-stops.ts";
import type { StyledDisplayText } from "./display-styled.ts";
import type { DisplayPass } from "./message-render.ts";
import { notify } from "./notify.ts";
import type { RegexPreview } from "./regex-instrumented.ts";

/** Where a waiting row stands in the queue: on screen first, then the highest `order` (the newest row). */
interface DisplayPassPriority {
  readonly visible: boolean;
  readonly order: number;
}

export interface DisplayPassRequest {
  readonly signal?: AbortSignal | undefined;
  readonly priority: () => DisplayPassPriority;
}

/** How long a fresh Worker may take to report its first script before the browser is judged unable to run it. */
const WORKER_START_LIMIT_MS = 10_000;
// The browser refuses to construct a Worker with a `SecurityError` (a policy that forbids it) or a `SyntaxError` (a
// script URL it cannot parse).
const WORKER_REFUSAL_NAMES: ReadonlySet<string> = new Set(["SecurityError", "SyntaxError"]);
const UNAVAILABLE_NOTICE_ID = "display-scripts-unavailable";

interface DisplayJob {
  readonly kind: "display";
  readonly id: number;
  readonly pass: DisplayPass;
  readonly priority: DisplayPassRequest["priority"];
  readonly resolve: (result: StyledDisplayText) => void;
  /** Main-thread time of the first dispatch; a rerun after a kill spends what is left of the same budget. */
  firstRunAt: number | null;
}

interface PreviewJob {
  readonly kind: "preview";
  readonly id: number;
  readonly request: RegexPreviewRequest;
  readonly resolve: (outcomes: readonly RegexPreviewOutcome[]) => void;
  /** What each entry that ran did, by its index in the request; a rerun after a kill keeps them. */
  readonly results: Map<number, RegexPreview>;
}

type Job = DisplayJob | PreviewJob;

interface Active {
  readonly job: Job;
  /** The scripts this run carries: the job's scripts minus the ones already stopped (and, for a preview, the ones
   *  that already ran). */
  readonly scripts: readonly StopSubject[];
  /** A preview's entry index for each carried script. */
  readonly entries: readonly number[];
  /** The index of the script whose start notice arrived last; -1 before the first. */
  index: number;
}

// A preview is a person waiting on the panel they typed into, so it runs before any row.
const PREVIEW_PRIORITY: DisplayPassPriority = { visible: true, order: Number.POSITIVE_INFINITY };

let worker: Worker | null = null;
let unavailable = false;
let nextJobId = 0;
let active: Active | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const queue: Job[] = [];

/** The row spent its budget: stop the scripts that took longest on it until the rest fit in half the budget,
 *  so the next row with similar text runs whole. */
function stopSlowest(scripts: readonly StopSubject[], timings: readonly number[]): void {
  const byCost = timings.map((ms, index) => ({ ms, index })).toSorted((a, b) => b.ms - a.ms);
  let remaining = timings.reduce((sum, ms) => sum + ms, 0);
  const slowest: StopSubject[] = [];
  for (const { ms, index } of byCost) {
    const script = scripts[index];
    if (remaining <= DISPLAY_ROW_BUDGET_MS / 2 || script === undefined) {
      break;
    }
    slowest.push(script);
    remaining -= ms;
  }
  stopDisplayScripts(slowest, "slow", true);
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
    const priority = job.kind === "preview" ? PREVIEW_PRIORITY : job.priority();
    if (best === null || (priority.visible && !best.visible) || (priority.visible === best.visible && priority.order > best.order)) {
      best = priority;
      bestIndex = index;
    }
  }
  return bestIndex === -1 ? undefined : queue.splice(bestIndex, 1)[0];
}

// A row whose scripts did not run: its step-1 text, and nothing a script drew.
function unscripted(pass: DisplayPass): StyledDisplayText {
  return { text: pass.text, styled: false };
}

/** Each entry's outcome, in order, threading the text: an entry with no result was stopped, or could not run. */
function previewOutcomes(job: PreviewJob, missing: "stopped" | "unavailable"): readonly RegexPreviewOutcome[] {
  let text = job.request.text;
  return job.request.entries.map((_entry, index) => {
    const result = job.results.get(index);
    if (result === undefined) {
      return { kind: missing, output: text };
    }
    text = result.output;
    return { kind: "ran", ...result };
  });
}

// The text the next unrun entry reads: the output of the last entry that ran before it.
function previewTextBefore(job: PreviewJob, entry: number): string {
  let text = job.request.text;
  for (let index = 0; index < entry; index += 1) {
    text = job.results.get(index)?.output ?? text;
  }
  return text;
}

function settleUnscripted(job: Job): void {
  if (job.kind === "display") {
    job.resolve(unscripted(job.pass));
  } else {
    job.resolve(previewOutcomes(job, "unavailable"));
  }
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
    settleUnscripted(job);
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
    stopDisplayScripts([culprit], "slow", job.kind === "display");
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
  const { job, scripts, entries } = active;
  if (message.kind === "previewed") {
    const entry = entries[message.index];
    if (job.kind !== "preview" || entry === undefined) {
      return;
    }
    // The script finished inside its deadline; the next start notice arms the next one.
    clearTimer();
    job.results.set(entry, message.result);
    if (message.index < scripts.length - 1) {
      return;
    }
    active = null;
    job.resolve(previewOutcomes(job, "stopped"));
    pump();
    return;
  }
  if (job.kind !== "display") {
    return;
  }
  clearTimer();
  active = null;
  if (message.cut === "budget") {
    stopSlowest(scripts, message.timings);
  } else if (message.cut === "oversize") {
    const culprit = scripts[message.timings.length - 1];
    stopDisplayScripts(culprit === undefined ? [] : [culprit], "oversize", true);
  }
  job.resolve({ text: message.text, styled: message.styled });
  pump();
}

function spawn(): Worker | null {
  try {
    const spawned = new Worker(new URL("./display-pass.worker.ts", import.meta.url), { type: "module", name: "orb-display-pass" });
    spawned.addEventListener("message", onReply);
    // A module that fails to load (a refused policy, a network failure) reports here and never answers.
    spawned.addEventListener("error", giveUp);
    return spawned;
  } catch (error) {
    if (!(Error.isError(error) && WORKER_REFUSAL_NAMES.has(error.name))) {
      throw error;
    }
    return null;
  }
}

/** The message that starts a job, with the scripts and preview entries it carries, or null when nothing is left
 *  to run and the job has been settled. */
function dispatchOf(
  job: Job,
): { readonly message: DisplayPassRun | RegexPreviewRun; readonly scripts: readonly StopSubject[]; readonly entries: readonly number[] } | null {
  if (job.kind === "preview") {
    const entries = job.request.entries.flatMap((entry, index) => (job.results.has(index) || isDisplayScriptStopped(entry) ? [] : [index]));
    const first = entries[0];
    if (first === undefined) {
      job.resolve(previewOutcomes(job, "stopped"));
      return null;
    }
    const carried = entries.flatMap((index) => job.request.entries[index] ?? []);
    const { call, macroCtx } = job.request;
    const message: RegexPreviewRun = {
      kind: "preview",
      jobId: job.id,
      text: previewTextBefore(job, first),
      scripts: carried.map(({ script }) => script),
      macroCtx,
      call,
    };
    return { message, scripts: carried, entries };
  }
  const scripts = job.pass.scripts.filter((script) => !isDisplayScriptStopped(script));
  const now = performance.now();
  job.firstRunAt ??= now;
  const budgetMs = DISPLAY_ROW_BUDGET_MS - (now - job.firstRunAt);
  if (scripts.length === 0 || budgetMs <= 0) {
    job.resolve(unscripted(job.pass));
    return null;
  }
  const message: DisplayPassRun = { kind: "run", jobId: job.id, text: job.pass.text, scripts, macroCtx: job.pass.macroCtx, call: job.pass.call, budgetMs };
  return { message, scripts, entries: [] };
}

function pump(): void {
  while (active === null && !unavailable) {
    const job = takeNext();
    if (job === undefined) {
      return;
    }
    const dispatch = dispatchOf(job);
    if (dispatch === null) {
      continue;
    }
    worker ??= spawn();
    if (worker === null) {
      queue.push(job);
      giveUp();
      return;
    }
    active = { job, scripts: dispatch.scripts, entries: dispatch.entries, index: -1 };
    worker.postMessage(dispatch.message);
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
export function runDisplayPass(pass: DisplayPass, request: DisplayPassRequest): Promise<StyledDisplayText> {
  if (unavailable) {
    return Promise.resolve(unscripted(pass));
  }
  return new Promise<StyledDisplayText>((resolve, reject) => {
    const signal = request.signal;
    if (signal?.aborted === true) {
      reject(abandoned());
      return;
    }
    const job: DisplayJob = { kind: "display", id: nextJobId++, pass, priority: request.priority, resolve, firstRunAt: null };
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

/** Run the regex editor's preview in the Worker: each entry over the text the one before it left. A script that
 *  overruns its deadline is stopped for the session, keyed as a display script is, and the rest run without it. A
 *  request aborted before it starts leaves the queue and rejects with an `AbortError`. */
export function runRegexPreview(request: RegexPreviewRequest, signal?: AbortSignal): Promise<readonly RegexPreviewOutcome[]> {
  return new Promise<readonly RegexPreviewOutcome[]>((resolve, reject) => {
    const job: PreviewJob = { kind: "preview", id: nextJobId++, request, resolve, results: new Map() };
    if (unavailable) {
      resolve(previewOutcomes(job, "unavailable"));
      return;
    }
    if (signal?.aborted === true) {
      reject(abandoned());
      return;
    }
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
