// The node:vm ReDoS watchdog. The regex engine is isomorphic (@orb/kit/regex — browser-bundled, so node:vm must not
// live there); this module runs the server's regex passes under V8's execution watchdog. A user-authored pattern that
// backtracks without end is interrupted and reported through the executor's `onScriptFailure`; the text keeps what it
// had before that script. One bad regex never hangs the event loop and never silently passes through.
//
// ONE WATCHDOG ENTRY PER TEXT, NOT PER SCRIPT (D53). A pass applies its scripts in order to one text (a draft, a
// reply, a world-info entry, one history row) inside a single `runInContext` call, so the call count is texts, not
// texts x scripts: each entry costs Node a timer thread, which dwarfs a typical replace. The timeout cuts host code
// called from inside the context too, the kit executor and a native backtrack included, and the executor's own
// try/catch never sees it. The loop below records the script in flight, so the one that ran past
// {@link REGEX_ROW_DEADLINE_MS} is named, skipped, and the rest of its text runs in a fresh entry.
//
// THE PASS BUDGET (D53). Every entry of a pass draws on one budget of thread CPU time; once it is spent, every
// script still to run is reported as skipped with {@link RegexPassBudgetSpentError} and nothing more runs, so a
// library of scripts that each run long costs one budget, not scripts x the deadline. CPU time, not wall time: a
// host loaded past its cores must not spend a legitimate preset's budget waiting for one.
//
// A V8 regex compile is not interruptible: the deadline lands after it returns, so one entry can overshoot by the
// compile time of its pattern, which the stored find-length cap bounds.

import process from "node:process";
import vm from "node:vm";
import type { RegexNotAppliedCause } from "@orb/contracts/chat";
import type { ExecuteRegexScriptsArgs } from "@orb/kit/regex";
import { executeRegexScripts, REGEX_OUTPUT_TOO_LONG, REGEX_SUBSTITUTION_TOO_LONG } from "@orb/kit/regex";

export { FIND_COMPILE_LIMIT_MS, probeFindCompiles } from "./compile-probe.ts";

/** The wall time one entry (one text's scripts) may run before the script in flight is stopped. The real HUD
 *  preset's server-side scripts spend at most 8 ms on a 40,000-character reply. */
const REGEX_ROW_DEADLINE_MS = 100;

/** The thread CPU a pass over one text may spend. The real HUD preset's server-side scripts spend 6-8 ms on a
 *  40,000-character reply, and a set of their shape at most 11 ms on its first run in the process, measured on a host
 *  loaded past its core count. */
export const REGEX_TEXT_PASS_BUDGET_MS = 250;

// The history pass budget: the larger of a floor and ten times the honest per-row cost. The real preset's 21
// server-side scripts spend 0.18 ms a row when every row reaches them; a set of their shape, with every block they strip
// in every row, spends 0.05-0.35 ms a row on its first run, measured as above. The allowance is ten times the worst of
// those. Both budgets are derived again in `tests/server/domain/chat/regex-real-shape.suite.int.test.ts`, which fails if
// a set of the real shape costs more than a tenth of either on its first run.
const HISTORY_PASS_FLOOR_MS = 500;
const HISTORY_ROW_ALLOWANCE_MS = 4;

/** The thread CPU a history pass over `rows` rows may spend. A function of the row count, so a flat cap or a
 *  per-row allowance is one change here. */
export function regexHistoryPassBudgetMs(rows: number): number {
  return Math.max(HISTORY_PASS_FLOOR_MS, rows * HISTORY_ROW_ALLOWANCE_MS);
}

/** The code a skipped script's failure carries, so a log tells it from a script that ran past its deadline. */
export const REGEX_PASS_BUDGET_SPENT = "ERR_REGEX_PASS_BUDGET_SPENT";

/** A script that did not run because its pass had spent its budget. */
class RegexPassBudgetSpentError extends Error {
  readonly code = REGEX_PASS_BUDGET_SPENT;
}

// Node's code for a `runInContext` stopped at its timeout: the row deadline.
const VM_TIMEOUT_CODE = "ERR_SCRIPT_EXECUTION_TIMEOUT";

const CAUSE_BY_CODE: Readonly<Record<string, RegexNotAppliedCause>> = {
  [VM_TIMEOUT_CODE]: "row_deadline",
  [REGEX_PASS_BUDGET_SPENT]: "pass_budget",
  [REGEX_SUBSTITUTION_TOO_LONG]: "substitution_too_long",
  [REGEX_OUTPUT_TOO_LONG]: "output_too_long",
};

/** Why a pass did not apply a script, from the error its `onScriptFailure` received. Anything without one of the
 *  pass's own codes is a pattern that would not compile or run. */
export function regexNotAppliedCause(err: unknown): RegexNotAppliedCause {
  const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
  return (typeof code === "string" ? CAUSE_BY_CODE[code] : undefined) ?? "did_not_compile";
}

const MICROS_PER_MS = 1000;
const SANDBOX_OPTIONS = { codeGeneration: { strings: false, wasm: false } } as const;

// `vm.createContext` contextifies the object it is given in place and hands the same object back.
function contextified<T extends object>(sandbox: T): T {
  vm.createContext(sandbox, SANDBOX_OPTIONS);
  return sandbox;
}

// The one expression an entry runs: a call back into the host loop below. Fixed text, never user input; a
// pattern reaches the context only as a compiled RegExp inside the executor. One context serves a whole pass
// (creating one costs more than a typical replace) and holds only the loop of the entry in flight.
const ENTRY_SCRIPT = new vm.Script("run()", { filename: "orb-regex-watchdog.vm" });

