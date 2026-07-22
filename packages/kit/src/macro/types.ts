import type { CelBindings } from "#cel";

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

export const MACRO_CATEGORIES = [
  "identity", // char/user/group…
  "card", // description/personality/…
  "conversation", // input/lastMessage/…
  "variables", // getvar/setvar/getglobalvar/…
  "time", // date/time/isodate/…
  "random", // roll/random/pick…
  "expression", // expr
  "system", // memory/compact_summary/guided_instruction/original/structural…
] as const;
export type MacroCategory = (typeof MACRO_CATEGORIES)[number];

/** One positional argument of a macro. `optional` + `default` drive the arity check and the browser copy. */
export interface MacroArgDef {
  readonly name: string;
  readonly type: "string" | "number" | "boolean";
  readonly optional: boolean;
  readonly default?: string;
  readonly description?: string;
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
  /** Renders a different value across calls/turns (time/random/conversation/var-mutation) — the assembly
   *  cache-buster trace reads this. DERIVED from the volatile registration path, never authored here. */
  readonly volatile: boolean;
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
}

export interface MacroBlockNode {
  type: "block";
  name: string;
  args: string[];
  children: MacroAST;
  /** Original source span of the OPEN tag (`{{#name args}}` as typed) — same re-emission
   *  rationale as MacroCallNode.raw. */
  raw?: string;
  /** Positional span of the OPEN tag — same rationale as MacroCallNode.span. */
  span?: MacroSpan;
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
  // Run-environment shortcuts (legacy card-format compat). Threaded by the chat send/assembly path.
  model?: string | undefined; // → {{model}}
  chatId?: string | undefined; // → {{chatId}}
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
  // Optional post-processing hook for macro values (e.g. escaping regex chars)
  postProcess?: (val: string) => string;
  // Optional warning sink. Server layer injects getLog().warn; tests/client can leave undefined.
  // Kept as a plain callback (not a Logger import) so kit stays isolated from server/.
  onWarn?: (msg: string, err?: unknown) => void;
  // Optional ordered log of runtime variable mutations. When present, the setvar/addvar/incvar/
  // decvar/deletevar handlers push each op here in addition to applying it to `env`; absent ⇒
  // no recording (assembly-only re-renders, config-plane previews, tests).
  opLog?: VarOp[];
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
 *  ctx.evaluateString as needed.
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
