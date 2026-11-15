import type { CharacterId, PersonaId, UserId } from "#ids";
import type { ProcessMacroOptions } from "#macro";
import { processMacros } from "#macro";
import type { MessageKind, ParticipantKind, ParticipantRole, RoomStanding } from "#message-author";
import { participantOf, standingOf } from "#message-author";
import type { MessageRole } from "#message-role";

// Pure regex-script executor, usable from both client and server. The server runs it inside its own node:vm
// watchdog with a deadline and a pass budget (node:vm cannot live here; kit is browser-safe).
// The executor reads a kit-local structural `RegexScriptInput` rather than the persisted `@orb/contracts` schema,
// since kit must not import contracts; `RegexScriptRow satisfies RegexScriptInput` keeps them aligned.
//
// TWO AXES. A script states WHAT text it touches (`targets`) and WHEN it runs (`passes`), as two independent
// settings; it runs on a call only when both name the call. This is SillyTavern's own model: its placement says
// what, and its two "alter chat display" and "alter outgoing prompt" switches say when, with neither switch meaning
// the stored text is rewritten. The save pass is persistent (what it writes is canon); the display and prompt
// passes are ephemeral (they change a copy and never a row).
//
// A ROW'S TARGET is USER_INPUT for a user row and AI_OUTPUT for every other, on every pass. A narrator-kind row is
// group narration, the assistant's own output, so it is AI_OUTPUT; SillyTavern's narrator target (its placement 3)
// is a typed system line a human writes, which has no counterpart here. `messageTargetOf` is that one mapping, and
// a script that must tell narration apart selects on the row's kind in its author scope.
//
// DEPTH AND AUTHORS live only on the ephemeral passes: depth is a position in a rendered transcript or an assembled
// history, and a save-time target already names its author. Depth 0 is the newest non-system message and counts
// backwards; the message a continue extends sits at -1, so the floor is -1.

/** WHAT text a script touches. Every member has a pass that reads it; SillyTavern's slash-command and narrator
 *  target has no text here (orbweaver has no server slash pipeline, D107). */
export const REGEX_TARGETS = ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO", "REASONING"] as const;
export type RegexTarget = (typeof REGEX_TARGETS)[number];

/** The targets that are a chat row's own text, so a pass over them knows the row that wrote it. */
export type RegexRowTarget = Exclude<RegexTarget, "WORLD_INFO">;

/** The row targets the prompt pass reads: a row's body, never its reasoning (see {@link regexPassReadsTarget}). */
export type RegexPromptRowTarget = Exclude<RegexRowTarget, "REASONING">;

/** WHEN a script runs: `save` rewrites the text before it is stored, `display` changes what the reader sees, `prompt`
 *  changes the copy the model reads. */
export const REGEX_PASSES = ["save", "display", "prompt"] as const;
export type RegexPass = (typeof REGEX_PASSES)[number];

/** The passes that change a copy and never a row. Depth and an author scope are legal only beside one of them. */
export const EPHEMERAL_REGEX_PASSES = ["display", "prompt"] as const satisfies readonly RegexPass[];
type EphemeralRegexPass = (typeof EPHEMERAL_REGEX_PASSES)[number];

/** The shallowest depth a bound may name: the reply a continue extends. */
export const REGEX_DEPTH_FLOOR = -1;
/** The deepest depth a bound may name; SillyTavern's editor caps both fields here. */
export const REGEX_DEPTH_MAX = 9999;

/** Which messages by position an ephemeral pass applies to, both bounds inclusive. Depth 0 is the newest non-system
 *  message and counts backwards; -1 is the reply a continue extends. `max: null` is no ceiling. A bound of
 *  {@link REGEX_DEPTH_FLOOR} as `min` is no floor. */
export interface RegexDepth {
  readonly min: number;
  readonly max: number | null;
}

/** One member of an author scope, over a row's existing stamps: the participant kind that wrote it, its author's
 *  room standing now (host or member), the row's message kind, or one character, persona or user by id. */
export type RegexAuthorSelector =
  | { readonly by: "participant"; readonly participant: ParticipantKind }
  | { readonly by: "standing"; readonly standing: ParticipantRole }
  | { readonly by: "kind"; readonly kind: MessageKind }
  | { readonly by: "character"; readonly characterId: CharacterId }
  | { readonly by: "persona"; readonly personaId: PersonaId }
  | { readonly by: "user"; readonly userId: UserId };

/** Which authors' rows an ephemeral pass applies to, beyond what the target already says. An empty `include` admits
 *  every author; `exclude` then removes its members. */
