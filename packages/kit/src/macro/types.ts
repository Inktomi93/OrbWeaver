import type { CelBindings } from "#cel";
import type { ChatId } from "#ids";

export type MacroAST = MacroNode[];

export type MacroNode = TextNode | MacroCallNode | MacroBlockNode;

export interface TextNode {
  type: "text";
  value: string;
}

/** The source position of a macro call (`{{…}}` as typed). `offset`/`length` are byte-exact against the
 *  render input; `line`/`col` are 1-based, computed from `offset` at parse. Powers `MacroDiagnostic`
 *  (metadata.ts) — the editor renders the squiggle here, assembly threads it into `AssembleTrace`. */
export interface MacroSpan {
  readonly offset: number;
  readonly line: number;
  readonly col: number;
  readonly length: number;
}

/** A single macro-DX diagnostic — an arg-validation / parse / expr failure carrying the source span of
 *  the offending macro call so editors render it inline and assembly threads it into `AssembleTrace`
 *  (02 §5). Lives here (not metadata.ts) because MacroContext's diagnostics sink references it and only
 *  needs MacroSpan — keeping the metadata.ts → types.ts import one-directional. */
export interface MacroDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: "unknown-macro" | "bad-arity" | "bad-arg-type" | "unclosed-block" | "budget-exceeded" | "expr-error";
  readonly message: string;
  readonly span: MacroSpan;
}

// ── macro-DX vocabulary (02 §5) ──────────────────────────────────────────────────────────────────
// The metadata type surface + the category union home here (with the other macro types) so both the
// registry (types.ts's MacroRegisterOptions/MacroRegistry) and the DX functions (metadata.ts:
// validateMacroArgs/queryMacros) reference them without an import cycle — metadata.ts imports DOWN
// from here only.

// ── the reserved flags grammar (M4, parity-plus §12A.4 — the FINAL launch grammar, locked) ────────
// Flags sit BETWEEN `{{` and the identifier as a flag RUN (`{{<flags><name>::args}}`). ONE table is the
// vocabulary home: the parser derives its char→key map from it, the evaluator re-emits flag chars from it,
// and the macro browser documents the set from it — a new flag is one row here, never a parallel list.
// `status: "reserved"` flags parse + carry but their semantics NO-OP until implemented (degrade-don't-
// throw: `{{~name}}` renders un-reevaluated today, never a parse error). Retrofitting a flag grammar
// post-launch would break stored content permanently — reserving the symbols now is the whole point.

export const MACRO_FLAG_DEFS = [
  { char: "/", key: "closing", status: "implemented", description: "Closes a scoped block: {{name::args}}…{{/name}}." },
  { char: "#", key: "preserveWhitespace", status: "implemented", description: "Keeps a scoped-block body verbatim (skips the default trim + indent-dedent)." },
  { char: "!", key: "immediate", status: "implemented", description: "Forces EAGER arg resolution for this call (overrides a lazy handler default)." },
  { char: "?", key: "delayed", status: "implemented", description: "Defers arg resolution to the handler for this call (raw args; ctx.resolve)." },
  { char: "~", key: "reevaluate", status: "reserved", description: "Re-runs the macro's output through the parser once (reserved — parses, semantics no-op)." },
  { char: ">", key: "pipe", status: "reserved", description: "Feeds output through a filter/pipe chain (reserved — parses, semantics no-op)." },
] as const;
export type MacroFlagKey = (typeof MACRO_FLAG_DEFS)[number]["key"];

/** The parsed flag run of one tag — key present (`true`) only when its char appeared. `closing` never
 *  survives onto an AST node (the parser consumes it structurally: a `/`-flagged tag IS the block close);
 *  it lives in the key union because it is part of the one flag vocabulary. */
export type MacroFlags = { readonly [K in MacroFlagKey]?: true };

export const MACRO_CATEGORIES = [
  "identity", // char/user/group…
  "card", // description/personality/…
  "conversation", // input/lastMessage/…
  "variables", // getvar/setvar/getglobalvar/…
  "time", // date/time/isodate/…
  "random", // roll/random/pick…
  "expression", // expr
  "system", // memory/compact_summary/guided_instruction/original/structural…
  "user", // preset/game-authored template macros (M5, §12A.5) — registered via registerUserMacros
] as const;
export type MacroCategory = (typeof MACRO_CATEGORIES)[number];

