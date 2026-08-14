import { DateTime } from "luxon";
import type { CelValue } from "#cel";
import { evalCel, isCelParseError, parseCel } from "#cel";
import { BUILTIN_MACRO_METADATA } from "./builtin-metadata.ts";
import { isIfTruthy } from "./metadata.ts";
import type { MacroAST, MacroContext, MacroHandler, MacroMetadata, MacroMetadataInput, MacroRegisterOptions, MacroRegistry, VarOp } from "./types.ts";
import { applyVarOp } from "./variables.ts";

const DECIMAL_RADIX = 10;
const RANDOM_DEFAULT_CEIL = 101; // bare {{random}} rolls 0..100 inclusive
const RANGE_ARG_COUNT = 2;
const ROLL_MAX = 10_000; // caps dice count/sides so a hostile card can't block the loop
const MIN_QUOTED_LEN = 2;

const BARE_IDENT = /^[\w.-]+$/;
const COMPARATOR = /^(.+?)\s*(==|!=)\s*(.+)$/;
const DICE_SPEC = /^(\d*)d(\d+)$/;
const PLAIN_INT = /^\d+$/;

// Honors a per-request IANA `ctx.timezone` (the browser's); an absent/invalid zone falls back to
// server-local (Luxon's default zone, respects container `TZ`).
function nowInZone(ctx: MacroContext): DateTime {
  // `ctx.nowMs` pins the clock when supplied — the single source of "now" (deterministic freeze).
  const base = ctx.nowMs !== undefined ? DateTime.fromMillis(ctx.nowMs) : DateTime.now();
  if (ctx.timezone !== undefined && ctx.timezone !== "") {
    const zoned = base.setZone(ctx.timezone);
    if (zoned.isValid) {
      return zoned;
    }
    ctx.onWarn?.(`macro: invalid timezone "${ctx.timezone}" — falling back to server-local`);
  }
  return base;
}

export class SimpleMacroRegistry implements MacroRegistry {
  private handlers = new Map<string, MacroHandler>();
  private options = new Map<string, MacroRegisterOptions>();
  // The AUTHORED DX metadata (no `volatile` — composed on read from the `volatile` option, D51). Fed by
  // register()'s `options.metadata` (extensions) and setMetadata() (the builtin backfill).
  private metadata = new Map<string, MacroMetadataInput>();

  register(name: string, handler: MacroHandler, options?: MacroRegisterOptions): void {
    const key = name.toLowerCase();
    this.handlers.set(key, handler);
    if (options) {
      this.options.set(key, options);
      if (options.metadata) {
        this.metadata.set(key, options.metadata);
      }
    }
  }

  /** Attach authored DX metadata out-of-band — the builtin backfill path (createDefaultRegistry loops
   *  BUILTIN_MACRO_METADATA through here, keeping the 55 register() calls churn-free). */
  setMetadata(name: string, input: MacroMetadataInput): void {
    this.metadata.set(name.toLowerCase(), input);
  }

  getMetadata(name: string): MacroMetadata | undefined {
    const input = this.metadata.get(name.toLowerCase());
    if (input === undefined) {
      return;
    }
    // Compose `volatile` from the ONE volatile home (the registration's option) — never a second list.
    return { ...input, volatile: this.getOptions(name)?.volatile === true };
  }

  allMetadata(): readonly MacroMetadata[] {
    const out: MacroMetadata[] = [];
    for (const key of this.metadata.keys()) {
      const composed = this.getMetadata(key);
      if (composed !== undefined) {
        out.push(composed);
      }
    }
    return out;
  }

  get(name: string): MacroHandler | undefined {
    return this.handlers.get(name.toLowerCase());
  }

  getOptions(name: string): MacroRegisterOptions | undefined {
    return this.options.get(name.toLowerCase());
  }

  volatileNames(): string[] {
    const out: string[] = [];
    for (const [name, opts] of this.options) {
      if (opts.volatile === true) {
        out.push(name);
      }
    }
    return out;
  }

