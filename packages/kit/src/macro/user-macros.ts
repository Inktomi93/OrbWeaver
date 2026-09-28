// kit/macro/user-macros — the #24 typed-input fold: preset/game-
// authored TEMPLATE macros as FIRST-CLASS registry entries, plus the typed choice-block INPUT vocabulary
// (single-select / boolean-toggle / multi-select+separator / random-pick-from-pool) and its pure
// resolution against an injected VALUES bag.
//
// The design (owner-ratified #20/#24 — SAFER than ST's dynamic macros):
//  • DEFINITIONS live in preset/game CONFIG (`@orb/contracts/preset` `userMacroSchema`, mirrored onto
//    `rpg_games.config`), never a global mutable runtime — `registerUserMacros` composes them onto a
//    per-render registry the caller builds (`createDefaultRegistry()` + this), so one user's macros can
//    never leak into another's evaluation.
//  • A user macro is a NORMAL registry entry: declared args ride the SAME `checkMacroArgs` runtime
//    contract as builtins (padding/arity/type, metadata-driven), the universal block delivery gives it
//    content-as-last-arg for free, and flags (`! ? ~ > #`) behave exactly as on a builtin.
//  • The body evaluates through `ctx.resolve` — the SAME budget/PRNG/op-log/depth as eager resolution,
//    so recursion (self- or mutual-) trips the `MacroBudget` and degrades, never hangs; nested draws
//    land in document order (the determinism-through-nesting invariant, owner-ratified #19).
//  • Untrusted values (delivered args, per-user input picks) are `neutralizeMacros`'d BEFORE they are
//    spliced into the author's template — a user macro can never be a macro-injection vector.
//  • RANDOM-PICK is deterministic + swipe-safe: the draw rides the injected PRNG, and
//    `resolveUserMacroInputs` separates FROZEN draws (replayed byte-exact — the swipe path) from FRESH
//    draws (reported back so the caller freezes them at turn commit — the new-turn path).
//
// The per-turn input-VALUE threading (the FOREIGN-inputs seam, `ResolveForeignInputsOp`, domain/chat)
// is deliberately NOT here — this module is the pure kit half; the server threads a values bag +
// frozen-draw record through `resolveUserMacroInputs` and hands the bindings to `registerUserMacros`.

import { macroAnalysisBinding, macroAnalysisInputBinding, macroTextIsVolatile } from "./cache-safety.ts";
import { neutralizeMacros } from "./content.ts";
import { isIfTruthy } from "./metadata.ts";
import { MACRO_NAME_RE } from "./parser.ts";
import { unitDraw } from "./prng.ts";
import type { MacroAnalysisOptions, MacroArgDef, MacroContext, MacroHandler, MacroMetadataInput, MacroRegistry, MacroSourceRef } from "./types.ts";

// ── the definition vocabulary ────────────────────────────────────────────────────────────────────

/** The #24 typed-input KIND vocabulary (owner-ratified, final). The kind determines the control; the
 *  client owns the rendering (the presentation-style zoo is deliberately skipped). */
export const USER_MACRO_INPUT_KINDS = ["single-select", "boolean-toggle", "multi-select", "random-pick"] as const;
export type UserMacroInputKind = (typeof USER_MACRO_INPUT_KINDS)[number];

/** One selectable option of a select-family input (label = display, value = what the macro sees). */
export interface UserMacroInputOption {
  readonly label: string;
  readonly value: string;
}

/** One typed input of a user macro — a FLAT shape (kind + the per-kind knobs; irrelevant knobs are
 *  inert), mirroring the ChoiceBlock authoring idiom so the editor binds fields directly. Semantics by
 *  `kind` (resolveUserMacroInputs is the ONE resolution home):
 *   single-select  — the pick (a string, and one of the DECLARED options — #1356) or `defaultValue`
 *                    (else the first option's value).
 *   boolean-toggle — a boolean pick renders `onValue`/`offValue`; unpicked ⇒ `defaultValue` truthiness
 *                    (the `{{if}}` vocabulary) decides.
 *   multi-select   — the picks (a string[]) filtered to the DECLARED options (#1356) and joined by
 *                    `separator` in pick order; an explicit `[]` is a real "none"; unpicked (absent, or a
 *                    selection nothing survives) ⇒ `defaultValue` verbatim (an author-joined string).
 *   random-pick    — the user pre-selects a POOL (a string[]); each generation draws ONE via the
 *                    injected PRNG; unpicked ⇒ the pool is ALL options. */