/** The declared-arg type vocabulary (M3, §12A.3) — ONE tuple so `MacroArgDef.type` and the contracts-side
 *  user-macro authoring schema (`z.enum(MACRO_ARG_TYPES)`) derive from the same home, never re-spell it. */
export const MACRO_ARG_TYPES = ["string", "number", "boolean"] as const;
export type MacroArgType = (typeof MACRO_ARG_TYPES)[number];

/** Where a non-builtin macro came from (M5 source attribution, §12A.5) — the macro browser names it.
 *  Absent on a metadata record ⇒ a builtin. `id` is the owning preset id / game chat id as a string
 *  (kit stays below the branded-id homes). */
export interface MacroSourceRef {
  readonly kind: "preset" | "game";
  readonly id: string;
}

/** One positional argument of a macro. `optional` + `default` drive the arity check and the browser copy.
 *  M3 (§12A.3): these declarations are the RUNTIME contract too — the evaluator pads a missing optional
 *  arg with its `default` before the handler runs, and `type` is enforced in the execution path
 *  (violations degrade per `MacroArgViolation`, never throw). Optional args form a CONTIGUOUS SUFFIX
 *  after the required ones (the arity check counts on it; a metadata-shape test pins the builtins). */
export interface MacroArgDef {
  readonly name: string;
  readonly type: MacroArgType;
  readonly optional: boolean;
  // `| undefined` (not bare optional): the contracts-side authoring schema infers explicit-undefined
  // optionals under exactOptionalPropertyTypes, and its output must be assignable HERE unmapped.
  readonly default?: string | undefined;
  readonly description?: string | undefined;
}

/** Bounds on a variadic macro's TOTAL arg count (§12A.3's LIST spec — `{{pick}}` declares min 1 so a
 *  pick-of-nothing is an authoring diagnostic). Only meaningful with `variadic: true`; either bound may
 *  be absent (unbounded on that side). */
export interface MacroListSpec {
  readonly min?: number;
  readonly max?: number;
}

// ── typed arg-violation classing (M3, §12A.3) ────────────────────────────────────────────────────
// The runtime-enforcement error CLASS — richer than the two MacroDiagnostic codes it maps onto
// ("bad-arity"/"bad-arg-type", kept narrow so no diagnostic consumer churns). checkMacroArgs
// (metadata.ts) produces these; validateMacroArgs derives the diagnostics FROM them (one home for the
// messages). The fail-open posture is unchanged: a violation renders best-effort (lenient) or ""
// (strict) — never a throw into prose.

// The axis declared ONCE as a tuple, the union derived (§7.5); no external consumer needs the tuple VALUE,
// so it stays module-local (only `MacroArgViolationKind` is exported).
const MACRO_ARG_VIOLATION_KINDS = ["missing-required", "too-many-args", "list-bounds", "bad-type"] as const;
export type MacroArgViolationKind = (typeof MACRO_ARG_VIOLATION_KINDS)[number];

export interface MacroArgViolation {
  readonly kind: MacroArgViolationKind;
  readonly macro: string;
  /** 0-based arg position for `bad-type`; absent on arity-level violations (whole-call). */
  readonly argIndex?: number;
  /** The declared arg's name for `bad-type`; absent on arity-level violations. */
  readonly argName?: string;
  readonly message: string;
}

/** The FULL browser/autocomplete record for a macro. `volatile` is composed by the registry from the
 *  `registerVolatileMacros` set (never hand-authored — see 02 §5 reconciliation note + registry.ts). */