  names(): string[] {
    return [...this.handlers.keys()];
  }

  requirementsOf(name: string): "chat" | "char" | undefined {
    return this.options.get(name.toLowerCase())?.requires;
  }
}

// Imported cards use straight (") and typographic (curly) quote pairs interchangeably; accept both.
function unquote(value: string): string {
  const v = value.trim();
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];
  for (const [open, close] of pairs) {
    if (v.startsWith(open) && v.endsWith(close) && v.length >= MIN_QUOTED_LEN) {
      return v.slice(open.length, v.length - close.length);
    }
  }
  return v;
}

// Falls back to env so user-defined vars work the same as built-ins.
function readContextValue(name: string, ctx: MacroContext): unknown {
  switch (name) {
    case "char":
      return ctx.char;
    case "user":
      return ctx.user;
    case "persona":
      return ctx.persona;
    case "scenario":
      return ctx.scenario;
    case "description":
      return ctx.description;
    case "personality":
      return ctx.personality;
    case "appearance":
      return ctx.appearance;
    case "backstory":
      return ctx.backstory;
    case "model":
      return ctx.model;
    case "chatId":
      return ctx.chatId;
    case "input":
      return ctx.input;
    case "lastMessage":
      return ctx.lastMessage;
    case "lastUserMessage":
      return ctx.lastUserMessage;
    case "lastCharMessage":
      return ctx.lastCharMessage;
    default:
      return ctx.env[name];
  }
}

// A bare identifier (no `{{`) looks up in the macro context; anything containing `{{` is a
// sub-macro and gets evaluated first.
function resolvePredicateValue(rawToken: string, ctx: MacroContext): string {
  const trimmed = rawToken.trim();
  if (trimmed.includes("{{")) {
    return ctx.evaluateString(trimmed);
  }
  if (BARE_IDENT.test(trimmed)) {
    const looked = readContextValue(trimmed, ctx);
    return looked === undefined ? "" : String(looked);
  }
  return unquote(trimmed);
}

// Split a block's children at the first top-level {{else}} marker (case-insensitive — a
// case-sensitive compare silently rendered BOTH branches since the marker itself resolves to "").
function splitOnElse(children: MacroAST): [MacroAST, MacroAST] {
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    if (node?.type === "macro" && node.name.toLowerCase() === "else") {
      return [children.slice(0, i), children.slice(i + 1)];
    }
  }
  return [children, []];
}

// Three predicate shapes: {{if NAME}}, {{if NAME == "X"}}, {{if NAME != "X"}}; optional {{else}}.
// (`::`-form args ({{if::NAME}}) rejoin to the same predicate string.)
const ifHandler: MacroHandler = (args, ctx, children) => {
  // Reassemble the raw predicate: the parser's whitespace splitter turns `{{if NAME == "X"}}`
  // into ["NAME", "==", "\"X\""]; reading only args[0] would degrade to a truthy check on NAME.
  const rawArg = args.join(" ").trim();
  if (!rawArg) {
    return "";
  }

  // Comparator first — the LHS gets identifier-or-sub-macro treatment, the RHS gets unquoted.
  const cmpMatch = rawArg.match(COMPARATOR);
  let pass = false;
  if (cmpMatch) {
    const lhsRaw = (cmpMatch[1] ?? "").trim();
    const op = cmpMatch[2] ?? "==";
    const rhsRaw = (cmpMatch[3] ?? "").trim();
    const lhs = resolvePredicateValue(lhsRaw, ctx);
    const rhs = rhsRaw.includes("{{") ? ctx.evaluateString(unquote(rhsRaw)) : unquote(rhsRaw);
    pass = op === "==" ? lhs === rhs : lhs !== rhs;
  } else {
    const value = resolvePredicateValue(rawArg, ctx);
    pass = isIfTruthy(value);
  }

  if (!children) {
    return "";
  }
  const [thenBranch, elseBranch] = splitOnElse(children);
  return ctx.evaluateAST(pass ? thenBranch : elseBranch);
};

