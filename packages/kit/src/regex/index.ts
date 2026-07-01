import type { ProcessMacroOptions } from "#macro";
import { processMacros } from "#macro";

// ── Pure regex-script executor — usable from both client and server ──────────
// Ported from neo-tavern (shared/_kit/regex-execute.ts). The same find/replace
// pipeline runs on the client for DISPLAY-placement scripts and on the server
// for the prompt-side placements. The server keeps a thin wrapper that adds its
// own onScriptFailure (logger + disabled-script tally) AND injects a node:vm-
// sandboxed `applyReplace` with a per-call timeout (the ReDoS watchdog — node:vm
// can't live here: @orb/kit is browser-safe / kit-purity forbids node:*). The
// client just consumes this executor directly with the default native replace.

// ── Engine vocab (ported from neo shared/_kit/regex.ts — the SHAPE only) ──────
// The zod `regexScriptSchema` / `RegexScript` it also defined are NOT ported:
// the persisted shape lives in @orb/contracts, and kit MUST NOT import contracts
// (core/Legacy-Migration-and-Gaps.md §1/§6 — contracts depends on kit, never the
// reverse). The executor instead reads a kit-local STRUCTURAL `RegexScriptInput`
// (below); `contracts/regex.RegexScript satisfies RegexScriptInput` keeps them
// aligned from the contracts side.

/** Where in the pipeline a script runs. `DISPLAY` is frontend-only (render-time);
 *  the rest are prompt-side legs. Exported as an `as const` tuple so callers can
 *  iterate the set and the union below derives from it (single source of truth). */
export const REGEX_PLACEMENTS = [
  "USER_INPUT",
  "AI_OUTPUT",
  "SLASH_COMMAND",
  "WORLD_INFO",
  "REASONING",
  "DISPLAY",
] as const;

export type RegexPlacement = (typeof REGEX_PLACEMENTS)[number];

/** Whether (and how) macros run on the FIND pattern before it is compiled:
 *  `none` = pattern used verbatim; `raw` = macros substituted into the pattern
 *  as-is; `escaped` = macros substituted with their output regex-escaped (so a
 *  value like `a.b` matches literally instead of as a wildcard). The numeric
 *  values are the persisted/wire form (legacy ST card-format compat). */
export const SubstituteFindRegex = {
  none: 0,
  raw: 1,
  escaped: 2,
} as const;

export type SubstituteFindRegex = (typeof SubstituteFindRegex)[keyof typeof SubstituteFindRegex];

// Hard cap on a user-authored regex pattern. SINGLE SOURCE OF TRUTH — the executor rejects any
// pattern longer than this before `new RegExp`, and the contracts schema rejects it at the
// API/storage boundary (so an over-long pattern can't even be persisted). Keep them equal. 2048 is
// generous for a real find/replace rule; combined with the quantifier-stack heuristic + the
// server's node:vm per-call timeout, it bounds the ReDoS surface from a stored preset.
export const MAX_FIND_REGEX_LENGTH = 2048;

/** The minimal structural shape the executor reads off a regex script. The persisted
 *  `RegexScript` (in @orb/contracts) is a superset and is declared to `satisfy` this. */
export interface RegexScriptInput {
  readonly enabled: boolean;
  /** Placements this script applies to — the executor runs it only when the requested
   *  placement is in this list. */
  readonly placement: readonly RegexPlacement[];
  readonly findRegex: string;
  readonly replaceString: string;
  // NOTE: optional fields are `?: T | undefined` (NOT bare `?: T`) so a zod-`.optional()`-inferred
  // shape (`contracts/regex.RegexScript`, which is `T | undefined`) still `satisfies` this under
  // `exactOptionalPropertyTypes` — that satisfies-seam is the kit↔contracts contract (§1/§6).
  /** Macro-substitution mode for the FIND pattern (default-equivalent: `none`). */
  readonly substituteRegex?: SubstituteFindRegex | undefined;
  /** ST card-format leg flags. `markdownOnly` = display-only (skip on any non-DISPLAY
   *  placement); `promptOnly` = prompt-only (skip on DISPLAY). */
  readonly markdownOnly?: boolean | undefined;
  readonly promptOnly?: boolean | undefined;
  /** Substrings stripped from each spliced capture before it is inserted (macros run on each). */
  readonly trimStrings?: readonly string[] | undefined;
}