export interface RegexAuthorScope {
  readonly include: readonly RegexAuthorSelector[];
  readonly exclude: readonly RegexAuthorSelector[];
}

/** The stamps a chat row carries, as an ephemeral pass reads its author and its target off them. */
export interface RegexRowStamps {
  readonly role: MessageRole;
  readonly kind: MessageKind;
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
}

/** The target a row's body takes. Reasoning text is always `REASONING` and is not mapped here. */
export function messageTargetOf(row: Pick<RegexRowStamps, "role">): RegexPromptRowTarget {
  return row.role === "user" ? "USER_INPUT" : "AI_OUTPUT";
}

function selectorMatches(selector: RegexAuthorSelector, row: RegexRowStamps, room: RoomStanding): boolean {
  switch (selector.by) {
    case "participant":
      return participantOf(row) === selector.participant;
    case "standing":
      return standingOf(row, room) === selector.standing;
    case "kind":
      return row.kind === selector.kind;
    case "character":
      return row.characterId === selector.characterId;
    case "persona":
      return row.personaId === selector.personaId;
    case "user":
      return row.authorUserId === selector.userId;
    default:
      return assertNeverSelector(selector);
  }
}

function assertNeverSelector(selector: never): never {
  throw new Error(`unhandled regex author selector ${JSON.stringify(selector)}`);
}

/** Whether a script's author scope admits a row, read against the room as it is now. An absent scope admits every
 *  author: that is its only reading, and every stored native script has none. */
function authorScopeAdmits(scope: RegexAuthorScope | undefined, row: RegexRowStamps, room: RoomStanding): boolean {
  if (scope === undefined) {
    return true;
  }
  const included = scope.include.length === 0 || scope.include.some((selector) => selectorMatches(selector, row, room));
  return included && !scope.exclude.some((selector) => selectorMatches(selector, row, room));
}

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
// the contracts schema rejects it at the storage boundary — keep them equal. Length is a weak stand-in for
// cost, so it is the storage bound, set above a public HUD preset's largest panel pattern (10,189 characters); the
// cost guards are the server's: `packages/server/src/primitives/regex/index.ts` and
// `packages/server/src/primitives/regex/compile-probe.ts`.
export const MAX_FIND_REGEX_LENGTH = 16_384;

/** The minimal structural shape the executor reads off a regex script. The persisted
 *  `RegexScriptRow` (in `@orb/contracts`) is a superset and is declared to `satisfy` this. */
export interface RegexScriptInput {
  readonly enabled: boolean;
  /** What text the script touches; it runs only on a call whose target is listed. */
  readonly targets: readonly RegexTarget[];
  /** When the script runs; it runs only on a call whose pass is listed. */
  readonly passes: readonly RegexPass[];
  readonly findRegex: string;
  readonly replaceString: string;
  // Optional fields are `?: T | undefined` (not bare `?: T`) so a zod-`.optional()`-inferred shape
  // still `satisfies` this under `exactOptionalPropertyTypes`.
  /** Macro-substitution mode for the FIND pattern (default-equivalent: `none`). */
  readonly substituteRegex?: SubstituteFindRegex | undefined;
  /** Whether the script also runs when a stored row is edited (a save call with `edit`). */
  readonly runOnEdit?: boolean | undefined;
  /** Substrings stripped from each spliced capture before it is inserted (macros run on each). */
  readonly trimStrings?: readonly string[] | undefined;
  /** The positions an ephemeral pass applies to ({@link RegexDepth}). Absent is every position; a save call
   *  carries no position, so it never reads this. */
  readonly depth?: RegexDepth | undefined;
  /** The authors an ephemeral pass applies to ({@link RegexAuthorScope}). Absent is every author, its only
   *  reading; a save call and a world-info call have no row author, so they never read this. */
  readonly authors?: RegexAuthorScope | undefined;
}

// Whether a depth bound admits a position. A call with no position (a hidden row on display, a world-info entry
// that is not placed at depth) passes, as SillyTavern's gate checks depth only when the caller supplies a number.
function withinDepth(scope: RegexDepth | undefined, depth: number | undefined): boolean {
  if (scope === undefined || depth === undefined) {
    return true;
  }
  return depth >= scope.min && (scope.max === null || depth <= scope.max);
}