export interface MacroMetadata {
  readonly name: string;
  readonly description: string; // one sentence; the autocomplete/browser copy
  readonly category: MacroCategory;
  readonly args: readonly MacroArgDef[];
  readonly returnType: "string"; // macros always render string; field exists for browser display of intent
  readonly aliases: readonly string[]; // alternate registered spellings of the same macro
  /** Accepts an unbounded tail of args (`{{random::a::b::c}}`, `{{pick}}`) — suppresses the too-many
   *  arity diagnostic and validates the tail against the last arg def. */
  readonly variadic: boolean;
  /** Total-arg-count bounds for a variadic macro (M3 LIST spec) — absent ⇒ unbounded. */
  readonly list?: MacroListSpec;
  /** `true` ⇒ this macro's arg violations render "" even under a LENIENT context (per-macro strict
   *  mode, §12A.3) — still a degrade, never a throw; the author-time surface gets the error report.
   *  Absent/false ⇒ the context's `strictArgs` governs. No builtin sets it (available to extensions
   *  and the M5 user-macro surface). */
  readonly strict?: boolean;
  /** Renders a different value across calls/turns (time/random/conversation/var-mutation) — the assembly
   *  cache-buster trace reads this. DERIVED from the volatile registration path, never authored here. */
  readonly volatile: boolean;
  /** M5 source attribution (§12A.5): where a user macro came from (`preset:<id>` / `game:<chatId>`),
   *  rendered by the macro browser. Absent ⇒ a builtin. Composed by `registerUserMacros`. */
  readonly source?: MacroSourceRef;
}

/** The AUTHORED metadata shape — everything except `volatile`, which the registry composes from the
 *  `registerVolatileMacros` membership so a second volatile list can never drift (D51). */
export type MacroMetadataInput = Omit<MacroMetadata, "volatile">;

export interface MacroCallNode {
  type: "macro";
  name: string;
  args: string[];
  /** The original source span (`{{name:one,two}}` exactly as typed) — the evaluator re-emits this
   *  for unrecognized macros, since parsed args normalize colon/whitespace forms. Absent →
   *  reconstructed `{{name::args}}` fallback. */
  raw?: string;
  /** Positional span of this call — offset/line/col/length (02 §5 diagnostics). Set by the parser;
   *  absent on hand-built AST nodes (tests/callers that construct nodes directly). */
  span?: MacroSpan;
  /** The parsed flag run (`{{#name}}`, `{{~name}}` — §12A.4). Absent when no flags were written; the
   *  raw re-emit carries the original flag bytes via `raw`. */
  flags?: MacroFlags;
}

export interface MacroBlockNode {
  type: "block";
  name: string;
  args: string[];
  children: MacroAST;
  /** Original source span of the OPEN tag (`{{name::args}}` as typed) — same re-emission
   *  rationale as MacroCallNode.raw. */
  raw?: string;
  /** Positional span of the OPEN tag — same rationale as MacroCallNode.span. */
  span?: MacroSpan;
  /** The OPEN tag's parsed flag run (`#` = preserve-whitespace skips the body trim/dedent). */
  flags?: MacroFlags;
  /** Original source of the CLOSE tag (`{{/name}}` as typed, flags-verbatim) — an unknown-name block
   *  re-emits BOTH tags byte-identical. Absent on hand-built nodes → reconstructed `{{/name}}`. */
  closeRaw?: string;
}

/** A macro's runtime variable bag (the `{{get}}`/`{{if}}` key→value store). Values are `unknown`:
 *  mutation handlers write strings, but `{{if}}` and consumer-provided fixtures may legitimately
 *  hold booleans/numbers for truthiness tests, so the type stays open. */
export type MacroEnv = Record<string, unknown>;

/** One recorded runtime variable mutation. `set`/`add` carry `value`; `inc`/`dec`/`delete` don't.
 *  Pushed to {@link MacroContext.opLog} and REPLAYED (`foldVarOps`) along the selected-variant
 *  chain to derive current state — deriving, not stamping, so a swipe/fork rewinds correctly. */
export type VarOp =
  | { readonly op: "set"; readonly key: string; readonly value: string }
  | { readonly op: "add"; readonly key: string; readonly value: string }
  | { readonly op: "inc"; readonly key: string }
  | { readonly op: "dec"; readonly key: string }
  | { readonly op: "delete"; readonly key: string };

