import { DateTime } from "luxon";
import type { MacroAST, MacroContext, MacroHandler, MacroRegisterOptions, MacroRegistry, VarOp } from "./types";
import { applyVarOp } from "./variables";

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

  register(name: string, handler: MacroHandler, options?: MacroRegisterOptions): void {
    const key = name.toLowerCase();
    this.handlers.set(key, handler);
    if (options) {
      this.options.set(key, options);
    }
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

// Three predicate shapes: {{#if NAME}}, {{#if NAME == "X"}}, {{#if NAME != "X"}}; optional {{else}}.
const ifHandler: MacroHandler = (args, ctx, children) => {
  // Reassemble the raw predicate: the parser's whitespace splitter turns `{{#if NAME == "X"}}`
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
    const lowered = value.trim().toLowerCase();
    pass = value.trim() !== "" && lowered !== "false" && lowered !== "off" && lowered !== "0";
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

// {{hasvar::name}} — "true" / "" so it composes with `{{#if hasvar::flag}}`. Semantics: "exists" is
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

// The NONDETERMINISTIC macros ({{random}}/{{pick}}/{{roll}} + the clock family) whose value can't be
// recovered from stored content, so they FREEZE at commit. Shared by `createDefaultRegistry` (live
// render) and `createVolatileOnlyRegistry` (the freeze pass) so the two can't drift on which names freeze.
// NOTE: var-mutation + conversation-context macros are ALSO `volatile` but deliberately excluded here —
// freezing them would execute a side-effect against an ephemeral env or bake stale context.
function registerVolatileMacros(registry: SimpleMacroRegistry): void {
  const vol = { volatile: true } as const;
  registry.register("random", randomHandler, vol);
  registry.register("pick", pickHandler, vol);
  // Locale-independent clock formats. Zone = ctx.timezone (browser) → server-local fallback. Volatile —
  // every render is a different "now" → static-half occurrences bust the cached prefix.
  registry.register("time", (_args, ctx) => nowInZone(ctx).toFormat("HH:mm:ss"), vol);
  registry.register("date", (_args, ctx) => nowInZone(ctx).toFormat("yyyy-MM-dd"), vol);
  registry.register("weekday", (_args, ctx) => nowInZone(ctx).toFormat("cccc"), vol); // "Monday" …
  registry.register("isodate", (_args, ctx) => nowInZone(ctx).toISODate() ?? "", vol);
  registry.register("isotime", (_args, ctx) => nowInZone(ctx).toISO() ?? "", vol);
  registry.register("datetimeformat", dateTimeFormat, vol);
  registry.register("roll", rollHandler, vol);
}

export function createDefaultRegistry(): MacroRegistry {
  const registry = new SimpleMacroRegistry();
  const vol = { volatile: true } as const;
  const volChat = { volatile: true, requires: "chat" } as const;

  registry.register("char", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("user", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("charname", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("username", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("persona", (_args, ctx) => ctx.persona, { requires: "char" });
  registry.register("scenario", (_args, ctx) => ctx.scenario, { requires: "char" });
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

  registry.register("getvar", readVar);
  registry.register("get", readVar); // back-compat alias for in-tree prompts written before the rename
  registry.register("setvar", setVar, vol);
  registry.register("addvar", addVar, vol);
  registry.register("incvar", incVar, vol);
  registry.register("decvar", decVar, vol);
  registry.register("hasvar", hasVar);
  registry.register("deletevar", deleteVar);

  // Registered via the shared helper so `createVolatileOnlyRegistry` resolves the exact same names.
  registerVolatileMacros(registry);

  // `delayArgResolution: true` lets us read RAW args so we can tell a bare identifier apart from a
  // sub-macro-resolved value like `{{hasvar::flag}} → "true"`.
  registry.register("if", ifHandler, { delayArgResolution: true });
  registry.register("else", () => ""); // structural marker; standalone use is a no-op

  registry.register("newline", () => "\n");
  registry.register("space", () => " ");
  registry.register("noop", () => "");
  registry.register("banned", () => ""); // legacy upstreams strip the contents; mirror that

  registry.register("trim", (_args, ctx, children) => (children ? ctx.evaluateAST(children).trim() : ""));
  registry.register("trimstart", (_args, ctx, children) => (children ? ctx.evaluateAST(children).trimStart() : ""));
  registry.register("trimend", (_args, ctx, children) => (children ? ctx.evaluateAST(children).trimEnd() : ""));
  // Locale-INDEPENDENT fold (Unicode default case mapping) — server and client must fold identically;
  // `toLocale*` would diverge on host locale (Turkish dotless-i, German ß).
  registry.register("uppercase", (_args, ctx, children) => (children ? ctx.evaluateAST(children).toUpperCase() : ""));
  registry.register("lowercase", (_args, ctx, children) => (children ? ctx.evaluateAST(children).toLowerCase() : ""));

  registry.register("input", (_args, ctx) => ctx.input ?? "", volChat);
  registry.register("lastMessage", (_args, ctx) => ctx.lastMessage ?? "", volChat);
  registry.register("lastUserMessage", (_args, ctx) => ctx.lastUserMessage ?? "", volChat);
  registry.register("lastCharMessage", (_args, ctx) => ctx.lastCharMessage ?? "", volChat);

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
  registry.register("scenario", (_args, ctx) => ctx.scenario, { requires: "char" });
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
