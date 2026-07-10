import { DateTime } from "luxon";
import type {
  MacroAST,
  MacroContext,
  MacroHandler,
  MacroRegisterOptions,
  MacroRegistry,
  VarOp,
} from "./types";
import { applyVarOp } from "./variables";

// Base-10 radix for the var-counter / dice integer parses.
const DECIMAL_RADIX = 10;
// Bare `{{random}}` rolls 0..100 inclusive → floor(rand * 101).
const RANDOM_DEFAULT_CEIL = 101;
// Numeric-range `{{random::X::Y}}` mode is keyed on EXACTLY two args.
const RANGE_ARG_COUNT = 2;
// Caps both dice `count` and `sides` so a hostile card can't block the loop with `{{roll::1e6d6}}`.
const ROLL_MAX = 10_000;
// A quoted RHS must hold at least the two surrounding quote chars to be unquotable.
const MIN_QUOTED_LEN = 2;

// Bare-identifier predicate token (env/built-in lookup) — letters, digits, `_`, `.`, `-`.
const BARE_IDENT = /^[\w.-]+$/;
// `{{#if LHS == "X"}}` / `!=` comparator split (non-greedy LHS, op, RHS).
const COMPARATOR = /^(.+?)\s*(==|!=)\s*(.+)$/;
// `{{roll::NdM}}` dice spec (N optional → defaults to 1).
const DICE_SPEC = /^(\d*)d(\d+)$/;
// `{{roll::N}}` plain-integer spec.
const PLAIN_INT = /^\d+$/;

// {{time}}/{{date}} clock source. Honors a per-request IANA `ctx.timezone` (the browser's zone,
// threaded from the chat-send path); an absent or invalid zone falls back to the server-local
// clock (Luxon's default zone, which respects the container's `TZ`). The browser supplies the
// live zone once the send UI passes it.
function nowInZone(ctx: MacroContext): DateTime {
  // `ctx.nowMs` (epoch-ms UTC) pins the clock when supplied; otherwise the live wall clock. This is
  // the single source of "now" for {{time}}/{{date}}, so pinning it makes the whole clock deterministic.
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

// Strip surrounding quotes from a comparator RHS / `banned` arg. Imported cards use
// straight (") and typographic (curly) quote pairs interchangeably; accept both.
function unquote(value: string): string {
  const v = value.trim();
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"], // “ ”
    ["‘", "’"], // ‘ ’
  ];
  for (const [open, close] of pairs) {
    if (v.startsWith(open) && v.endsWith(close) && v.length >= MIN_QUOTED_LEN) {
      return v.slice(open.length, v.length - close.length);
    }
  }
  return v;
}

// Lookup any macro-context value by name — used by `{{#if char == "x"}}` and the `random::A::B::C`
// dereference. Falls back to env so user-defined vars work the same as built-ins.
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

// Resolve an `if` predicate token to a string value. A bare identifier (no `{{`) looks up in the
// macro context — env first, then built-in fields (char/user/…). Anything containing `{{` is a
// sub-macro and gets evaluated; the resolved string is the literal value to truth-check or
// compare. The asymmetry mirrors the legacy `if`-handler convention from imported cards.
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

// Split a block's children at the first top-level {{else}} marker. Returns [thenBranch, elseBranch].
// elseBranch is [] when no else is present. Nested `if`s are unaffected (we only split top-level).
// Case-insensitive compare — the parser preserves source casing and the registry lookup is
// case-insensitive everywhere else, so `{{Else}}`/`{{ELSE}}` must split too (a case-sensitive
// compare here silently rendered BOTH branches: the marker itself resolved to "" via the
// registry, hiding the failure — review V10-6).
function splitOnElse(children: MacroAST): [MacroAST, MacroAST] {
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    if (node?.type === "macro" && node.name.toLowerCase() === "else") {
      return [children.slice(0, i), children.slice(i + 1)];
    }
  }
  return [children, []];
}