export interface UserMacroInputDef {
  readonly kind: UserMacroInputKind;
  /** The binding name the body references as `{{name}}` (MACRO_NAME_RE-shaped). */
  readonly name: string;
  /** The question/label the client renders beside the control. */
  readonly label: string;
  readonly options: readonly UserMacroInputOption[];
  /** multi-select join separator. */
  readonly separator: string;
  /** boolean-toggle rendered values. */
  readonly onValue: string;
  readonly offValue: string;
  /** The unpicked fallback — per-kind semantics above. */
  readonly defaultValue: string;
}

/** One preset/game-authored macro definition — the shape `@orb/contracts/preset.userMacroSchema`
 *  produces (defined THERE as zod, typed HERE so kit needs no contracts import; the contract test pins
 *  the assignability). `args` are the SAME `MacroArgDef` contract builtins declare — `checkMacroArgs`
 *  enforces them identically. */
export interface UserMacroDef {
  readonly name: string;
  readonly description: string;
  readonly args: readonly MacroArgDef[];
  /** The template body — resolved through the engine with args/inputs spliced (neutralized) first. */
  readonly body: string;
  readonly inputs: readonly UserMacroInputDef[];
  /** Per-macro strict mode (metadata `strict`) — a violating call renders "" even under lenient. */
  readonly strict: boolean;
}

// ── the values bag + input resolution (#24) ──────────────────────────────────────────────────────

/** One input's per-turn per-user pick: string (single-select) · boolean (boolean-toggle) ·
 *  string[] (multi-select picks / the random-pick POOL). The wire schema lives in contracts/preset
 *  (`userMacroInputValueSchema`); the FOREIGN-inputs threading carries this shape unreshaped. */
export type UserMacroInputValue = string | boolean | readonly string[];
/** One macro's picks, keyed by input name. */
export type UserMacroInputValueBag = Readonly<Record<string, UserMacroInputValue>>;

export interface ResolveUserMacroInputsOptions {
  /** The injected PRNG (a float in [0,1)) random-pick draws ride — NEVER ambient entropy. */
  readonly prng: () => number;
  /** Prior random-pick draws for THIS turn (input name → drawn value) — the freeze-at-commit replay:
   *  a frozen draw is returned byte-exact and NO fresh draw happens (the swipe path). */
  readonly frozenDraws?: Readonly<Record<string, string>> | undefined;
}

export interface ResolvedUserMacroInputs {
  /** input name → resolved string — what the macro body sees. */
  readonly bindings: Record<string, string>;
  /** The FRESH random-pick draws made in this resolution (frozen replays excluded) — the caller
   *  records these at turn commit so a swipe replays them via `frozenDraws`. */
  readonly draws: Record<string, string>;
}

/** The `{{if}}` truthiness vocabulary applied to a boolean-toggle's `defaultValue` — one semantics for
 *  "does this string mean on?" (empty/false/off/0 ⇒ off). EXPORTED because the picks pane (#24) must
 *  SHOW an unpicked toggle's resolved state ("Use default (On)") — that label has to read the same
 *  vocabulary the turn resolves against, never a client re-spelling of it. */
export function userMacroToggleDefaultsOn(value: string): boolean {
  return isIfTruthy(value);
}

// The random-pick pool: the user's selected values filtered to the DECLARED options in options order
// (vocabulary-exact + wire-order-independent); an empty/absent/foreign-only selection falls back to ALL
// options (a pool can never be dead).
function poolOf(input: UserMacroInputDef, value: UserMacroInputValue | undefined): readonly string[] {
  const all = input.options.map((o) => o.value);
  if (!Array.isArray(value) || value.length === 0) {
    return all;
  }
  const selected = new Set(value as readonly string[]);
  const pool = all.filter((v) => selected.has(v));
  return pool.length > 0 ? pool : all;
}

// The DECLARED vocabulary of a select-family input. An input with NO declared options has an empty
// vocabulary by construction: nothing is pickable, so every pick is foreign (the picks pane renders its
// controls from `options`, and there is no free-text input kind).
function declaredValues(input: UserMacroInputDef): ReadonlySet<string> {
  return new Set(input.options.map((o) => o.value));
}