// {{random}} → 0..100; {{random::X::Y}} → integer in [X,Y]; {{random::A::B::C}} → pick one option.
const randomHandler: MacroHandler = (args, ctx) => {
  const random = ctx.random ?? Math.random;
  if (args.length === 0) {
    return String(Math.floor(random() * RANDOM_DEFAULT_CEIL));
  }
  if (args.length === RANGE_ARG_COUNT) {
    // Both args must be integers — `parseInt` silently truncates "1.5" → 1, so use Number()+isInteger.
    const min = Number(args[0] ?? "");
    const max = Number(args[1] ?? "");
    if (Number.isInteger(min) && Number.isInteger(max)) {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return String(Math.floor(random() * (hi - lo + 1)) + lo);
    }
  }
  const idx = Math.floor(random() * args.length);
  return args[idx] ?? "";
};

// The "NdM" branch of {{roll}}, split out so the handler itself stays under the complexity cap.
function rollDice(dice: RegExpMatchArray, random: () => number): string {
  const count = dice[1] !== undefined && dice[1] !== "" ? Number.parseInt(dice[1], DECIMAL_RADIX) : 1;
  const sides = Number.parseInt(dice[2] ?? "", DECIMAL_RADIX);
  if (count < 1 || sides < 1 || count > ROLL_MAX || sides > ROLL_MAX) {
    return "";
  }
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.floor(random() * sides) + 1;
  }
  return String(total);
}

// {{roll::NdM}} (sum of N M-sided dice) or {{roll::N}} (1..N). Empty/invalid → "".
const rollHandler: MacroHandler = (args, ctx) => {
  const random = ctx.random ?? Math.random;
  const spec = args[0]?.trim().toLowerCase();
  if (spec === undefined || spec === "") {
    return "";
  }
  const dice = spec.match(DICE_SPEC);
  if (dice) {
    return rollDice(dice, random);
  }
  if (PLAIN_INT.test(spec)) {
    const n = Number.parseInt(spec, DECIMAL_RADIX);
    if (n < 1 || n > ROLL_MAX) {
      return "";
    }
    return String(Math.floor(random() * n) + 1);
  }
  return "";
};

// {{pick::A::B::C}} — option-pick under the injected PRNG (distinct from {{random}}, no numeric-range mode).
const pickHandler: MacroHandler = (args, ctx) => {
  if (args.length === 0) {
    return "";
  }
  const random = ctx.random ?? Math.random;
  const index = Math.floor(random() * args.length);
  return args[index] ?? "";
};

// {{expr::<cel>}} result coercion (02 §3): string ← string; number/bool → their text; null → "";
// list/map → JSON (so a structured result round-trips into {{setvar}}).
function coerceExprResult(value: CelValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null) {
    return "";
  }
  // number → its text ("5"); list/map → JSON. JSON.stringify handles both (5 → "5", [1,2] → "[1,2]")
  // and sidesteps a raw String()/template on the union member with a default [object Object] toString.
  return JSON.stringify(value);
}

// Push an expr-error diagnostic at the {{expr}} call's span (set by the evaluator on ctx.__currentSpan).
// Sink-only — no span or no sink ⇒ nothing recorded (the render still degrades to "").
function pushExprError(ctx: MacroContext, message: string): void {
  if (ctx.diagnostics !== undefined && ctx.__currentSpan !== undefined) {
    ctx.diagnostics.push({ severity: "error", code: "expr-error", message, span: ctx.__currentSpan });
  }
}

// {{expr::<cel-source>}} — evaluate raw CEL over ctx.celBindings (the §1 env minus `event`, 02 §3). The
// arg splitter breaks the body on `::`, so rejoin (CEL bodies rarely contain `::`, but a defensive
// rejoin is byte-safe). A parse or eval error renders "" + a diagnostic — macros never throw into
// assembly (the render-once pipeline can't take a per-macro abort). Volatile: the result depends on the
// runtime env (vars/now), so a static-half occurrence must bust the cached prefix.
const exprHandler: MacroHandler = (args, ctx) => {
  const source = args.join("::");
  const parsed = parseCel(source);
  if (isCelParseError(parsed)) {
    pushExprError(ctx, parsed.message);
    return "";
  }
  try {
    return coerceExprResult(evalCel(parsed, ctx.celBindings ?? {}));
  } catch (err) {
    pushExprError(ctx, err instanceof Error ? err.message : String(err));
    return "";
  }
};