// ── Conditional handler ────────────────────────────────────────────────────────────────────────
// Three predicate shapes (legacy card-format compat):
//   {{#if NAME}}…{{/if}}                     — truthy check (name's value is non-empty)
//   {{#if NAME == "X"}}…{{/if}}              — equality comparator (straight or curly quotes)
//   {{#if NAME != "X"}}…{{/if}}              — inequality comparator
// An optional `{{else}}` splits the children into then/else branches.
const ifHandler: MacroHandler = (args, ctx, children) => {
  // Reassemble the raw predicate: the parser's legacy whitespace splitter turns the documented
  // spaced form `{{#if NAME == "X"}}` into ["NAME", "==", "\"X\""]. Reading only args[0] silently
  // degraded the comparator to a truthy check on NAME (V10-1). The no-space form arrives as a
  // single arg, so joining is a no-op there.
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

// Utilities — multiple legacy overloads supported:
//   {{random}}            → 0..100
//   {{random::X::Y}}      → integer between X and Y inclusive (X,Y numeric)
//   {{random::A::B::C}}   → randomly pick ONE of the option strings (any non-numeric arg → option-pick)
// Numeric vs option mode is decided by whether the args parse as integers AND there are exactly 2.
const randomHandler: MacroHandler = (args, ctx) => {
  // Resolve the PRNG once through the injectable seam (ctx.random) — defaults to ambient Math.random.
  const random = ctx.random ?? Math.random;
  if (args.length === 0) {
    return String(Math.floor(random() * RANDOM_DEFAULT_CEIL));
  }
  if (args.length === RANGE_ARG_COUNT) {
    // Numeric range mode: BOTH args must be integers. `parseInt` was too lenient — it silently
    // truncated "1.5" → 1, so {{random::1.5::3.5}} returned an integer in [1,3] rather than what
    // the author intended. Use Number() + isInteger and fall through to option-pick otherwise.
    const min = Number(args[0] ?? "");
    const max = Number(args[1] ?? "");
    if (Number.isInteger(min) && Number.isInteger(max)) {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return String(Math.floor(random() * (hi - lo + 1)) + lo);
    }
  }
  // Option-pick mode (1 arg or ≥3 args, or 2 args where either isn't an integer).
  const idx = Math.floor(random() * args.length);
  return args[idx] ?? "";
};

// Dice: {{roll::NdM}} (sum of N M-sided dice) or {{roll::N}} (1..N). Empty/invalid → "".
// ROLL_MAX caps both `count` and `sides` so a hostile/garbage card can't block the event loop with
// {{roll::1000000d6}}. The output budget doesn't help here — the loop body never calls `append`.
const rollHandler: MacroHandler = (args, ctx) => {
  // Resolve the PRNG once through the injectable seam (ctx.random) — defaults to ambient Math.random.
  const random = ctx.random ?? Math.random;
  const spec = args[0]?.trim().toLowerCase();
  if (!spec) {
    return "";
  }
  const dice = spec.match(DICE_SPEC);
  if (dice) {
    const count = dice[1] ? Number.parseInt(dice[1], DECIMAL_RADIX) : 1;
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
  if (PLAIN_INT.test(spec)) {
    const n = Number.parseInt(spec, DECIMAL_RADIX);
    if (n < 1 || n > ROLL_MAX) {
      return "";
    }
    return String(Math.floor(random() * n) + 1);
  }
  return "";
};

// {{pick::A::B::C}} — deterministic option-pick under the injected PRNG (distinct from {{random}}, which
// also does numeric ranges). Empty arg list → "".
const pickHandler: MacroHandler = (args, ctx) => {
  if (args.length === 0) {
    return "";
  }
  // Resolve the PRNG once through the injectable seam (ctx.random) — defaults to Math.random.
  const random = ctx.random ?? Math.random;
  const index = Math.floor(random() * args.length);
  return args[index] ?? "";
};

// {{datetimeformat::FORMAT}} — Luxon format string (e.g. "yyyy-MM-dd HH:mm"). Empty arg → ISO.
const dateTimeFormat: MacroHandler = (args, ctx) => {
  const fmt = args[0]?.trim();
  if (!fmt) {
    return nowInZone(ctx).toISO() ?? "";
  }
  return nowInZone(ctx).toFormat(fmt);
};

// ── Variable store handlers ──────────────────────────────────────────────────────────────────
// Storage is ctx.env. Mutation handlers write IN-PLACE; the same object reference is preserved
// across render calls in one assembly pass, so a `setvar` early in the prompt is visible to a
// `getvar` later in the same turn.
const readVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (!key) {
    return "";
  }
  return String(ctx.env[key] ?? "");
};

// {{setvar::name::value}} — side-effect: write `value` to ctx.env[name], render "". Routes through
// `applyVarOp` (the shared mutation home) + records the op on `ctx.opLog` for the D46 per-variant delta.
const setVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (!key) {
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
  if (!key) {
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
  if (!key) {
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
  if (!key) {
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
  if (!key) {
    return "";
  }
  return Object.hasOwn(ctx.env, key) ? "true" : "";
};

// {{deletevar::name}} — drop the key entirely (different from setvar::name:: → empty string).
const deleteVar: MacroHandler = (args, ctx) => {
  const key = args[0]?.trim();
  if (!key) {
    return "";
  }
  const op: VarOp = { op: "delete", key };
  applyVarOp(ctx.env, op);
  ctx.opLog?.push(op);
  return "";
};

// The cast (member NAMES, primary first); absent cast ⇒ the cast-of-one [char], so {{group}} ==
// {{char}} for solo (byte-identical — the one-element join IS the single name). Gate on cast SIZE
// (length), never a group-vs-solo identity boolean.
function castOf(ctx: MacroContext): readonly string[] {
  return ctx.cast && ctx.cast.length > 0 ? ctx.cast : [ctx.char];
}

// The ACTIVE (non-muted) cast — distinct from {{group}} (full cast, incl. muted, who still
// contribute lore). Absent (solo / hand-built ctx) → falls back to the full cast.
function castNotMutedOf(ctx: MacroContext): readonly string[] {
  return ctx.castNotMuted && ctx.castNotMuted.length > 0 ? ctx.castNotMuted : castOf(ctx);
}

// Character-field factory. Each handler runs `ctx.evaluateString` on the raw field so `{{user}}` /
// `{{char}}` / nested macros embedded by the card author resolve properly (loops until the string
// stops changing). Empty when the field is absent.
function charField(read: (ctx: MacroContext) => string | undefined): MacroHandler {
  return (_args: string[], ctx: MacroContext): string => {
    const raw = read(ctx);
    if (!raw) {
      return "";
    }
    return raw.includes("{{") ? ctx.evaluateString(raw) : raw;
  };
}

// The NONDETERMINISTIC volatile macros — {{random}}/{{pick}}/{{roll}} (PRNG-driven) and the clock family
// {{time}}/{{date}}/{{weekday}}/{{isodate}}/{{isotime}}/{{datetimeformat}} (wall-clock-driven). These are the
// macros whose value can NOT be recovered from stored content (the clock/PRNG at commit is gone), so they
// FREEZE at COMMIT (Chat-Macro-Resolution.md §0: resolve ONCE at send / first-turn, bake the value into
// canon). Shared by `createDefaultRegistry` (live render) AND `createVolatileOnlyRegistry` (the freeze pass)
// so the two can never drift on WHICH names freeze. NOTE: the var-mutation macros ({{setvar}}/{{incvar}}/…)
// and the conversation-context macros ({{input}}/{{lastMessage}}/…) are ALSO flagged `volatile` on the
// default registry, but they are NOT nondeterministic (stateful / context-derived) and are deliberately
// EXCLUDED here — freezing them into a stored row would execute a side-effect against an ephemeral env or
// bake stale conversation context; they stay raw and inert in canon (the names-only read passes them through).
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
  // Conversation-context macros: volatile (each turn's "last message"/"input" differs) AND
  // `requires: "chat"` (no active chat ⇒ nothing to pull).
  const volChat = { volatile: true, requires: "chat" } as const;

  // ── Basic RP Context ───────────────────────────────────────────────────────────────────────
  // `requires: "char"` macros need character/persona context; `chatid` + `model` need the chat row.
  registry.register("char", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("user", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("charname", (_args, ctx) => ctx.char, { requires: "char" });
  registry.register("username", (_args, ctx) => ctx.user, { requires: "char" });
  registry.register("persona", (_args, ctx) => ctx.persona, { requires: "char" });
  registry.register("scenario", (_args, ctx) => ctx.scenario, { requires: "char" });
  registry.register("model", (_args, ctx) => ctx.model ?? "", { requires: "chat" });
  registry.register("chatid", (_args, ctx) => ctx.chatId ?? "", { requires: "chat" });

  // ── Group-chat cast macros (ST vocab) ────────────────────────────────────────────────────────
  // NON-volatile: the cast is fixed per turn (same stability class as {{char}}).
  registry.register("group", (_a, ctx) => castOf(ctx).join(", "), { requires: "char" });
  // charIfNotGroup: ST emits the full member list (== {{group}}) — both are "the cast".
  registry.register("charifnotgroup", (_a, ctx) => castOf(ctx).join(", "), { requires: "char" });
  registry.register("groupnotmuted", (_a, ctx) => castNotMutedOf(ctx).join(", "), {
    requires: "char",
  });
  // notChar: the cast minus the current speaker ({{char}}); humans NOT included. Empty for solo.
  registry.register(
    "notchar",
    (_a, ctx) =>
      castOf(ctx)
        .filter((n) => n !== ctx.char)
        .join(", "),
    { requires: "char" },
  );

  // ── Character field shortcuts (legacy card-format compat) ─────────────────────────────────
  // Both bare and `char`-prefixed forms supported. `mesExamples` and `example` are aliases.
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

  // ── Server-injected content (read by templated markers) ─────────────────────────────────────
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
  // The {{databank}} slot — RESERVED parallel to {{memory}} (D49 #5; databank-design/07 §3). Renders
  // empty until domain/databank.gatherRetrieval stages `ctx.databank` (DB2 proper); born now so preset
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

  // ── Variables ──────────────────────────────────────────────────────────────────────────────
  registry.register("getvar", readVar);
  // `get` retained as a back-compat alias for in-tree prompts written before the rename.
  registry.register("get", readVar);
  // Var-mutation macros are `volatile`: their RHS / counter state changes per turn.
  registry.register("setvar", setVar, vol);
  registry.register("addvar", addVar, vol);
  registry.register("incvar", incVar, vol);
  registry.register("decvar", decVar, vol);
  registry.register("hasvar", hasVar);
  registry.register("deletevar", deleteVar);

  // ── Utilities + Clock + dice (the NONDETERMINISTIC volatile set — {{random}}/{{pick}}/{{time}}/
  //    {{date}}/…/{{roll}}) — registered via the SHARED helper so the freeze-at-commit path
  //    (`createVolatileOnlyRegistry`) resolves EXACTLY the same names the default registry does. ──
  registerVolatileMacros(registry);

  // ── Conditional ────────────────────────────────────────────────────────────────────────────
  // `delayArgResolution: true` lets us read RAW args (pre-evaluation) so we can tell a bare
  // identifier `flag` apart from a sub-macro-resolved value like `{{hasvar::flag}} → "true"`.
  registry.register("if", ifHandler, { delayArgResolution: true });
  // {{else}} is structural — the `if` handler splits its children on this marker. Standalone use
  // outside an `if` block emits "" (the marker isn't an error, just a no-op there).
  registry.register("else", () => "");

  // ── Formatting ─────────────────────────────────────────────────────────────────────────────
  registry.register("newline", () => "\n");
  registry.register("space", () => " ");
  // {{noop}} renders empty — idiom for "I need a placeholder that vanishes".
  registry.register("noop", () => "");
  // {{banned "text"}} — legacy upstreams STRIP the contents from output. Mirror that: render empty.
  registry.register("banned", () => "");

  // {{#trim}}…{{/trim}} — evaluate the block body, then strip leading/trailing whitespace.
  registry.register("trim", (_args, ctx, children) =>
    children ? ctx.evaluateAST(children).trim() : "",
  );
  registry.register("trimstart", (_args, ctx, children) =>
    children ? ctx.evaluateAST(children).trimStart() : "",
  );
  registry.register("trimend", (_args, ctx, children) =>
    children ? ctx.evaluateAST(children).trimEnd() : "",
  );
  // {{#uppercase}}…{{/uppercase}} / {{#lowercase}}…{{/lowercase}} — case-folding blocks.
  // Locale-INDEPENDENT fold (Unicode default case mapping): server and client MUST fold identically
  // for orbweaver's "render once, identical server+client" mandate — `toLocale*` would diverge on
  // host locale (Turkish dotless-i, German ß). Determinism > marginal locale-correctness.
  registry.register("uppercase", (_args, ctx, children) =>
    children ? ctx.evaluateAST(children).toUpperCase() : "",
  );
  registry.register("lowercase", (_args, ctx, children) =>
    children ? ctx.evaluateAST(children).toLowerCase() : "",
  );

  // ── Conversation context (set by the chat send/assembly path; "" elsewhere) ──────────────────
  registry.register("input", (_args, ctx) => ctx.input ?? "", volChat);
  registry.register("lastMessage", (_args, ctx) => ctx.lastMessage ?? "", volChat);
  registry.register("lastUserMessage", (_args, ctx) => ctx.lastUserMessage ?? "", volChat);
  registry.register("lastCharMessage", (_args, ctx) => ctx.lastCharMessage ?? "", volChat);

  return registry;
}

// The RESTRICTED registry for STORED-HISTORY resolution (Chat-Macro-Resolution.md §0/§2). A stored
// history row is RAW and its VOLATILE macros ({{time}}/{{date}}/{{roll}}/{{random}}/{{pick}}/var
// mutations) are NOT re-derivable from the row — their commit-time value is gone. The full default
// registry re-resolves them against the LIVE wall clock + ambient PRNG on every assemble, so one
// `{{time}}`/`{{roll}}` in any kept message churned that row's bytes every turn: the Anthropic R1
// prefix cache missed from that row forward for the life of the chat, and a swipe re-fold of an
// identical context was not byte-identical (D46). This registry resolves ONLY the STABLE identity
// macros the row's stamps supply ({{char}}/{{user}}/{{persona}} + their name aliases + {{scenario}});
// every unregistered (volatile) macro is re-emitted VERBATIM by the evaluator's literal passthrough,
// which is byte-stable across renders. Doc-faithful (§2 scopes history to names) AND cache-stable.
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

// The RESTRICTED registry for the COMMIT-TIME FREEZE pass (Chat-Macro-Resolution.md §0 — the inverse of
// `createNamesOnlyRegistry`). When content COMMITS to the conversation (a user message at SEND; a greeting at
// the first-turn lock-in), its NONDETERMINISTIC macros ({{roll}}/{{random}}/{{pick}}/{{time}}/{{date}}/…) must
// resolve ONCE against the turn's pinned clock/PRNG and bake the value into the stored canon row — otherwise a
// re-render against a live clock/PRNG would produce a DIFFERENT roll/time every turn. This registry resolves
// ONLY those nondeterministic handlers; every OTHER macro — the IDENTITY set ({{char}}/{{user}}/{{persona}} +
// name aliases), var mutations, conversation-context, conditionals, char-fields — has no handler here and is
// re-emitted VERBATIM by the evaluator's literal passthrough (byte-stable), so it stays RAW in canon and is
// resolved per-view at READ (the names-only pass). The two registries are exact complements on the freeze axis:
// names-only bakes IDENTITY and passes volatiles through; volatile-only bakes VOLATILES and passes identity
// through. Built ONCE (a fixed restricted set, never extended) — the freeze pass fires per committed row.
export function createVolatileOnlyRegistry(): MacroRegistry {
  const registry = new SimpleMacroRegistry();
  registerVolatileMacros(registry);
  return registry;
}