/** ONE volatile-macro occurrence resolved by a COMMIT-TIME FREEZE pass (D129-F). The freeze is
 *  byte-destructive by design — `{{roll}}`/`{{random}}`/`{{pick}}`/the clock family resolve once against the
 *  turn's pinned clock + seeded PRNG and bake into the stored canon text (D51: one post-transform text
 *  everywhere) — so without a record the drawn value is unrecoverable and a swipe can never reproduce the row.
 *
 *  `name` is the REGISTERED (lowercase) macro name, `args` the delivered argument text rejoined with `::`
 *  (absent when the call took none), `value` the string the handler returned and the freeze substituted.
 *  Occurrence-ordered: a replay walks the record POSITIONALLY, which is what makes reproduction byte-exact
 *  without re-deriving anything.
 *
 *  Kit owns this shape (the engine EMITS it); `@orb/contracts/chat`'s `macroFreezeSchema` pins itself to it
 *  with `satisfies z.ZodType<MacroFreeze>` and `message_variants.macro_freezes` stores the array — the same
 *  one-home arrangement {@link VarOp} has. */
export interface MacroFreeze {
  readonly name: string;
  // `| undefined` (not a bare optional): the contracts-side schema infers explicit-undefined optionals under
  // exactOptionalPropertyTypes, and its output must be assignable HERE unmapped.
  readonly args?: string | undefined;
  readonly value: string;
}

/** One `{{setglobalvar}}` write collected during a render (D46, 02 §4). UNLIKE {@link VarOp}, globals are
 *  NOT variant-scoped — these are drained + upserted into the per-user `global_variables` plane at TURN
 *  COMMIT, last-write-wins; a swipe never rewinds a global. */
export interface GlobalVarWrite {
  readonly key: string;
  readonly value: string;
}

