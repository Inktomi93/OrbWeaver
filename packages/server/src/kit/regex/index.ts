// @orb/server/kit/regex — the node:vm ReDoS watchdog (D53 step 1).
//
// The regex ENGINE is isomorphic and lives in `@orb/kit/regex` (compile + find/replace + the captures
// splice). That package is browser-bundled, so `node:vm` MUST NOT live there — kit exposes only the
// `applyReplace?` SEAM and a native-`text.replace` default ("the browser's lot", no runtime timeout).
// This module is the SERVER injection of that seam: it runs the one `text.replace(regex, replacer)`
// call inside a `node:vm` context with a HARD per-call timeout. A user-authored pattern that triggers
// catastrophic backtracking (`(a+)+$` against a long non-match — the canonical ReDoS the kit's
// pre-compile heuristic explicitly lets through) is interrupted by V8's execution watchdog and THROWS,
// which the kit executor's per-script try/catch routes to `onScriptFailure`. One bad regex never hangs
// the event loop and never silently passes through (a swallow-and-return-unchanged would blind the
// failure tally). node:vm is legal here: `@orb/server/kit` is server-only, never browser-bundled
// (structure.md — the directory-module cake; D53 (4)).

import vm from "node:vm";
import type { RegexReplacer } from "@orb/kit/regex";

// Per-call wall budget for ONE script's find/replace. 50ms is the value carried from neo-tavern's vm
// guard (reports/shared-dissolution.md §82 — "node:vm 50ms ReDoS watchdog") and is generous for a real
// find/replace over a chat message: a legitimate rule completes in microseconds, only a pathological
// backtrack approaches it. This is V8's interrupt watchdog, NOT a wall-clock read — the module stays
// deterministic (no Date.now/Math.random; the runtime owns the timer).
export const REGEX_APPLY_TIMEOUT_MS = 50;

// The ONE expression run in the sandbox. It is a fixed constant (NOT user input — the user's pattern is
// already a compiled `RegExp` object handed in as `regex`, never eval'd as code), pre-compiled once at
// module load and re-run against a fresh context per call.
const APPLY_SCRIPT = new vm.Script("text.replace(regex, replacer)", {
  filename: "orb-regex-watchdog.vm",
});

/**
 * Build a `node:vm`-sandboxed `applyReplace` bound to `timeoutMs` — the function shape the kit's
 * {@link RegexExecuteOptions.applyReplace} seam expects: `(text, regex, replacer) => string`.
 *
 * The composition root injects the result into `executeRegexScripts({ ..., applyReplace })` at the
 * SEND/RECEIVE seams so every HOST-tier (shared-prompt) regex runs under the watchdog. The default
 * {@link applyReplace} export uses {@link REGEX_APPLY_TIMEOUT_MS}; the factory exists so a caller (or a
 * test) can override the budget without reaching into the module.
 *
 * THROWS on timeout (V8 interrupts the synchronous backtrack: `Error: Script execution timed out…`) or
 * on any error raised by the replacer — both surface to the kit executor's `onScriptFailure`. It does
 * NOT swallow-and-return the unmodified text: a silent pass-through would defeat the guard's
 * observability (the disabled-script tally would never see the offending rule).
 */
export function createRegexApplyReplace(
  timeoutMs: number = REGEX_APPLY_TIMEOUT_MS,
): (text: string, regex: RegExp, replacer: RegexReplacer) => string {
  return (text: string, regex: RegExp, replacer: RegexReplacer): string => {
    // The contextified object IS the sandbox's global — it carries ONLY these three, no ambient host
    // globals (no `process`/`require`/timers). `codeGeneration` off is belt-and-suspenders: the fixed
    // script never eval()s, so disabling it costs nothing and slams the eval/Function door shut.
    const context = vm.createContext(
      { text, regex, replacer },
      { codeGeneration: { strings: false, wasm: false } },
    );
    const result: unknown = APPLY_SCRIPT.runInContext(context, { timeout: timeoutMs });
    // `String.prototype.replace` always yields a string; guard (vs. an `as` launder) so the `any` from
    // runInContext is narrowed by a real check, and a future change that returns non-string is loud.
    if (typeof result !== "string") {
      throw new TypeError(`regex applyReplace produced a non-string result (${typeof result})`);
    }
    return result;
  };
}

/** The server's default `applyReplace` — the {@link createRegexApplyReplace} watchdog at the standard
 *  {@link REGEX_APPLY_TIMEOUT_MS} budget. This is the name the kit `RegexExecuteOptions.applyReplace`
 *  seam expects; the composition root passes it straight into `executeRegexScripts`. */
export const applyReplace = createRegexApplyReplace();
