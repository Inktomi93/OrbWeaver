import type { ProcessMacroOptions } from "#macro";
import { processMacros } from "#macro";

// Pure regex-script executor — usable from both client and server. The same find/replace pipeline
// runs client-side for DISPLAY-placement scripts and server-side for prompt-side placements; the
// server wraps in its own onScriptFailure + a node:vm-sandboxed `applyReplace` with a per-call
// timeout (node:vm can't live here — kit is browser-safe).
// The executor reads a kit-local structural `RegexScriptInput` (below) rather than the persisted
// `@orb/contracts` schema, since kit must not import contracts; `RegexScript satisfies
// RegexScriptInput` keeps them aligned from the contracts side.

/** Where in the pipeline a script runs. `DISPLAY` is frontend-only (render-time); the rest are
 *  prompt-side legs. */
export const REGEX_PLACEMENTS = [
  "USER_INPUT",
  "AI_OUTPUT",
  "SLASH_COMMAND",
  "WORLD_INFO",
  "REASONING",
  "DISPLAY",
] as const;

export type RegexPlacement = (typeof REGEX_PLACEMENTS)[number];

/** Whether (and how) macros run on the FIND pattern before it is compiled: `none` = verbatim; `raw` =
 *  macros substituted as-is; `escaped` = substituted output regex-escaped (so `a.b` matches literally).
 *  The numeric values are the persisted/wire form (legacy ST card-format compat). */
export const SubstituteFindRegex = {
  none: 0,
  raw: 1,
  escaped: 2,
} as const;

export type SubstituteFindRegex = (typeof SubstituteFindRegex)[keyof typeof SubstituteFindRegex];

// Single source of truth: the executor rejects a pattern longer than this before `new RegExp`, and
// the contracts schema rejects it at the storage boundary — keep them equal.
export const MAX_FIND_REGEX_LENGTH = 2048;

/** The minimal structural shape the executor reads off a regex script. The persisted
 *  `RegexScript` (in `@orb/contracts`) is a superset and is declared to `satisfy` this. */
export interface RegexScriptInput {
  readonly enabled: boolean;
  /** Placements this script applies to — the executor runs it only when the requested
   *  placement is in this list. */
  readonly placement: readonly RegexPlacement[];
  readonly findRegex: string;
  readonly replaceString: string;
  // Optional fields are `?: T | undefined` (not bare `?: T`) so a zod-`.optional()`-inferred shape
  // still `satisfies` this under `exactOptionalPropertyTypes`.
  /** Macro-substitution mode for the FIND pattern (default-equivalent: `none`). */
  readonly substituteRegex?: SubstituteFindRegex | undefined;
  /** ST card-format leg flags. `markdownOnly` = display-only (skip on any non-DISPLAY
   *  placement); `promptOnly` = prompt-only (skip on DISPLAY). */
  readonly markdownOnly?: boolean | undefined;
  readonly promptOnly?: boolean | undefined;
  /** Substrings stripped from each spliced capture before it is inserted (macros run on each). */
  readonly trimStrings?: readonly string[] | undefined;
}

// ReDoS pre-compile heuristic (defense-in-depth, not a guarantee): counts quantifier-stack
// OCCURRENCES, not nesting depth, so the canonical ReDoS shape `(a+)+` (one stack) passes it. Real
// safety comes from the server's node:vm-sandboxed `applyReplace` per-call timeout; the browser has
// no runtime timeout and relies on this heuristic + the per-script try/catch.
const MAX_STACKED_QUANTIFIERS = 3;
const MAX_PATTERN_LENGTH = MAX_FIND_REGEX_LENGTH;
const DEFAULT_REGEX_FLAGS = "gm";
const DECIMAL_RADIX = 10;
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

// Used as the macro `postProcess` hook in `escaped` mode so a substituted value is matched literally.
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

// `g` is always forced on (the executor relies on replace-all semantics).
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

// Throws on over-complex patterns or invalid regex syntax — the caller's per-script try/catch turns
// either into an `onScriptFailure` and moves on.
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

// Values are `string | undefined` — an unmatched optional named group is undefined.
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

// LOAD-BEARING: runs AFTER the replacement template has already been macro-evaluated; the captured
// text it splices in is inserted verbatim and never macro-evaluated (see `buildReplacement`).
function resolveDollarToken(token: DollarToken, splice: SpliceContext): string {
  // `$$` is the literal-dollar escape: `$$1` emits the literal text `$1`.
  if (token.full === "$$") {
    return "$";
  }
  let matchText: string | undefined;

  if (token.num !== undefined) {
    const index = Number.parseInt(token.num, DECIMAL_RADIX);
    // Bound to the real capture-group count — the raw callback args continue with offset + subject
    // after the groups, so an out-of-range `$N` would leak them into the output.
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

  // Captured model text is inserted verbatim — never macro-evaluated.
  return matchText;
}

// ORDERING IS LOAD-BEARING: macros run on the replacement template FIRST, then `$N`/`$<name>`/
// {{match}} are spliced with the raw captured text — so an AI_OUTPUT script re-emitting a model
// reply containing `{{setvar::x::y}}` can never mutate persisted chat vars on the way through.
function buildReplacement(
  args: readonly unknown[],
  script: RegexScriptInput,
  ctx: ProcessMacroOptions,
): string {
  const lastArg = args.at(-1);
  const namedGroups = isNamedGroups(lastArg) ? lastArg : undefined;
  const captureCount = args.length - REPLACE_FIXED_ARGS - (namedGroups ? 1 : 0);

  // Macro pass on the template — before any capture is spliced in.
  let replacement = processMacros(script.replaceString, ctx);

  // `{{match}}` → `$0` resolves AFTER the macro pass so its expansion isn't itself macro-evaluated.
  replacement = replacement.replace(/{{match}}/gi, "$0");

  // `$$` matched first so `$(\d+)` can't consume the second `$` of an escape.
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

// Top-level factory (not an inline closure in the loop below — that would trip noLoopFunc).
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
    // markdownOnly is display-only (skip non-DISPLAY); promptOnly skips DISPLAY.
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