export interface MacroContext {
  char: string;
  user: string;
  /** The character CAST member names (primary first), INCLUDING muted members. Drives `{{group}}`/
   *  `{{charIfNotGroup}}`/`{{notChar}}`. A solo chat is a cast-of-one, so `{{group}}` == `{{char}}` (byte-
   *  identical). Absent ⇒ treated as the cast-of-one `[char]`. */
  cast?: readonly string[];
  /** The ACTIVE (non-muted) cast member names — drives `{{groupNotMuted}}`, distinct from `{{group}}`
   *  (which includes muted members for their lore). Absent ⇒ `{{groupNotMuted}}` falls back to `cast`. */
  castNotMuted?: readonly string[];
  persona: string;
  scenario: string;
  // Character-field shortcuts (legacy card-format compat). Undefined → the macro renders "".
  description?: string | undefined; // → {{description}} / {{charDescription}}
  personality?: string | undefined; // → {{personality}} / {{charPersonality}}
  appearance?: string | undefined; // → {{appearance}}
  backstory?: string | undefined; // → {{backstory}}
  exampleMessages?: string | undefined; // → {{example}} / {{mesExamples}}
  charSysInfo?: string | undefined; // → {{charSysInfo}} (the card's system-prompt override)
  charPostHistory?: string | undefined; // → {{charPostHistory}} (post-history instructions)
  // → {{original}} — the PRESET-level Main Prompt (char_system) or Jailbreak (post_history), so a
  // character's own system/jailbreak can WRAP the global one. Threaded per-marker by the assembler.
  original?: string | undefined;
  firstMessage?: string | undefined; // → {{charFirstMessage}}
  // Conversation-derived fields — undefined ⇒ `{{input}}`/`{{lastMessage}}` degrade to "" rather
  // than throwing in contexts that lack them.
  input?: string | undefined; // the in-flight user turn being answered
  lastMessage?: string | undefined; // most recent message of any role (excl. the in-flight one)
  lastUserMessage?: string | undefined;
  lastCharMessage?: string | undefined;
  // Server-injected content — each a per-chat ephemeral string the runner stages onto the assemble
  // context. Macros `{{compact_summary}}`/`{{memory}}`/`{{guided_instruction}}` return these.
  compactSummary?: string | undefined;
  memory?: string | undefined;
  guidedInstruction?: string | undefined;
  // The {{databank}} slot — undefined ⇒ nothing retrieved ⇒ the marker renders empty
  // (byte-identical non-databank turn).
  databank?: string | undefined;
  // The 8 rpg* data-fed macros (rpg-design/06 §1) — a game turn's GATHER stages this map, keyed by the
  // RpgGatherMacros field names ({{rpgWorld}}/{{rpgSceneState}}/…). Each rpg macro reads its value or "".
  // ONE map (not 8 fields) so the channel is a single seam; a non-game chat / unstaged turn ⇒ every rpg
  // macro renders empty (byte-identical non-game turn).
  rpgMacros?: Readonly<Record<string, string>> | undefined;
  // {{idle_duration}} — time since the last chat activity as human text ("8 minutes"), computed at assembly
  // off the message timestamps the chat holds, EXCLUDING the in-flight message (else it always reads ~0 — the
  // user just sent). Any chat (game or not) stages it; absent / a fresh one-message chat ⇒ the macro renders ""
  // (no prior activity). Volatile — it changes every turn.
  idleDuration?: string | undefined;
  // Run-environment shortcuts (legacy card-format compat). Threaded by the chat send/assembly path.
  model?: string | undefined; // → {{model}}
  chatId?: ChatId | undefined; // → {{chatId}}
  // IANA timezone (e.g. "America/New_York") for {{time}}/{{date}} — supplied per-request by the
  // browser (Intl.DateTimeFormat().resolvedOptions().timeZone). Absent/invalid → server-local.
  timezone?: string | undefined;
  // Fixed clock for {{time}}/{{date}}, as epoch-ms UTC. Absent → the live wall clock — the
  // deterministic-clock seam (tests, replay, scheduled re-renders).
  nowMs?: number | undefined;
  // Injectable PRNG for {{random}}/{{roll}}/{{pick}}/dice — a float in [0,1) like Math.random.
  // Absent → the ambient Math.random. Mirrors the nowMs clock seam for deterministic tests/replay.
  random?: (() => number) | undefined;
  // Allows extensions (like Regex) or future features to pass arbitrary runtime state
  env: MacroEnv;
  // Recursively evaluate strings (e.g. for nested macros in args)
  evaluateString: (text: string) => string;
  // Evaluate an AST directly (e.g. for block macro children)
  evaluateAST: (ast: MacroAST) => string;
  // The M2 generalized lazy contract (§12A.2): the first-class per-call resolution handle a LAZY
  // handler (delayArgResolution / the `?` flag) uses to resolve its raw args or body itself.
  // THREADS the parent context UNCHANGED — same injected ctx.random/nowMs (never re-seeded, never a
  // child PRNG), same opLog, same MacroBudget (depth + output fire on the lazy path identically) — so
  // lazy resolution draws in document order, byte-identical to eager (the determinism-through-nesting
  // invariant, owner-ratified #19). `trim: true` applies the trimContent body normalization (the
  // resolveContent seam the evaluator's content-as-last-arg delivery rides).
  resolve: (content: string | MacroAST, opts?: MacroResolveOptions) => string;
  // Optional post-processing hook for macro values (e.g. escaping regex chars)
  postProcess?: (val: string) => string;
  // Optional warning sink. Server layer injects getLog().warn; tests/client can leave undefined.
  // Kept as a plain callback (not a Logger import) so kit stays isolated from server/.
  onWarn?: (msg: string, err?: unknown) => void;
  // Optional ordered log of runtime variable mutations. When present, the setvar/addvar/incvar/
  // decvar/deletevar handlers push each op here in addition to applying it to `env`; absent ⇒
  // no recording (assembly-only re-renders, config-plane previews, tests).
  opLog?: VarOp[];
  // The VOLATILE-FREEZE ledger (D129-F) — the {@link opLog} idiom applied to the freeze axis, and the reason
  // recording is a CONTEXT capability rather than a second registry: the per-turn freeze registry is shared by
  // every freeze call in a turn (the send draft AND each greeting), so a sink captured in the registry would
  // pool their records together. Both fields are absent on every live render, which is what keeps the default
  // registry byte-identical.
  //   • `macroFreezes` — present ⇒ each volatile handler pushes its resolved occurrence here in document
  //     order. The domain persists it as `message_variants.macro_freezes`.
  //   • `frozenMacros` — **COMMITTED, NOT YET WIRED (D129-G).** The freeze-site WRITES are live; the swipe /
  //     greeting-re-selection re-resolution this arm exists for is not built, so today its only callers are
  //     tests. It ships with the record because a record you cannot reproduce FROM is an untested claim — the
  //     round-trip pin (tests/kit/macro/registry.test.ts + the volatile-freeze-record suite) is what makes the
  //     stored provenance a fact rather than an assertion. A future swipe caller inherits the semantics below.
  //     A PRIOR record replayed POSITIONALLY: an entry whose name+args match the call being
  //     evaluated supplies its value and the handler is NOT run (so the PRNG/clock is not consulted and the
  //     bytes are reproduced exactly). The first MISMATCH abandons the replay for the rest of the pass — a
  //     divergence means the record no longer describes this text, and mis-pairing values would be worse than
  //     drawing fresh. Replayed values are recorded onto `macroFreezes` too (frozen ∪ fresh — the `frozenDraws`
  //     discipline), so one pass always emits a self-contained record.
  macroFreezes?: MacroFreeze[];
  frozenMacros?: readonly MacroFreeze[] | undefined;
  // Cursor into {@link frozenMacros}; parked at the record's end once a replay diverges. @internal.
  __freezeCursor?: number;
  // Global-variable plane (D46, 02 §4) — a SEPARATE store from `env` (runtime vars): cross-chat,
  // single-owned, NOT variant-scoped. `globalVars` is the author's staged globals (a read cache the
  // domain fetches before render); `{{getglobalvar}}` reads it. `{{setglobalvar}}` collects writes onto
  // `globalVarWrites` AND reflects them into `globalVars` (so a later same-render `{{getglobalvar}}` sees
  // them) — the domain drains + upserts the writes at TURN COMMIT (last-write-wins; a swipe never rewinds).
  globalVars?: Record<string, string>;
  globalVarWrites?: GlobalVarWrite[];
  // The CEL activation the `{{expr::…}}` macro evaluates against (02 §3) — the §1 env minus `event`
  // (vars/choice/global/chat/now), staged by the assembler/dispatcher. Absent ⇒ `{{expr}}` evaluates
  // against an empty binding (any field reference then errors → "" + an expr-error diagnostic).
  celBindings?: CelBindings;
  // The span of the macro call CURRENTLY being handled — set by the evaluator right before invoking a
  // handler so a handler that emits diagnostics ({{expr::…}}) can locate itself. @internal.
  __currentSpan?: MacroSpan | undefined;
  // Arg-validation mode (02 §5). `true` → a bad-arity/bad-arg-type call renders "" + an `error`
  // diagnostic (the rule/template EDITORS hold new authorship to the bar); `false`/undefined
  // (default) → best-effort render + a `warning` diagnostic (imported ST content is sloppy).
  strictArgs?: boolean;
  // Optional diagnostics sink — mirrors `opLog`. When present, the evaluator pushes each
  // MacroDiagnostic (unknown-macro under strict, arg-validation, {{expr}} errors) here; absent ⇒
  // no collection (the vast majority of render callers). Editors/assembly pass an array and read it.
  diagnostics?: MacroDiagnostic[];
  // Defense-in-depth budget — capped recursion depth + total output size so a malicious card
  // (`{{setvar::a::{{a}}}}` and friends) can't DoS the renderer. Initialized in createMacroContext;
  // exposed here so the evaluator + handler wrappers share one bucket.
  __budget?: MacroBudget;
}