// {{datetimeformat::FORMAT}} — Luxon format string (e.g. "yyyy-MM-dd HH:mm"). Empty arg → ISO.
const dateTimeFormat: MacroHandler = (args, ctx) => {
  const fmt = args[0]?.trim();
  if (fmt === undefined || fmt === "") {
    return nowInZone(ctx).toISO() ?? "";
  }
  return nowInZone(ctx).toFormat(fmt);
};

// Storage is ctx.env. Mutation handlers write IN-PLACE — visible to a later `getvar` in the same turn.
const readVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  return String(ctx.env[key] ?? "");
};

// {{setvar::name::value}} — write `value` to ctx.env[name], render "". Records the op on ctx.opLog.
const setVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  const op: VarOp = { op: "set", key, value: args[1] ?? "" };
  applyVarOp(ctx.env, op);
  ctx.opLog?.push(op);
  return "";
};

// {{addvar::name::value}} — append `value` to ctx.env[name] (string concat).
const addVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  const op: VarOp = { op: "add", key, value: args[1] ?? "" };
  applyVarOp(ctx.env, op);
  ctx.opLog?.push(op);
  return "";
};

// {{incvar::name}} — parse-or-zero +1 on the stored string. Returns the result so it can be
// embedded inline as a counter.
const incVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  const op: VarOp = { op: "inc", key };
  applyVarOp(ctx.env, op);
  ctx.opLog?.push(op);
  return String(ctx.env[key] ?? "");
};

// {{decvar::name}} — parse-or-zero −1 on the stored string.
const decVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  const op: VarOp = { op: "dec", key };
  applyVarOp(ctx.env, op);
  ctx.opLog?.push(op);
  return String(ctx.env[key] ?? "");
};

// {{hasvar::name}} — "true" / "" so it composes with `{{if hasvar::flag}}`. Semantics: "exists" is
// membership, NOT non-empty — `{{setvar::flag::}}` then `{{hasvar::flag}}` returns "true".
const hasVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  return Object.hasOwn(ctx.env, key) ? "true" : "";
};

// {{deletevar::name}} — drop the key entirely (different from setvar::name:: → empty string).
const deleteVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  const op: VarOp = { op: "delete", key };
  applyVarOp(ctx.env, op);
  ctx.opLog?.push(op);
  return "";
};

// {{getglobalvar::key}} — read from the author's staged per-user global plane (02 §4). Missing key → "".
// SEPARATE from ctx.env: globals are cross-chat single-owned state, never variant-scoped.
const getGlobalVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  return ctx.globalVars?.[key] ?? "";
};

// {{setglobalvar::key::value}} — collect a write onto ctx.globalVarWrites (drained + upserted at turn
// commit, last-write-wins) and reflect it into the read cache so a later same-render {{getglobalvar}}
// sees it. Renders "". A swipe never rewinds a global (D46 — NOT variant-scoped).
const setGlobalVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (key === undefined || key === "") {
    return "";
  }
  const value = args[1] ?? "";
  ctx.globalVarWrites?.push({ key, value });
  if (ctx.globalVars !== undefined) {
    ctx.globalVars[key] = value;
  }
  return "";
};

// Absent cast ⇒ the cast-of-one [char], so {{group}} == {{char}} for solo.
function castOf(ctx: MacroContext): readonly string[] {
  return ctx.cast && ctx.cast.length > 0 ? ctx.cast : [ctx.char];
}

// The ACTIVE (non-muted) cast — distinct from {{group}} (full cast, incl. muted).
function castNotMutedOf(ctx: MacroContext): readonly string[] {
  return ctx.castNotMuted && ctx.castNotMuted.length > 0 ? ctx.castNotMuted : castOf(ctx);
}