/** One leg pass. */
export interface RegexPass {
  /** Apply `args.scripts` in order to `args.text`, the way {@link executeRegexScripts} does, under the pass's
   *  deadline and budget. A script stopped by either is reported through `args.onScriptFailure`. */
  readonly execute: (args: ExecuteRegexScriptsArgs) => string;
}

// One text's progress through its scripts. `next` is the script in flight, so a stop names it; `end` bounds the
// entry, so a script stopped after others shared its deadline can rerun alone before it is blamed.
interface EntryState {
  readonly args: ExecuteRegexScriptsArgs;
  text: string;
  next: number;
  end: number;
}

function runScripts(state: EntryState): void {
  for (; state.next < state.end; state.next += 1) {
    // One script per executor call: its own gate, macros and trim strings run as on any leg, and the assignment
    // lands only when the script finished, so a stopped one leaves the text as it was. The output bound is the text's
    // as it entered the pass, so the scripts cannot raise it one call at a time.
    state.text = executeRegexScripts({
      ...state.args,
      text: state.text,
      scripts: state.args.scripts.slice(state.next, state.next + 1),
      passInputLength: state.args.text.length,
    });
  }
}

function reportBudgetSpent(state: EntryState, budgetMs: number): void {
  for (const skipped of state.args.scripts.slice(state.next)) {
    state.args.onScriptFailure?.(new RegexPassBudgetSpentError(`regex pass budget of ${budgetMs} ms CPU spent; script not run`), skipped);
  }
}

function cpuMsSince(before: NodeJS.CpuUsage): number {
  const used = process.threadCpuUsage(before);
  return (used.user + used.system) / MICROS_PER_MS;
}

/**
 * Open one leg pass with `budgetMs` of thread CPU. Open a new pass for each leg run: a pass shared across turns
 * would spend a later turn's budget on an earlier one. History passes take {@link regexHistoryPassBudgetMs}.
 */
export function openRegexPass(budgetMs: number = REGEX_TEXT_PASS_BUDGET_MS): RegexPass {
  let spentMs = 0;
  let inFlight: EntryState | undefined;
  const sandbox = contextified({
    run: (): void => {
      if (inFlight !== undefined) {
        runScripts(inFlight);
      }
    },
  });

  // One entry over `state.next` to `state.end`. A script the deadline stops is skipped only when it had the
  // deadline to itself; one that started after others spent part of it reruns alone first, so a slow first compile
  // of many honest scripts never blames the one that happened to be running.
  const enter = (state: EntryState, remainingMs: number): void => {
    inFlight = state;
    const deadlineMs = Math.min(REGEX_ROW_DEADLINE_MS, Math.ceil(remainingMs));
    const first = state.next;
    const before = process.threadCpuUsage();
    try {
      ENTRY_SCRIPT.runInContext(sandbox, { timeout: deadlineMs });
    } catch (err) {
      const stopped = state.args.scripts[state.next];
      if (stopped === undefined) {
        throw err;
      }
      if (state.next > first) {
        state.end = state.next + 1;
        return;
      }
      state.args.onScriptFailure?.(err, stopped);
      state.next += 1;
    } finally {
      inFlight = undefined;
      spentMs += cpuMsSince(before);
    }
    state.end = state.args.scripts.length;
  };

  const execute = (args: ExecuteRegexScriptsArgs): string => {
    const state: EntryState = { args, text: args.text, next: 0, end: args.scripts.length };
    while (state.next < args.scripts.length) {
      const remainingMs = budgetMs - spentMs;
      if (remainingMs <= 0) {
        reportBudgetSpent(state, budgetMs);
        break;
      }
      enter(state, remainingMs);
    }
    return state.text;
  };
  return { execute };
}

// The `.test` twin, for the world-info regex-KEY matcher. A V3 `use_regex` entry key is a user-authored pattern
// `.test`ed against the chat-history haystack EVERY turn; a catastrophic key (`(a|a)+$`, `(a+)+$`) backtracks
// unbounded on the main event loop, hanging the server for every user on the process. Running the `.test` under
// V8's watchdog interrupts it and throws — the kit matcher catches that and treats the key as a non-match.
const TEST_SCRIPT = new vm.Script("regex.test(haystack)", {
  filename: "orb-regex-test-watchdog.vm",
});

// Per-key deadline: a key is one pattern on one haystack, the shape of one script on one text.
const REGEX_TEST_TIMEOUT_MS = 50;

/**
 * Build a node:vm-sandboxed `regex.test(haystack)` bound to a per-call deadline. Throws on timeout (V8's execution
 * watchdog interrupts the backtrack) or on a non-boolean result. The world-info key matcher
 * ({@link matchEntryKeys}) injects this as its `testRegex` seam and routes a throw to `onKeyCompileFailure`,
 * so a ReDoS key never hangs the turn and never silently passes as a match.
 */
export function createRegexTest(): (regex: RegExp, haystack: string) => boolean {
  // One context for every call, cleared after each: creating one costs more than a typical test.
  const sandbox = contextified<{ regex: RegExp | undefined; haystack: string | undefined }>({ regex: undefined, haystack: undefined });
  return (regex: RegExp, haystack: string): boolean => {
    sandbox.regex = regex;
    sandbox.haystack = haystack;
    try {
      const result: unknown = TEST_SCRIPT.runInContext(sandbox, { timeout: REGEX_TEST_TIMEOUT_MS });
      if (typeof result !== "boolean") {
        throw new TypeError(`regex test produced a non-boolean result (${typeof result})`);
      }
      return result;
    } finally {
      sandbox.regex = undefined;
      sandbox.haystack = undefined;
    }
  };
}