// No pattern is refused for its SHAPE (D53). A shape filter cannot tell a lazy `.*?` from a runaway: the
// stacked-quantifier count it once applied refused a third of a real HUD preset, every one of which finishes in
// milliseconds, and still admitted `(a+)+$`. The cost guard is a deadline: the server's per-call `node:vm` timeout
// (`packages/server/src/primitives/regex/index.ts`). The only pre-compile refusal is the length cap above.
const MAX_PATTERN_LENGTH = MAX_FIND_REGEX_LENGTH;
const DEFAULT_REGEX_FLAGS = "gm";
const DECIMAL_RADIX = 10;
// captureCount = total args − (match + offset + subject) − (named-groups object present ? 1 : 0).
const REPLACE_FIXED_ARGS = 3;

/** The find-pattern guard a pattern broke. `max` is the bound. */
export interface FindPatternLimitBreak {
  readonly limit: "find-length";
  readonly max: number;
  readonly actual: number;
}

/** The find-pattern guard `pattern` breaks, or null. The executor refuses such a pattern before it compiles, so an
 *  import names the same break instead of storing a script that never runs. */
export function findPatternLimitBreak(pattern: string): FindPatternLimitBreak | null {
  return pattern.length > MAX_PATTERN_LENGTH ? { limit: "find-length", max: MAX_PATTERN_LENGTH, actual: pattern.length } : null;
}

function tooComplex(pattern: string): string | null {
  const broken = findPatternLimitBreak(pattern);
  return broken === null ? null : `pattern length ${broken.actual} exceeds cap ${broken.max}`;
}

// What raw substitution may add to a find pattern, in characters. Raw mode makes a macro's value pattern source, and a
// store-time check only sees the stored text, so the run-time bound is here. Honest use substitutes a name: ten times
// the 200-character name cap. 2,000 added characters of the costliest class measured compile in 86 ms of CPU; a card's
// prose field (100,000 characters) would compile for seconds on every turn its value changes. Escaped output is
// literal (5 ms at the full length cap), so only the length cap bounds it.
const MAX_RAW_SUBSTITUTION_GROWTH = 2000;

// A pass may grow a text to the larger of this multiple of its input and the floor below. The floor is ten times the
// largest output a public HUD preset's whole script set produced from a 40,000-character reply showing every panel
// (243,294 characters). The multiple covers a longer honest input, which panels grow by a fixed amount, not a factor.
const REGEX_OUTPUT_GROWTH_FACTOR = 2;
const REGEX_OUTPUT_FLOOR_LENGTH = 2_500_000;

/** The code a script carries when raw substitution grew its find pattern past the bound. */
export const REGEX_SUBSTITUTION_TOO_LONG = "ERR_REGEX_SUBSTITUTION_TOO_LONG";
/** The code a script carries when its output would have grown the text past the pass's output bound. */
export const REGEX_OUTPUT_TOO_LONG = "ERR_REGEX_OUTPUT_TOO_LONG";