// The non-random kinds — pure value→string per the UserMacroInputDef kind table.
//
// #1356 — the SECOND vocabulary belt (the first refuses the write at the seam that has both the values
// and the defs, `domain/chat` `setUserMacroValues`): a select value outside the input's DECLARED options
// never reaches the rendered prompt. This belt exists because a stored pick outlives its definition — an
// author renaming/deleting an option leaves the persisted bag naming a value that no longer exists — and
// because a hand-crafted write must not be able to inject arbitrary prose into the author's template.
//
// The arms differ from `poolOf`'s ON PURPOSE, twice over:
//  • ORDER — `poolOf` re-orders the survivors into OPTIONS order (a draw is order-blind, so the pool is
//    normalised for determinism); a multi-select JOIN is author-visible, so the survivors keep the
//    caller's PICK order and a valid selection renders byte-identically to before this belt.
//  • THE EMPTY CASE — `poolOf` falls back to ALL options because a pool can never be dead (there must be
//    something to draw). A static select has no such constraint, so the symmetric reading is the ladder
//    it already uses for "unpicked": a selection that survives no filtering is UNPICKED.
function resolveStaticInput(input: UserMacroInputDef, value: UserMacroInputValue | undefined): string {
  if (input.kind === "single-select") {
    if (typeof value === "string" && value.length > 0 && declaredValues(input).has(value)) {
      return value;
    }
    return input.defaultValue.length > 0 ? input.defaultValue : (input.options[0]?.value ?? "");
  }
  if (input.kind === "boolean-toggle") {
    const on = typeof value === "boolean" ? value : userMacroToggleDefaultsOn(input.defaultValue);
    return on ? input.onValue : input.offValue;
  }
  return Array.isArray(value) ? resolveMultiSelect(input, value as readonly string[]) : input.defaultValue;
}

// multi-select's arm: an explicit [] is a real "none" pick (renders empty); a non-empty selection is
// filtered to the declared options in PICK order; a wholly-foreign selection is unpicked ⇒ the
// author-joined defaultValue, as an absent/mistyped value already is.
function resolveMultiSelect(input: UserMacroInputDef, picks: readonly string[]): string {
  if (picks.length === 0) {
    return "";
  }
  const declared = declaredValues(input);
  const kept = picks.filter((v) => declared.has(v));
  return kept.length > 0 ? kept.join(input.separator) : input.defaultValue;
}

/** One select-family pick that names a value the input does not declare (#1356). `options` carries the
 *  declared vocabulary so the refusal can SAY what was allowed instead of just "invalid". */
export interface OffVocabularyPick {
  readonly input: string;
  readonly value: string;
  readonly options: readonly string[];
}

/** Every off-vocabulary select pick in one macro's values bag — the pure half of the WRITE-side belt
 *  (#1356): the server refuses a `setUserMacroValues` flush that carries one, naming the field and its
 *  declared options. Deliberately narrow: only `single-select`/`multi-select` values are vocabulary-bound
 *  (a `random-pick` POOL is already normalised by {@link poolOf}, and a boolean has no vocabulary), and a
 *  bag entry naming an input the def does not declare is IGNORED rather than refused — the picks pane
 *  rebuilds the whole bag, so an entry orphaned by a def edit is a benign race, not an attack. */
export function findOffVocabularyPicks(inputs: readonly UserMacroInputDef[], bag: UserMacroInputValueBag): readonly OffVocabularyPick[] {
  const found: OffVocabularyPick[] = [];
  for (const input of inputs) {
    if (input.kind !== "single-select" && input.kind !== "multi-select") {
      continue;
    }
    const declared = declaredValues(input);
    const options = input.options.map((o) => o.value);
    for (const pick of selectPicksOf(bag[input.name])) {
      if (!declared.has(pick)) {
        found.push({ input: input.name, value: pick, options });
      }
    }
  }
  return found;
}

// The values a select-family entry CLAIMS to have picked. An EMPTY single-select string is "unset" (the
// resolution ladder's own reading), never a bad value; a mistyped leaf carries no claim at all.
function selectPicksOf(value: UserMacroInputValue | undefined): readonly string[] {
  if (typeof value === "string") {
    return value.length > 0 ? [value] : [];
  }
  return Array.isArray(value) ? (value as readonly string[]) : [];
}

