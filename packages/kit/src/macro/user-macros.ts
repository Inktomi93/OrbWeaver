// kit/macro/user-macros — WAVE MU (M5, parity-plus §12A.5 + the #24 typed-input fold): preset/game-
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

import { neutralizeMacros } from "./content.ts";
import { isIfTruthy } from "./metadata.ts";
import { MACRO_NAME_RE, parseMacros } from "./parser.ts";
import type { MacroArgDef, MacroContext, MacroHandler, MacroRegistry, MacroSourceRef } from "./types.ts";

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
 *   single-select  — the pick (a string) or `defaultValue` (else the first option's value).
 *   boolean-toggle — a boolean pick renders `onValue`/`offValue`; unpicked ⇒ `defaultValue` truthiness
 *                    (the `{{if}}` vocabulary) decides.
 *   multi-select   — the picks (a string[]) joined by `separator` in pick order; unpicked ⇒
 *                    `defaultValue` verbatim (an author-joined string).
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

// The non-random kinds — pure value→string per the UserMacroInputDef kind table.
function resolveStaticInput(input: UserMacroInputDef, value: UserMacroInputValue | undefined): string {
  if (input.kind === "single-select") {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    return input.defaultValue.length > 0 ? input.defaultValue : (input.options[0]?.value ?? "");
  }
  if (input.kind === "boolean-toggle") {
    const on = typeof value === "boolean" ? value : userMacroToggleDefaultsOn(input.defaultValue);
    return on ? input.onValue : input.offValue;
  }
  // multi-select: an explicit [] is a real "none" pick (renders empty); absent/mistyped ⇒ the
  // author-joined defaultValue verbatim.
  if (Array.isArray(value)) {
    return (value as readonly string[]).join(input.separator);
  }
  return input.defaultValue;
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
  const drawn = pool[Math.floor(opts.prng() * pool.length)] ?? "";
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
  /** Source attribution (§12A.5) — stamped onto each macro's metadata for the browser. */
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
  /** Refused definitions — the boot/config-error posture (§12A.5): a name may NEVER shadow a builtin
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
function spliceInputs(template: string, def: UserMacroDef, provided: Readonly<Record<string, string>> | undefined, ctx: MacroContext): string {
  if (def.inputs.length === 0) {
    return template;
  }
  const fallback = provided === undefined ? resolveUserMacroInputs(def.inputs, {}, { prng: ctx.random ?? Math.random }).bindings : undefined;
  let out = template;
  for (const input of def.inputs) {
    out = splice(out, input.name, provided?.[input.name] ?? fallback?.[input.name] ?? "");
  }
  return out;
}

// Build one user macro's handler: bindings (inputs → args → block body) spliced neutralized into the
// template, then the template resolves through ctx.resolve (budget/PRNG/op-log threaded).
function userMacroHandler(def: UserMacroDef, opts: RegisterUserMacrosOptions): MacroHandler {
  const provided = opts.inputBindings?.[def.name];
  return (args, ctx) => {
    let template = spliceInputs(def.body, def, provided, ctx);
    // Declared args bind by NAME (the evaluator already padded declared defaults via applyArgDefaults).
    for (const [i, argDef] of def.args.entries()) {
      template = splice(template, argDef.name, resolveDelivered(args[i] ?? "", ctx));
    }
    // A scoped-block body arrives as the first arg PAST the declared set → `{{content}}`.
    const body = args[def.args.length];
    if (body !== undefined) {
      template = splice(template, USER_MACRO_CONTENT_BINDING, resolveDelivered(body, ctx));
    }
    return ctx.resolve(template);
  };
}

// ── volatility derivation (D51 cache honesty) ────────────────────────────────────────────────────

// Every macro name a template references, recursively through nested args/bodies — the volatility scan.
function referencedNames(text: string, into: Set<string>): void {
  for (const node of parseMacros(text)) {
    if (node.type !== "text") {
      collectNodeNames(node, into);
    }
  }
}

function collectNodeNames(node: { name: string; args: string[]; raw?: string; children?: readonly unknown[] }, into: Set<string>): void {
  into.add(node.name.toLowerCase());
  for (const arg of node.args) {
    if (arg.includes("{{")) {
      referencedNames(arg, into);
    }
  }
  // Block children are already AST — only the NAME set matters, so re-scan via raw bytes (present on
  // parser output) or a minimal reconstruction.
  for (const child of node.children ?? []) {
    const c = child as { type: string; name?: string; args?: string[]; raw?: string };
    if (c.type !== "text" && c.name !== undefined) {
      referencedNames(c.raw ?? `{{${c.name}::${(c.args ?? []).join("::")}}}`, into);
    }
  }
}

// Volatile honesty (the cache-buster scan, D51): a user macro is volatile when it has a random-pick
// input (a per-turn draw) or its body reaches ANY volatile name — through the base registry or another
// user macro (fixpoint over the set, bounded by defs.length passes).
function computeVolatility(defs: readonly UserMacroDef[], base: MacroRegistry): Map<string, boolean> {
  const refs = new Map<string, Set<string>>();
  const volatile = new Map<string, boolean>();
  for (const def of defs) {
    const key = def.name.toLowerCase();
    const names = new Set<string>();
    referencedNames(def.body, names);
    refs.set(key, names);
    volatile.set(key, def.inputs.some((i) => i.kind === "random-pick") || [...names].some((name) => base.getOptions(name)?.volatile === true));
  }
  // Propagate through user→user references until stable (≤ defs.length passes by construction).
  let passes = defs.length;
  while (passes > 0 && propagateVolatility(defs, refs, volatile)) {
    passes -= 1;
  }
  return volatile;
}

function propagateVolatility(defs: readonly UserMacroDef[], refs: Map<string, Set<string>>, volatile: Map<string, boolean>): boolean {
  let changed = false;
  for (const def of defs) {
    const key = def.name.toLowerCase();
    if (volatile.get(key) !== true && [...(refs.get(key) ?? [])].some((name) => volatile.get(name) === true)) {
      volatile.set(key, true);
      changed = true;
    }
  }
  return changed;
}

/** Register preset/game-authored macros onto `registry` (a PER-RENDER composition the caller builds —
 *  never the process-wide singleton). A name colliding with an EXISTING registration (builtin or an
 *  earlier def — first wins) or failing MACRO_NAME_RE is REFUSED, never silently shadowed (§12A.5).
 *  Each accepted macro gets full DX metadata (category `user`, its declared args, `source`, `strict`)
 *  and a DERIVED volatile flag (random-pick input or a body reaching a volatile name). */
export function registerUserMacros(registry: MacroRegistry, defs: readonly UserMacroDef[], opts: RegisterUserMacrosOptions): UserMacroRegistration {
  const registered: string[] = [];
  const rejected: RejectedUserMacro[] = [];
  const volatility = computeVolatility(defs, registry);
  for (const def of defs) {
    if (!MACRO_NAME_RE.test(def.name)) {
      rejected.push({ name: def.name, reason: "invalid macro name — must start with a letter and use only letters, digits, _ or -" });
      continue;
    }
    if (registry.get(def.name) !== undefined) {
      rejected.push({ name: def.name, reason: "name collides with an existing macro — user macros never shadow" });
      continue;
    }
    registry.register(def.name, userMacroHandler(def, opts), {
      volatile: volatility.get(def.name.toLowerCase()) === true,
      metadata: {
        name: def.name,
        description: def.description,
        category: "user",
        args: def.args,
        returnType: "string",
        aliases: [],
        variadic: false,
        ...(def.strict ? { strict: true } : {}),
        source: opts.source,
      },
    });
    registered.push(def.name);
  }
  return { registered, rejected };
}
