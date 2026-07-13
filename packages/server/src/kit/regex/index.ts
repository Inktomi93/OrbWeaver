// The node:vm ReDoS watchdog. The regex engine is isomorphic (@orb/kit/regex — browser-bundled, so
// node:vm must not live there); this module is the server injection of its `applyReplace` seam: it runs
// `text.replace(regex, replacer)` inside a node:vm context with a hard per-call timeout. A user-authored
// pattern that triggers catastrophic backtracking is interrupted by V8's execution watchdog and throws,
// which the kit executor's per-script try/catch routes to `onScriptFailure`. One bad regex never hangs
// the event loop and never silently passes through.

import vm from "node:vm";
import type { RegexReplacer } from "@orb/kit/regex";

// Generous for a real find/replace over a chat message: a legitimate rule completes in microseconds,
// only a pathological backtrack approaches it. This is V8's interrupt watchdog, not a wall-clock read.
export const REGEX_APPLY_TIMEOUT_MS = 50;

// The one expression run in the sandbox. Fixed constant (not user input — the user's pattern is already
// a compiled RegExp object handed in as `regex`, never eval'd as code).
const APPLY_SCRIPT = new vm.Script("text.replace(regex, replacer)", {
  filename: "orb-regex-watchdog.vm",
});

/**
 * Build a node:vm-sandboxed `applyReplace` bound to `timeoutMs`. Throws on timeout or on any error
 * raised by the replacer — both surface to the kit executor's `onScriptFailure`. It does not
 * swallow-and-return the unmodified text: a silent pass-through would defeat the guard's observability.
 */
export function createRegexApplyReplace(
  timeoutMs: number = REGEX_APPLY_TIMEOUT_MS,
): (text: string, regex: RegExp, replacer: RegexReplacer) => string {
  return (text: string, regex: RegExp, replacer: RegexReplacer): string => {
    // The contextified object IS the sandbox's global — no ambient host globals. codeGeneration off is
    // belt-and-suspenders: the fixed script never eval()s.
    const context = vm.createContext(
      { text, regex, replacer },
      { codeGeneration: { strings: false, wasm: false } },
    );
    const result: unknown = APPLY_SCRIPT.runInContext(context, { timeout: timeoutMs });
    if (typeof result !== "string") {
      throw new TypeError(`regex applyReplace produced a non-string result (${typeof result})`);
    }
    return result;
  };
}

/** The server's default `applyReplace` — the {@link createRegexApplyReplace} watchdog at the standard
 *  {@link REGEX_APPLY_TIMEOUT_MS} budget. */
export const applyReplace = createRegexApplyReplace();