// One random-pick input: frozen replay wins; else draw from the pool and report the fresh draw.
function resolveRandomPick(
  input: UserMacroInputDef,
  value: UserMacroInputValue | undefined,
  opts: ResolveUserMacroInputsOptions,
  draws: Record<string, string>,
): string {
  const frozen = opts.frozenDraws?.[input.name];
  if (frozen !== undefined) {
    return frozen;
  }
  const pool = poolOf(input, value);
  if (pool.length === 0) {
    return ""; // an option-less input — nothing to draw from
  }
  // `opts.prng` is caller-supplied and untrusted — the draw rides the ONE normalising seam (#1359,
  // ./prng.ts). Pre-guard, an out-of-range draw indexed past the pool and the `?? ""` below bound the
  // macro to the empty string AND recorded "" as the frozen draw, so a silently deleted option then
  // REPLAYED on every swipe of that turn.
  const drawn = pool[Math.floor(unitDraw(opts.prng) * pool.length)] ?? "";
  draws[input.name] = drawn;
  return drawn;
}

/** Resolve one macro's typed inputs against the per-turn per-user VALUES bag (#24) — pure; every draw
 *  rides `opts.prng`; frozen draws replay byte-exact and fresh draws are reported for freezing. */
export function resolveUserMacroInputs(
  inputs: readonly UserMacroInputDef[],
  bag: UserMacroInputValueBag,
  opts: ResolveUserMacroInputsOptions,
): ResolvedUserMacroInputs {
  const bindings: Record<string, string> = {};
  const draws: Record<string, string> = {};
  for (const input of inputs) {
    bindings[input.name] = input.kind === "random-pick" ? resolveRandomPick(input, bag[input.name], opts, draws) : resolveStaticInput(input, bag[input.name]);
  }
  return { bindings, draws };
}

// ── registration ─────────────────────────────────────────────────────────────────────────────────

export interface RegisterUserMacrosOptions {
  /** Source attribution — stamped onto each macro's metadata for the browser. */
  readonly source: MacroSourceRef;
  /** Pre-resolved input bindings keyed by MACRO name then INPUT name (`resolveUserMacroInputs` output —
   *  the server threading resolves once per turn with the frozen draws). A macro/input with no entry
   *  falls back to a per-render default resolution drawing from `ctx.random` (preview posture). */
  readonly inputBindings?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
}

export interface RejectedUserMacro {
  readonly name: string;
  readonly reason: string;
}

export interface UserMacroRegistration {
  readonly registered: readonly string[];
  /** Refused definitions — the boot/config-error posture: a name may NEVER shadow a builtin
   *  (or an earlier registration); the surface that owns the defs renders these as authoring errors. */
  readonly rejected: readonly RejectedUserMacro[];
}

// Splice one binding into the template: `{{ name }}` (whitespace-tolerant, case-insensitive — the
// registry's lookup posture) → the NEUTRALIZED value. Names are MACRO_NAME_RE-shaped ([a-zA-Z][\w-]*),
// so no regex metachar escaping is needed.
function splice(template: string, name: string, value: string): string {
  return template.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi"), neutralizeMacros(value));
}

// A delivered arg may still carry raw macro bytes (the `?` DELAYED flag hands the handler raw args) —
// resolve them through ctx.resolve (same budget/PRNG/op-log ⇒ document-order draws survive the
// deferral) BEFORE the neutralizing splice, so lazy delivery composes instead of degrading.
function resolveDelivered(value: string, ctx: MacroContext): string {
  return value.includes("{{") ? ctx.resolve(value) : value;
}

/** The reserved binding name a scoped-block BODY lands under (`{{myMacro}}…{{/myMacro}}` → the body
 *  is the last delivered arg, referenced as `{{content}}` in the template). A declared arg/input named
 *  `content` is overridden by a delivered body (delivery order: inputs → args → body; later wins). */
export const USER_MACRO_CONTENT_BINDING = "content";