// Runs `ctx.evaluateString` on the raw field so nested macros embedded by the card author resolve.
function charField(read: (ctx: MacroContext) => string | undefined): MacroHandler {
  return (_args: string[], ctx: MacroContext): string => {
    const raw = read(ctx);
    if (raw === undefined || raw === "") {
      return "";
    }
    return raw.includes("{{") ? ctx.evaluateString(raw) : raw;
  };
}

/** The delivered-args → recorded `args` text join. `::` is the canonical arg separator the parser splits on,
 *  so the record round-trips what was written; no args ⇒ the field is omitted entirely. */
const FREEZE_ARG_SEPARATOR = "::";

/** Consume the next entry of a replayed freeze record, or `undefined` to draw fresh. Positional: the entry at
 *  the cursor must match this call's name AND args, else the record no longer describes this text and the
 *  replay is abandoned for the remainder of the pass (parking the cursor past the end) rather than
 *  mis-pairing a later occurrence's value onto this one. */
function takeFrozenMacro(ctx: MacroContext, name: string, args: string | undefined): string | undefined {
  const frozen = ctx.frozenMacros;
  if (frozen === undefined) {
    return;
  }
  const at = ctx.__freezeCursor ?? 0;
  const entry = frozen[at];
  if (entry === undefined || entry.name !== name || entry.args !== args) {
    ctx.__freezeCursor = frozen.length;
    return;
  }
  ctx.__freezeCursor = at + 1;
  return entry.value;
}

/** Wrap ONE volatile handler with the freeze ledger (D129-F): replay a prior record's value when the context
 *  carries one (the handler is skipped, so no draw is consumed), and record the effective occurrence onto the
 *  context's sink. Inert — one extra closure frame and two absent-field checks — on every context that
 *  supplies neither, which is every live render. */
function ledgerVolatile(name: string, handler: MacroHandler): MacroHandler {
  return (args, ctx, children) => {
    const argText = args.length > 0 ? args.join(FREEZE_ARG_SEPARATOR) : undefined;
    const replayed = takeFrozenMacro(ctx, name, argText);
    const value = replayed ?? handler(args, ctx, children);
    ctx.macroFreezes?.push(argText === undefined ? { name, value } : { name, args: argText, value });
    return value;
  };
}

// The NONDETERMINISTIC macros ({{random}}/{{pick}}/{{roll}} + the clock family) whose value can't be
// recovered from stored content, so they FREEZE at commit. Shared by `createDefaultRegistry` (live
// render) and `createVolatileOnlyRegistry` (the freeze pass) so the two can't drift on which names freeze.
// NOTE: var-mutation + conversation-context macros are ALSO `volatile` but deliberately excluded here —
// freezing them would execute a side-effect against an ephemeral env or bake stale context.
//
// EVERY name here registers through {@link ledgerVolatile}, so the record/replay mode is a property of THIS
// one axis (D129-F: "one engine, two modes") rather than a forked registry — a second freeze factory would
// leave the WAVE-MU per-turn freeze registry (built from `createVolatileOnlyRegistry` in
// `assembly/user-macros`) silently record-less on exactly the turns that author user macros.
function registerVolatileMacros(registry: SimpleMacroRegistry): void {
  const vol = { volatile: true } as const;
  const reg = (name: string, handler: MacroHandler): void => {
    registry.register(name, ledgerVolatile(name, handler), vol);
  };
  reg("random", randomHandler);
  reg("pick", pickHandler);
  // Locale-independent clock formats. Zone = ctx.timezone (browser) → server-local fallback. Volatile —
  // every render is a different "now" → static-half occurrences bust the cached prefix.
  reg("time", (_args, ctx) => nowInZone(ctx).toFormat("HH:mm:ss"));
  reg("date", (_args, ctx) => nowInZone(ctx).toFormat("yyyy-MM-dd"));
  reg("weekday", (_args, ctx) => nowInZone(ctx).toFormat("cccc")); // "Monday" …
  reg("isodate", (_args, ctx) => nowInZone(ctx).toISODate() ?? "");
  reg("isotime", (_args, ctx) => nowInZone(ctx).toISO() ?? "");
  reg("datetimeformat", dateTimeFormat);
  reg("roll", rollHandler);
}