// ── ReDoS pre-compile heuristic (DEFENSE-IN-DEPTH, not a guarantee) ───────────
// Counts quantifier-stack OCCURRENCES across the pattern, not nesting depth, so the canonical ReDoS
// shape `(a+)+` (one stack) passes it. Real safety against catastrophic backtracking comes from the
// `applyReplace` seam: the server injects a node:vm-sandboxed replace with a hard per-call timeout.
// The browser has NO runtime timeout; it relies on this heuristic plus the per-script try/catch
// keeping one bad pattern from poisoning the whole list. Coarse on purpose: three+ consecutive
// quantifier-end markers anywhere → reject before `new RegExp`.
const MAX_STACKED_QUANTIFIERS = 3;
// Shared with the contracts schema cap so the storage-boundary cap and the execution cap are the
// SAME number and can't drift.
const MAX_PATTERN_LENGTH = MAX_FIND_REGEX_LENGTH;
// Default flags when the pattern is not in `/body/flags` form: global + multiline.
const DEFAULT_REGEX_FLAGS = "gm";
const DECIMAL_RADIX = 10;
// A native String.replace callback receives `[match, p1..pn, offset, subject, groups?]`.
// captureCount = total args − (match + offset + subject) − (named-groups object present ? 1 : 0).
const REPLACE_FIXED_ARGS = 3;