/** Options for {@link MacroContext.resolve}. `trim: true` runs the resolved string through the
 *  trimContent body normalizer (trim + indent-dedent) — the same treatment a universal block body gets
 *  by default; omit/false for verbatim (the `#` PRESERVE_WHITESPACE behavior). */
export interface MacroResolveOptions {
  readonly trim?: boolean;
}

/** Renderer budget — shared across every nested evaluateString/evaluateAST call and every appended
 *  output chunk for one processMacros run. Once a cap is exceeded the budget stays exceeded
 *  (`tripped` latches true) so subsequent expansions short-circuit instead of partially rendering.
 *  @internal — passed through MacroContext.__budget; macro authors never construct one directly. */
export interface MacroBudget {
  depth: number;
  maxDepth: number;
  output: number;
  maxOutput: number;
  tripped: boolean;
}

export type MacroHandler = (args: string[], ctx: MacroContext, children?: MacroAST) => string;

/** Macro registration options. `delayArgResolution: true` is the seam for `if`-style handlers
 *  that need to disambiguate "bare identifier" (look up) from "resolved sub-macro value"
 *  (literal). The evaluator skips arg-resolution and the handler decides what to resolve, using
 *  ctx.resolve (or ctx.evaluateString) as needed. This is the handler's DEFAULT only — the `!`
 *  (IMMEDIATE) and `?` (DELAYED) flags override it per-call (§12A.2/§12A.4); a conflicting `{{!?…}}`
 *  run resolves IMMEDIATE (eager delivery is safe for every handler; a lazy delivery to a
 *  lazy-unaware handler passes raw bytes through).
 *
 *  `volatile: true` declares that the macro's value changes per render (clocks, randomness,
 *  conversation-context lookups, var mutations). prompt-assemble queries the registry for the
 *  set of volatile names so the static-half cache-buster scan stays in sync with whatever the
 *  registry actually offers — a future macro flagged here is automatically included without a
 *  parallel list to forget.
 *  @internal — `MacroRegistry.register`'s options shape; consumers pass it as a literal. */