class RegexScriptBoundError extends Error {
  readonly code: typeof REGEX_SUBSTITUTION_TOO_LONG | typeof REGEX_OUTPUT_TOO_LONG;
  constructor(code: RegexScriptBoundError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

// The longest a pass that started from `passInputLength` characters may make its text.
function regexOutputLimit(passInputLength: number): number {
  return Math.max(passInputLength * REGEX_OUTPUT_GROWTH_FACTOR, REGEX_OUTPUT_FLOOR_LENGTH);
}

// The text one script call would produce, counted as the replacer runs, so an amplifying replacement is stopped
// before the string is built rather than after.
interface OutputBudget {
  projected: number;
  readonly limit: number;
}

function charge(budget: OutputBudget, delta: number): void {
  budget.projected += delta;
  if (budget.projected > budget.limit) {
    throw new RegexScriptBoundError(REGEX_OUTPUT_TOO_LONG, `regex output would exceed ${budget.limit} characters; script not applied`);
  }
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
  return value.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g, (char) => REGEX_MACRO_ESCAPES[char] ?? `\\${char}`);
}

function filterString(rawString: string, trimStrings: readonly string[], ctx: ProcessMacroOptions): string {
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
    const added = pattern.length - script.findRegex.length;
    if (added > MAX_RAW_SUBSTITUTION_GROWTH) {
      throw new RegexScriptBoundError(
        REGEX_SUBSTITUTION_TOO_LONG,
        `raw substitution added ${added} characters to the find pattern, over the ${MAX_RAW_SUBSTITUTION_GROWTH} character limit`,
      );
    }
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

// A find pattern read as it is stored: its macros resolve to nothing, as the server's compile probe reads them.
const STORED_PATTERN_MACROS: ProcessMacroOptions = { char: "", user: "", persona: "", scenario: "", env: {} };

/** Whether a find pattern, as stored, compiles to a regular expression. Construction only parses the pattern; V8
 *  compiles it to code on its first run, which is the cost the server's compile probe measures off the event loop. */
export function findPatternCompiles(script: Pick<RegexScriptInput, "findRegex" | "substituteRegex">): boolean {
  try {
    compilePattern({ enabled: true, targets: [], passes: [], replaceString: "", ...script }, STORED_PATTERN_MACROS);
    return true;
  } catch {
    return false;
  }
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

  if (matchText === undefined || matchText === "") {
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
function buildReplacement(args: readonly unknown[], script: RegexScriptInput, ctx: ProcessMacroOptions, budget: OutputBudget): string {
  const lastArg = args.at(-1);
  const namedGroups = isNamedGroups(lastArg) ? lastArg : undefined;
  const captureCount = args.length - REPLACE_FIXED_ARGS - (namedGroups ? 1 : 0);

  // Macro pass on the template — before any capture is spliced in.
  let replacement = processMacros(script.replaceString, ctx);

  // `{{match}}` → `$0` resolves AFTER the macro pass so its expansion isn't itself macro-evaluated.
  replacement = replacement.replace(/\{\{match\}\}/gi, "$0");
  charge(budget, replacement.length);

  // `$$` matched first so `$(\d+)` can't consume the second `$` of an escape. Each splice is charged before it is
  // returned: the macro budget never sees captured text, so a template of many `$1`s is bounded only here.
  return replacement.replace(/\$\$|\$(\d+)|\$<([^>]+)>/g, (full: string, num: string | undefined, name: string | undefined): string => {
    const piece = resolveDollarToken({ full, num, name }, { args, captureCount, namedGroups, script, ctx });
    charge(budget, piece.length - full.length);
    return piece;
  });
}

/** Native `String.replace` callback shape: `(match, p1..pn, offset, subject, groups?)`. */
export type RegexReplacer = (substring: string, ...rest: unknown[]) => string;

interface RegexExecuteOptions {
  /** Called per script that fails to compile or execute. Server wires this to a logger + a
   *  disabled-script tally; client can wire console.warn or leave it (undefined → silent skip,
   *  fine for display-side rendering). */
  onScriptFailure?: (err: unknown, script: RegexScriptInput) => void;
  /** Seam over `text.replace(regex, replacer)`. Default: plain native replace (no timeout — the
   *  browser's lot; the server instead runs the whole executor under its watchdog). The display tier
   *  injects its shape check here. A throw from here is caught by the per-script try/catch like any other failure. */
  applyReplace?: (text: string, regex: RegExp, replacer: RegexReplacer) => string;
}

// Top-level factory (not an inline closure in the loop below — that would trip noLoopFunc).
function makeReplacer(script: RegexScriptInput, ctx: ProcessMacroOptions, budget: OutputBudget): RegexReplacer {
  return (...args: unknown[]): string => {
    const [matched] = args;
    charge(budget, -(typeof matched === "string" ? matched.length : 0));
    return buildReplacement(args, script, ctx, budget);
  };
}

/** One executor call: the pass, the target, and what that pass knows about the text. The row's stamps are required
 *  on a display or prompt call over a row's text, so no call site can forget them and run an author-scoped script
 *  on every row. `depth` is the row's position, or undefined for a row the count skips. */
export type RegexPassCall =
  /** `edit` is true when the save is an edit of a stored row, where only a `runOnEdit` script runs. */
  | { readonly pass: "save"; readonly target: RegexTarget; readonly edit: boolean }
  | RegexRowPassCall<"display", RegexRowTarget>
  | RegexRowPassCall<"prompt", RegexPromptRowTarget>
  | { readonly pass: "prompt"; readonly target: "WORLD_INFO"; readonly depth: number | undefined };

/** An ephemeral call over a row's text, with what that pass knows about the row. */
interface RegexRowPassCall<P extends EphemeralRegexPass, T extends RegexRowTarget> {
  readonly pass: P;
  readonly target: T;
  readonly row: RegexRowStamps;
  /** The room's present seats, which a standing selector reads. */
  readonly room: RoomStanding;
  readonly depth: number | undefined;
}

/** Arguments to {@link executeRegexScripts}. A single object (rather than positional args) keeps the
 *  call within the 4-param house cap and lets the optional execution seams ({@link RegexExecuteOptions})
 *  ride alongside the required inputs without conflating them with the macro context. */
export interface ExecuteRegexScriptsArgs extends RegexExecuteOptions {
  readonly text: string;
  readonly scripts: readonly RegexScriptInput[];
  readonly call: RegexPassCall;
  /** Macro context for the find/replace template passes (the same shape `processMacros` consumes). */
  readonly ctx: ProcessMacroOptions;
  /** The length of the text the pass started from, when a caller runs one pass as several calls (the server runs
   *  one script per call). Absent ⇒ `text` is the pass's input. The pass's output bound is read from it, so a chain
   *  of scripts cannot ratchet the bound up call by call. */
  readonly passInputLength?: number | undefined;
}

/** Every reason a script sits out a call, in the executor's gate order. */
const REGEX_SKIP_REASONS = ["disabled", "not-on-this-pass", "not-on-this-target", "not-on-edit", "out-of-depth", "not-this-author"] as const;
export type RegexSkipReason = (typeof REGEX_SKIP_REASONS)[number];

/** Why a script sits out a call, or null when it runs: the executor's own gate, so a panel that explains a run reads
 *  the same decision. SillyTavern's gate checks the edit switch, then depth, then the placement; the order here only
 *  changes which reason is named, never whether the script runs. */
export function regexSkipReason(script: RegexScriptInput, call: RegexPassCall): RegexSkipReason | null {
  if (!script.enabled) {
    return "disabled";
  }
  if (!script.passes.includes(call.pass)) {
    return "not-on-this-pass";
  }
  if (!script.targets.includes(call.target)) {
    return "not-on-this-target";
  }
  if (call.pass === "save") {
    return call.edit && script.runOnEdit !== true ? "not-on-edit" : null;
  }
  if (!withinDepth(script.depth, call.depth)) {
    return "out-of-depth";
  }
  return "row" in call && !authorScopeAdmits(script.authors, call.row, call.room) ? "not-this-author" : null;
}

const PASS_TARGETS: { readonly [P in RegexPass]: readonly RegexTarget[] } = {
  save: ["USER_INPUT", "AI_OUTPUT", "REASONING"],
  display: ["USER_INPUT", "AI_OUTPUT", "REASONING"],
  prompt: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO"],
};

/** Whether any call runs this target on this pass. World info is read only as the prompt is built, so it has no save
 *  or display call. Reasoning has no prompt call: the only thinking a prompt carries back is provider-signed, which the
 *  provider checks against its text, so it is never rewritten, and unsigned thinking is never stored to replay
 *  (`reasoningPartsOf` in packages/inference/src/backends/v4/stream.ts). An editor greys out a pair this refuses. */
export function regexPassReadsTarget(pass: RegexPass, target: RegexTarget): boolean {
  return PASS_TARGETS[pass].includes(target);
}

/** Whether a script runs on any text at all: some pass it runs on reads some target it names
 *  ({@link regexPassReadsTarget}). An import switches off a script that does not. */
export function regexBehaviorReachesText(behavior: { readonly targets: readonly RegexTarget[]; readonly passes: readonly RegexPass[] }): boolean {
  return behavior.passes.some((pass) => behavior.targets.some((target) => regexPassReadsTarget(pass, target)));
}

/**
 * Apply, in order, every enabled script whose passes and targets both name the call and whose depth and author
 * scope admit it. Returns the processed text. A script that throws (bad regex, too complex, or a timeout from a
 * sandboxed `applyReplace`) is caught and reported via `onScriptFailure` so one bad regex can't poison the whole
 * list; the next script runs on the text as-is.
 */
export function executeRegexScripts(args: ExecuteRegexScriptsArgs): string {
  const { scripts, call, ctx } = args;
  const applyReplace: NonNullable<RegexExecuteOptions["applyReplace"]> =
    args.applyReplace ?? ((text, regex, replacer): string => text.replace(regex, replacer));
  let result = args.text;
  const limit = regexOutputLimit(args.passInputLength ?? args.text.length);

  for (const script of scripts) {
    if (regexSkipReason(script, call) !== null) {
      continue;
    }

    // reported to the optional args.onScriptFailure. Every server caller wires it
    // to getLog().warn (chat engine pipeline, assembly context and history-regex, the edit re-apply) and the regex
    // preview shows it to the author; only the client display tier omits it, by design. Ends if a server caller drops the sink.
    try {
      const regex = compilePattern(script, ctx);
      result = applyReplace(result, regex, makeReplacer(script, ctx, { projected: result.length, limit }));
    } catch (err) {
      args.onScriptFailure?.(err, script);
    }
  }

  return result;
}