function tooComplex(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern length ${pattern.length} exceeds cap ${MAX_PATTERN_LENGTH}`;
  }
  const stacks = pattern.match(/[*+?}][)\]]*[*+?]/g);
  if (stacks && stacks.length >= MAX_STACKED_QUANTIFIERS) {
    return `pattern stacks ${stacks.length} quantifiers (cap ${MAX_STACKED_QUANTIFIERS})`;
  }
  return null;
}

// Regex metacharacters + the control chars ST escapes, mapped to their backslash form. Used as the
// macro `postProcess` hook in `escaped` mode so a substituted value is matched literally.
const REGEX_MACRO_ESCAPES: Readonly<Record<string, string>> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\v": "\\v",
  "\f": "\\f",
  "\0": "\\0",
};
function sanitizeRegexMacro(value: string): string {
  return value.replace(
    /[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs,
    (char) => REGEX_MACRO_ESCAPES[char] ?? `\\${char}`,
  );
}

function filterString(
  rawString: string,
  trimStrings: readonly string[],
  ctx: ProcessMacroOptions,
): string {
  let finalString = rawString;
  for (const trimString of trimStrings) {
    if (!trimString) {
      continue;
    }
    const subTrimString = processMacros(trimString, ctx);
    if (subTrimString) {
      finalString = finalString.split(subTrimString).join("");
    }
  }
  return finalString;
}

interface ParsedPattern {
  pattern: string;
  flags: string;
}

// Split a `/body/flags` pattern into its body + flags; otherwise use DEFAULT_REGEX_FLAGS. `g` is
// always forced on (the executor relies on replace-all semantics).
function parsePatternFlags(raw: string): ParsedPattern {
  if (raw.startsWith("/") && raw.lastIndexOf("/") > 0) {
    const lastSlash = raw.lastIndexOf("/");
    let flags = raw.slice(lastSlash + 1);
    if (!flags.includes("g")) {
      flags += "g";
    }
    return { pattern: raw.slice(1, lastSlash), flags };
  }
  return { pattern: raw, flags: DEFAULT_REGEX_FLAGS };
}

// Macro-substitute the find pattern (per substituteRegex mode), parse flags, run the ReDoS
// heuristic, and compile. Throws on over-complex patterns or invalid regex syntax — the caller's
// per-script try/catch turns either into an `onScriptFailure` and moves on.
function compilePattern(script: RegexScriptInput, ctx: ProcessMacroOptions): RegExp {
  let pattern = script.findRegex;
  if (script.substituteRegex === SubstituteFindRegex.raw) {
    pattern = processMacros(pattern, ctx);
  } else if (script.substituteRegex === SubstituteFindRegex.escaped) {
    pattern = processMacros(pattern, { ...ctx, postProcess: sanitizeRegexMacro });
  }
  const parsed = parsePatternFlags(pattern);
  const complexity = tooComplex(parsed.pattern);
  if (complexity !== null) {
    throw new Error(`regex too complex: ${complexity}`);
  }
  return new RegExp(parsed.pattern, parsed.flags);
}

// Narrow the native replace callback's trailing arg (the named-groups object) without an `as`
// launder. Values are `string | undefined` — an unmatched optional named group is undefined.
function isNamedGroups(value: unknown): value is Record<string, string | undefined> {
  return typeof value === "object" && value !== null;
}

interface DollarToken {
  full: string;
  num: string | undefined;
  name: string | undefined;
}
interface SpliceContext {
  args: readonly unknown[];
  captureCount: number;
  namedGroups: Record<string, string | undefined> | undefined;
  script: RegexScriptInput;
  ctx: ProcessMacroOptions;
}

// Resolve one `$$` / `$N` / `$<name>` token against the match captures. LOAD-BEARING: this runs
// AFTER the replacement template has already been macro-evaluated; the captured text it splices in
// is inserted VERBATIM and is never macro-evaluated (see `buildReplacement`).
function resolveDollarToken(token: DollarToken, splice: SpliceContext): string {
  // `$$` is the literal-dollar escape (native String.replace semantics): `$$1` emits the literal
  // text `$1`. The only way to author a literal `$N` in a replacement.
  if (token.full === "$$") {
    return "$";
  }
  let matchText: string | undefined;

  if (token.num !== undefined) {
    const index = Number.parseInt(token.num, DECIMAL_RADIX);
    // Bound to the real capture-group count — the raw callback args continue with offset + subject
    // after the groups, so an out-of-range `$N` used to leak the offset / whole subject into the
    // output. Native JS leaves an out-of-range `$N` as a literal; match that.
    if (index > splice.captureCount) {
      return token.full;
    }
    const candidate: unknown = splice.args[index];
    matchText = typeof candidate === "string" ? candidate : undefined;
  } else if (token.name !== undefined) {
    matchText = splice.namedGroups?.[token.name];
  }

  if (!matchText) {
    return "";
  }

  if (splice.script.trimStrings && splice.script.trimStrings.length > 0) {
    matchText = filterString(matchText, splice.script.trimStrings, splice.ctx);
  }

  // Captured model text is inserted VERBATIM — never macro-evaluated.
  return matchText;
}

// Build the replacement for one match. ORDERING IS LOAD-BEARING (shared-dissolution §9): macros run
// on the replacement TEMPLATE *first*, THEN `$N`/`$<name>`/{{match}} are spliced with the RAW
// captured text. So an AI_OUTPUT script re-emitting a `$N` capture of the model's own reply cannot
// have that captured text macro-evaluated — a reply containing `{{setvar::x::y}}` must NOT mutate
// persisted chat vars on the way through. (ST semantics + chat-resolution-pipeline.md §RECEIVE.)
function buildReplacement(
  args: readonly unknown[],
  script: RegexScriptInput,
  ctx: ProcessMacroOptions,
): string {
  const lastArg = args.at(-1);
  const namedGroups = isNamedGroups(lastArg) ? lastArg : undefined;
  const captureCount = args.length - REPLACE_FIXED_ARGS - (namedGroups ? 1 : 0);

  // Macro pass on the template — BEFORE any capture is spliced in.
  let replacement = processMacros(script.replaceString, ctx);

  // `{{match}}` → `$0` is resolved AFTER the macro pass so its `$0` expansion isn't itself macro-
  // evaluated (and an author can't smuggle a macro in via the captured whole-match).
  replacement = replacement.replace(/{{match}}/gi, "$0");

  // `$$` matched FIRST so the `$(\d+)` alternative can't consume the second `$` of an escape.
  return replacement.replace(
    /\$\$|\$(\d+)|\$<([^>]+)>/g,
    (full: string, num: string | undefined, name: string | undefined): string =>
      resolveDollarToken({ full, num, name }, { args, captureCount, namedGroups, script, ctx }),
  );
}

/** Native `String.replace` callback shape: `(match, p1..pn, offset, subject, groups?)`. */
export type RegexReplacer = (substring: string, ...rest: unknown[]) => string;

export interface RegexExecuteOptions {
  /** Called per script that fails to compile or execute. Server wires this to a logger + a
   *  disabled-script tally; client can wire console.warn or leave it (undefined → silent skip,
   *  fine for display-side rendering). */
  onScriptFailure?: (err: unknown, script: RegexScriptInput) => void;
  /** Seam over `text.replace(regex, replacer)`. Default: plain native replace (no timeout — the
   *  browser's lot). The server injects a node:vm-sandboxed version with a per-call timeout so a
   *  catastrophic-backtracking pattern throws (→ `onScriptFailure`) instead of hanging the turn. A
   *  throw from here is caught by the per-script try/catch like any other failure. */
  applyReplace?: (text: string, regex: RegExp, replacer: RegexReplacer) => string;
}

// Top-level factory (not an inline closure in the loop below — that would trip noLoopFunc) producing
// the per-script native-replace callback.
function makeReplacer(script: RegexScriptInput, ctx: ProcessMacroOptions): RegexReplacer {
  return (...args: unknown[]): string => buildReplacement(args, script, ctx);
}

/** Arguments to {@link executeRegexScripts}. A single object (rather than positional args) keeps the
 *  call within the 4-param house cap and lets the optional execution seams ({@link RegexExecuteOptions})
 *  ride alongside the required inputs without conflating them with the macro context. */
export interface ExecuteRegexScriptsArgs extends RegexExecuteOptions {
  text: string;
  scripts: readonly RegexScriptInput[];
  placement: RegexPlacement;
  /** Macro context for the find/replace template passes (the same shape `processMacros` consumes). */
  ctx: ProcessMacroOptions;
}

/**
 * Apply every enabled script whose `placement` includes the given placement, in order. Returns the
 * processed text. A script that throws (bad regex, too complex, or a timeout from a sandboxed
 * `applyReplace`) is caught + reported via `onScriptFailure` so one bad regex can't poison the whole
 * list; the next script runs on the text as-is.
 */
export function executeRegexScripts(args: ExecuteRegexScriptsArgs): string {
  const { scripts, placement, ctx } = args;
  const applyReplace: NonNullable<RegexExecuteOptions["applyReplace"]> =
    args.applyReplace ?? ((text, regex, replacer): string => text.replace(regex, replacer));
  let result = args.text;

  for (const script of scripts) {
    if (!script.enabled) {
      continue;
    }
    if (!script.placement.includes(placement)) {
      continue;
    }
    // `markdownOnly`/`promptOnly` gate the prompt-vs-display LEG within the placements the array
    // already allows: markdownOnly is display-only (skip non-DISPLAY); promptOnly skips DISPLAY.
    if (script.markdownOnly && placement !== "DISPLAY") {
      continue;
    }
    if (script.promptOnly && placement === "DISPLAY") {
      continue;
    }

    try {
      const regex = compilePattern(script, ctx);
      result = applyReplace(result, regex, makeReplacer(script, ctx));
    } catch (err) {
      args.onScriptFailure?.(err, script);
    }
  }

  return result;
}