/** The 8 rpg* data-fed macros (rpg-design/06 §1): `[registered lowercase name, RpgGatherMacros value key]`.
 *  The value key is the camelCase field the game turn's GATHER stages on `ctx.rpgMacros`; the registry looks up
 *  the lowercased name. Kept here (kit) as the registration list — rpg (above kit) supplies the values. */
const RPG_DATA_MACROS: readonly (readonly [name: string, key: string])[] = [
  ["rpgworld", "rpgWorld"],
  ["rpgsecrets", "rpgSecrets"],
  ["rpgcontinuity", "rpgContinuity"],
  ["rpgcast", "rpgCast"],
  ["rpgscenestate", "rpgSceneState"],
  ["rpgmap", "rpgMap"],
  ["rpgperception", "rpgPerception"],
  ["rpgmorale", "rpgMorale"],
  // parity-plus P6 (§12.2) — the lite-plane additions the gather populates from the tracker view.
  ["rpgquests", "rpgQuests"],
  ["rpgdelta", "rpgDelta"],
];

export function createDefaultRegistry(): MacroRegistry {
  const registry = new SimpleMacroRegistry();
  const vol = { volatile: true } as const;
  const volChat = { volatile: true, requires: "chat" } as const;

  registry.register("char", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("user", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("charname", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("username", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("persona", (_args, ctx) => ctx.persona, { requires: "char" });
  // `{{scenario}}` is card-author PROSE (e.g. "{{user}} keeps running into {{char}}…"), so it re-processes
  // nested macros like every other card field (`charField`) + its own `{{charscenario}}` alias below — NOT raw
  // (the gap that shipped literal `{{user}}/{{char}}` braces to the model). `{{char}}/{{user}}/{{persona}}` above
  // stay raw: they are leaf names/values, never macro-bearing prose.
  registry.register(
    "scenario",
    charField((ctx) => ctx.scenario),
    { requires: "char" },
  );
  registry.register("model", (_args, ctx) => ctx.model ?? "", { requires: "chat" });
  registry.register("chatid", (_args, ctx) => ctx.chatId ?? "", { requires: "chat" });

  registry.register("group", (_a, ctx) => castOf(ctx).join(", "), { requires: "char" });
  registry.register("charifnotgroup", (_a, ctx) => castOf(ctx).join(", "), { requires: "char" });
  registry.register("groupnotmuted", (_a, ctx) => castNotMutedOf(ctx).join(", "), {
    requires: "char",
  });
  // The cast minus the current speaker; humans not included. Empty for solo.
  registry.register(
    "notchar",
    (_a, ctx) =>
      castOf(ctx)
        .filter((n) => n !== ctx.char)
        .join(", "),
    { requires: "char" },
  );

  registry.register(
    "description",
    charField((ctx) => ctx.description),
    { requires: "char" },
  );
  registry.register(
    "chardescription",
    charField((ctx) => ctx.description),
    { requires: "char" },
  );
  registry.register(
    "personality",
    charField((ctx) => ctx.personality),
    { requires: "char" },
  );
  registry.register(
    "charpersonality",
    charField((ctx) => ctx.personality),
    { requires: "char" },
  );
  registry.register(
    "charscenario",
    charField((ctx) => ctx.scenario),
    { requires: "char" },
  );
  registry.register(
    "appearance",
    charField((ctx) => ctx.appearance),
    { requires: "char" },
  );
  registry.register(
    "backstory",
    charField((ctx) => ctx.backstory),
    { requires: "char" },
  );
  registry.register(
    "example",
    charField((ctx) => ctx.exampleMessages),
    { requires: "char" },
  );
  registry.register(
    "mesexamples",
    charField((ctx) => ctx.exampleMessages),
    { requires: "char" },
  );
  registry.register(
    "charsysinfo",
    charField((ctx) => ctx.charSysInfo),
    { requires: "char" },
  );
  registry.register(
    "charposthistory",
    charField((ctx) => ctx.charPostHistory),
    {
      requires: "char",
    },
  );
  // {{original}} — the preset-level Main Prompt / Jailbreak the character marker wraps.
  registry.register(
    "original",
    charField((ctx) => ctx.original),
    { requires: "char" },
  );
  registry.register(
    "charfirstmessage",
    charField((ctx) => ctx.firstMessage),
    { requires: "char" },
  );

  registry.register(
    "compact_summary",
    charField((ctx) => ctx.compactSummary),
    { requires: "chat" },
  );
  registry.register(
    "memory",
    charField((ctx) => ctx.memory),
    { requires: "chat" },
  );
  // Renders empty until domain/databank.gatherRetrieval stages `ctx.databank`; born now so preset
  // section templates can place it.
  registry.register(
    "databank",
    charField((ctx) => ctx.databank),
    { requires: "chat" },
  );
  registry.register(
    "guided_instruction",
    charField((ctx) => ctx.guidedInstruction),
    {
      requires: "chat",
    },
  );

  // The 8 rpg* data-fed macros (rpg-design/06 §1) — a game turn's GATHER stages `ctx.rpgMacros`; each reads its
  // value or "". Registered here (the databank/memory precedent) so a preset referencing `{{rpgSceneState}}` in
  // a NON-game chat resolves empty, never an unknown-macro error.
  // Volatile (parity-plus §12.3): the rpg planes move per turn as state advances, so a preset placing
  // `{{rpgSceneState}}` in a cached prefix is correctly flagged a cache-buster by `volatileNames()`. They are a
  // READ mirror (never a write) — the freeze pass (`createVolatileOnlyRegistry`) does NOT register them, so a
  // stored composer body re-emits `{{rpg*}}` verbatim (never baked), exactly like `{{expr}}`.
  for (const [name, key] of RPG_DATA_MACROS) {
    registry.register(
      name,
      charField((ctx) => ctx.rpgMacros?.[key]),
      volChat,
    );
  }

  registry.register("getvar", readVar);
  registry.register("get", readVar); // back-compat alias for in-tree prompts written before the rename
  registry.register("setvar", setVar, vol);
  registry.register("addvar", addVar, vol);
  registry.register("incvar", incVar, vol);
  registry.register("decvar", decVar, vol);
  registry.register("hasvar", hasVar);
  registry.register("deletevar", deleteVar);
  // The per-user global plane (02 §4) — read from staged globals; setglobalvar collects a commit-time
  // write (volatile: a mutation, like setvar).
  registry.register("getglobalvar", getGlobalVar);
  registry.register("setglobalvar", setGlobalVar, vol);

  // Registered via the shared helper so `createVolatileOnlyRegistry` resolves the exact same names.
  registerVolatileMacros(registry);

  // `delayArgResolution: true` lets us read RAW args so we can tell a bare identifier apart from a
  // sub-macro-resolved value like `{{hasvar::flag}} → "true"`. `blockChildren: true` (M1, §12A.1) —
  // `if` branch-picks over the raw body AST itself, so the universal content-as-last-arg delivery
  // (which would eagerly resolve BOTH branches) must not apply.
  registry.register("if", ifHandler, { delayArgResolution: true, blockChildren: true });
  registry.register("else", () => ""); // structural marker; standalone use is a no-op

  // {{expr::<cel>}} — CEL surfaced inside templates (02 §3). Volatile: its value depends on the runtime
  // CEL env (vars/now), so a static-half occurrence must bust the cached prefix.
  registry.register("expr", exprHandler, vol);

  registry.register("newline", () => "\n");
  registry.register("space", () => " ");
  registry.register("noop", () => "");
  registry.register("banned", () => ""); // legacy upstreams strip the contents; mirror that

  // The whole-body transform family — `blockChildren: true` (M1): each transforms its VERBATIM resolved
  // body, so the universal trim/dedent must not pre-mangle it (`{{trim}}` trimming a pre-trimmed body
  // would be vacuous; the case-folds must preserve the author's exact whitespace).
  const block = { blockChildren: true } as const;
  registry.register("trim", (_args, ctx, children) => (children ? ctx.evaluateAST(children).trim() : ""), block);
  registry.register("trimstart", (_args, ctx, children) => (children ? ctx.evaluateAST(children).trimStart() : ""), block);
  registry.register("trimend", (_args, ctx, children) => (children ? ctx.evaluateAST(children).trimEnd() : ""), block);
  // Locale-INDEPENDENT fold (Unicode default case mapping) — server and client must fold identically;
  // `toLocale*` would diverge on host locale (Turkish dotless-i, German ß).
  registry.register("uppercase", (_args, ctx, children) => (children ? ctx.evaluateAST(children).toUpperCase() : ""), block);
  registry.register("lowercase", (_args, ctx, children) => (children ? ctx.evaluateAST(children).toLowerCase() : ""), block);

  registry.register("input", (_args, ctx) => ctx.input ?? "", volChat);
  // {{idle_duration}} (parity-plus §12, D6 fold) — time since the last chat activity as human text, computed at
  // assembly off the message timestamps (EXCLUDING the in-flight message) and staged on `ctx.idleDuration`. Works
  // in ANY chat (a context-macro, not rpg-specific); a fresh one-message chat = no prior activity = "". Volatile.
  registry.register("idle_duration", (_args, ctx) => ctx.idleDuration ?? "", volChat);
  registry.register("lastMessage", (_args, ctx) => ctx.lastMessage ?? "", volChat);
  registry.register("lastUserMessage", (_args, ctx) => ctx.lastUserMessage ?? "", volChat);
  registry.register("lastCharMessage", (_args, ctx) => ctx.lastCharMessage ?? "", volChat);

  // Backfill DX metadata (02 §5) for every builtin above — one loop, off the register() calls so they
  // stay churn-free. A completeness test asserts every registered name is covered here.
  for (const [name, input] of Object.entries(BUILTIN_MACRO_METADATA)) {
    registry.setMetadata(name, input);
  }

  return registry;
}

// The RESTRICTED registry for STORED-HISTORY resolution. A stored history row is RAW and its VOLATILE
// macros ({{time}}/{{roll}}/{{random}}/…) are NOT re-derivable — re-resolving against the LIVE clock/PRNG
// on every assemble would churn that row's bytes every turn, missing the prefix cache from that row
// forward. This registry resolves ONLY the stable identity macros; every unregistered (volatile) macro
// is re-emitted VERBATIM by the evaluator's literal passthrough — byte-stable across renders.
export function createNamesOnlyRegistry(): MacroRegistry {
  const registry = new SimpleMacroRegistry();
  registry.register("char", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("user", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("charname", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("username", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("persona", (_args, ctx) => ctx.persona, { requires: "char" });
  // Mirror the default registry: `{{scenario}}` PROSE re-processes its nested identity macros on stored-history
  // read too (names are stable; volatile macros in the nested content stay literal — unregistered here).
  registry.register(
    "scenario",
    charField((ctx) => ctx.scenario),
    { requires: "char" },
  );
  return registry;
}

// The RESTRICTED registry for the COMMIT-TIME FREEZE pass — the inverse of `createNamesOnlyRegistry`.
// When content commits (a user message at send; a greeting at first-turn lock-in), its nondeterministic
// macros must resolve ONCE against the turn's pinned clock/PRNG and bake into the stored canon row.
// Every other macro has no handler here and is re-emitted VERBATIM (byte-stable), staying RAW in canon
// for the names-only pass to resolve per-view at READ. The two registries are exact freeze-axis complements.
export function createVolatileOnlyRegistry(): MacroRegistry {
  const registry = new SimpleMacroRegistry();
  registerVolatileMacros(registry);
  return registry;
}