// The input half of the template splice: the threaded per-turn bindings win; an unthreaded input
// resolves its DEFAULTS per render (random-pick then draws from ctx.random — the {{pick}} preview
// posture; injected PRNG ⇒ still deterministic).
function spliceInputs(
  template: string,
  def: UserMacroDef,
  provided: Readonly<Record<string, string>> | undefined,
  ctx: MacroContext,
  shadowed: ReadonlySet<string>,
): string {
  const activeInputs = def.inputs.filter((input) => !shadowed.has(input.name.toLowerCase()));
  if (activeInputs.length === 0) {
    return template;
  }
  const fallback = provided === undefined ? resolveUserMacroInputs(activeInputs, {}, { prng: ctx.random ?? Math.random }).bindings : undefined;
  let out = template;
  for (const input of activeInputs) {
    out = splice(out, input.name, provided?.[input.name] ?? fallback?.[input.name] ?? "");
  }
  return out;
}

// Build one user macro's handler: bindings (inputs → args → block body) spliced neutralized into the
// template, then the template resolves through ctx.resolve (budget/PRNG/op-log threaded).
function userMacroHandler(def: UserMacroDef, opts: RegisterUserMacrosOptions): MacroHandler {
  const provided = opts.inputBindings?.[def.name];
  return (args, ctx) => {
    const body = args[def.args.length];
    const shadowedInputs = new Set(def.args.map((arg) => arg.name.toLowerCase()));
    if (body !== undefined) {
      shadowedInputs.add(USER_MACRO_CONTENT_BINDING);
    }
    let template = spliceInputs(def.body, def, provided, ctx, shadowedInputs);
    // Declared args bind by NAME (the evaluator already padded declared defaults via applyArgDefaults).
    for (const [i, argDef] of def.args.entries()) {
      if (argDef.name.toLowerCase() === USER_MACRO_CONTENT_BINDING && body !== undefined) {
        continue;
      }
      template = splice(template, argDef.name, resolveDelivered(args[i] ?? "", ctx));
    }
    // A scoped-block body arrives as the first arg PAST the declared set → `{{content}}`.
    if (body !== undefined) {
      template = splice(template, USER_MACRO_CONTENT_BINDING, resolveDelivered(body, ctx));
    }
    return ctx.resolve(template);
  };
}

// ── volatility + cache-dependency derivation ─────────────────────────────────────────────────────

function templateUsesBinding(template: string, name: string): boolean {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "i").test(template);
}

function spliceAnalysisBinding(template: string, name: string, value: string): string {
  return template.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi"), value);
}

function analysisBindingValue(value: string): string {
  return value.includes("{{") ? macroAnalysisBinding(value) : value;
}

function expandUserMacroForAnalysis(def: UserMacroDef, args: readonly string[], blockContent?: string): string {
  const content = blockContent === undefined ? args[def.args.length] : blockContent;
  const shadowedInputs = new Set(def.args.map((arg) => arg.name.toLowerCase()));
  if (content !== undefined) {
    shadowedInputs.add(USER_MACRO_CONTENT_BINDING);
  }
  let template = def.body;
  for (const input of def.inputs) {
    if (!shadowedInputs.has(input.name.toLowerCase())) {
      template = spliceAnalysisBinding(template, input.name, macroAnalysisInputBinding(input.kind === "random-pick"));
    }
  }
  for (const [index, arg] of def.args.entries()) {
    if (arg.name.toLowerCase() !== USER_MACRO_CONTENT_BINDING || content === undefined) {
      template = spliceAnalysisBinding(template, arg.name, analysisBindingValue(args[index] ?? ""));
    }
  }
  return content === undefined ? template : spliceAnalysisBinding(template, USER_MACRO_CONTENT_BINDING, analysisBindingValue(content));
}

function userMacroAnalysis(def: UserMacroDef, facts: UserMacroDerivedFacts): MacroAnalysisOptions {
  return {
    // The expanded template below owns byte contribution; argument evaluation owns side effects only.
    arguments: "none",
    blockArguments: "none",
    // userMacroHandler resolves every declared arg before splice, including a binding absent from body.
    lazyArguments: [...def.args.map((_arg, index) => index), def.args.length],
    blockLazyArguments: def.args.flatMap((arg, index) => (arg.name.toLowerCase() === USER_MACRO_CONTENT_BINDING ? [] : [index])),
    blockBody: "none",
    expand: (args, blockContent) => expandUserMacroForAnalysis(def, args, blockContent),
    cacheDependent: facts.cacheDependent,
    blockCacheDependent: facts.blockCacheDependent,
    volatileDependent: facts.volatile,
    blockVolatileDependent: facts.blockVolatile,
  };
}