export interface MacroRegisterOptions {
  delayArgResolution?: boolean;
  volatile?: boolean;
  /** `true` → in scoped-block form this handler receives the raw body AST as its third param and controls
   *  resolution itself (`if` branch-picks, `trim`/case-fold transform) — the M1 content-as-last-arg
   *  delivery is SKIPPED. Absent (the universal default, §12A.1): a block body resolves through
   *  `ctx.evaluateAST`, is trimmed + indent-dedented (verbatim under the `#` flag), and arrives as the
   *  handler's LAST unnamed argument — any macro takes a body with zero registration work. */
  blockChildren?: boolean;
  /** The macro-DX browser/validation record (02 §5) — REQUIRED for new (extension) registrations; the
   *  builtin set is backfilled in registry.ts so no metadata-less macro survives (a completeness test
   *  is the enforcer). AUTHORED shape (no `volatile`): the registry composes `volatile` from this
   *  macro's `volatile` option so the two can't drift. Optional here only because the restricted freeze
   *  registries (names-only / volatile-only) re-register the same names without DX metadata. */
  metadata?: MacroMetadataInput;
  /** What runtime context this macro needs to resolve to a REAL value (as opposed to falling
   *  back to an empty string or a placeholder name):
   *    "char" — needs character context (name, description, personality, scenario, persona, …)
   *    "chat" — needs chat context (lastMessage, lastUserMessage, chatId, model, …)
   *    undefined — context-free (date/time/random/dice, var ops, conditionals, formatting)
   *  Surfaced via `MacroRegistry.requirementsOf(name)` so the preview engine can build a
   *  placeholder/demo MacroContext when no chat is active and report which macros got the
   *  fallback treatment instead of real data. */
  requires?: "chat" | "char";
}

export interface MacroRegistry {
  register: (name: string, handler: MacroHandler, options?: MacroRegisterOptions) => void;
  get: (name: string) => MacroHandler | undefined;
  getOptions: (name: string) => MacroRegisterOptions | undefined;
  /** Names registered with `volatile: true` — produces-per-render macros (clocks, randomness,
   *  variable mutations, conversation-context lookups). prompt-assemble uses this to detect
   *  cache-busters in static-half templates without a parallel hand-maintained list. */
  volatileNames: () => string[];
  /** Every registered macro name (lowercase lookup keys). The metadata-completeness gate cross-checks
   *  this against `getMetadata` so no registered macro ships without DX metadata (02 §5). */
  names: () => string[];
  /** Returns the registered `requires` flag for a macro, or undefined if context-free. Preview
   *  uses this to mark "this macro was substituted with a placeholder, not real data". */
  requirementsOf: (name: string) => "chat" | "char" | undefined;
  /** The composed DX metadata for a macro (02 §5) — the authored record plus `volatile` DERIVED from
   *  the registration's `volatile` option (one volatile home, D51). Undefined for names registered
   *  without metadata (the restricted freeze registries). */
  getMetadata: (name: string) => MacroMetadata | undefined;
  /** Every macro's composed metadata (for `queryMacros` / the browser). Order-unspecified; the query
   *  sorts by name. */
  allMetadata: () => readonly MacroMetadata[];
}