function symbolicBody(def: UserMacroDef): string {
  let body = def.body;
  for (const binding of [...def.args, ...def.inputs, { name: USER_MACRO_CONTENT_BINDING }]) {
    body = spliceAnalysisBinding(body, binding.name, "{{noop}}");
  }
  return body;
}

interface UserMacroDerivedFacts {
  readonly cacheDependent: boolean;
  readonly blockCacheDependent: boolean;
  readonly volatile: boolean;
  readonly blockVolatile: boolean;
  readonly metadataVolatile: boolean;
}

const STATIC_USER_MACRO_FACTS: UserMacroDerivedFacts = {
  cacheDependent: false,
  blockCacheDependent: false,
  volatile: false,
  blockVolatile: false,
  metadataVolatile: false,
};

function userMacroMetadata(def: UserMacroDef, source: MacroSourceRef): MacroMetadataInput {
  return {
    name: def.name,
    description: def.description,
    category: "user",
    args: def.args,
    returnType: "string",
    aliases: [],
    variadic: false,
    ...(def.strict ? { strict: true } : {}),
    source,
  };
}

// Register temporary inert handlers so the canonical analyzer can follow user→user calls with the same
// registry lookup and case-folding as runtime. Re-registering the real handlers below replaces these
// synchronously; no caller can observe the intermediate registry.
function deriveUserMacroFacts(defs: readonly UserMacroDef[], registry: MacroRegistry, source: MacroSourceRef): ReadonlyMap<string, UserMacroDerivedFacts> {
  const facts = new Map<string, UserMacroDerivedFacts>();
  for (const def of defs) {
    const direct = { ...STATIC_USER_MACRO_FACTS };
    facts.set(def.name.toLowerCase(), direct);
    registry.register(def.name, () => "", {
      analysis: userMacroAnalysis(def, direct),
      blockContentAfterDeclaredArgs: true,
      metadata: userMacroMetadata(def, source),
    });
  }
  for (const def of defs) {
    const direct = facts.get(def.name.toLowerCase()) ?? STATIC_USER_MACRO_FACTS;
    facts.set(def.name.toLowerCase(), {
      ...direct,
      metadataVolatile:
        direct.volatile || direct.blockVolatile || macroTextIsVolatile(symbolicBody(def), registry) || macroTextIsVolatile(`{{${def.name}}}`, registry),
    });
  }
  return facts;
}

/** Register preset/game-authored macros onto `registry` (a PER-RENDER composition the caller builds —
 *  never the process-wide singleton). A name colliding with an EXISTING registration (builtin or an
 *  earlier def — first wins) or failing MACRO_NAME_RE is REFUSED, never silently shadowed.
 *  Each accepted macro gets full DX metadata (category `user`, its declared args, `source`, `strict`)
 *  plus evaluator-derived volatile and cache-dependency facts. */
export function registerUserMacros(registry: MacroRegistry, defs: readonly UserMacroDef[], opts: RegisterUserMacrosOptions): UserMacroRegistration {
  const registered: string[] = [];
  const rejected: RejectedUserMacro[] = [];
  const accepted: UserMacroDef[] = [];
  const claimed = new Set(registry.names());
  for (const def of defs) {
    if (!MACRO_NAME_RE.test(def.name)) {
      rejected.push({ name: def.name, reason: "invalid macro name — must start with a letter and use only letters, digits, _ or -" });
      continue;
    }
    const key = def.name.toLowerCase();
    if (claimed.has(key)) {
      rejected.push({ name: def.name, reason: "name collides with an existing macro — user macros never shadow" });
      continue;
    }
    claimed.add(key);
    accepted.push(def);
  }
  const facts = deriveUserMacroFacts(accepted, registry, opts.source);
  for (const def of accepted) {
    const derived = facts.get(def.name.toLowerCase()) ?? STATIC_USER_MACRO_FACTS;
    registry.register(def.name, userMacroHandler(def, opts), {
      analysis: userMacroAnalysis(def, derived),
      ...(derived.metadataVolatile ? { volatile: true } : {}),
      blockContentAfterDeclaredArgs: true,
      metadata: userMacroMetadata(def, opts.source),
    });
    registered.push(def.name);
  }
  return { registered, rejected };
}
