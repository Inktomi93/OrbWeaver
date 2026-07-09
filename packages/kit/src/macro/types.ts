export type MacroAST = MacroNode[];

export type MacroNode = TextNode | MacroCallNode | MacroBlockNode;

export interface TextNode {
  type: "text";
  value: string;
}

export interface MacroCallNode {
  type: "macro";
  name: string;
  args: string[];
  /** The original source span (`{{name:one,two}}` exactly as typed). The evaluator re-emits THIS
   *  for unrecognized macros — reconstructing from parsed args normalized single-colon/whitespace
   *  arg forms to `::` and changed passthrough bytes (review V10-10). Optional so hand-built AST
   *  fixtures stay valid; absent → reconstructed `{{name::args}}` fallback. */
  raw?: string;
}

export interface MacroBlockNode {
  type: "block";
  name: string;
  args: string[];
  children: MacroAST;
  /** Original source span of the OPEN tag (`{{#name args}}` as typed) — same re-emission
   *  rationale as MacroCallNode.raw. */
  raw?: string;
}

/** A macro's runtime variable bag (the `{{get}}`/`{{if}}` key→value store). Values are `unknown`:
 *  the mutation handlers (`setvar`/`addvar`/`incvar`/`decvar`) write strings, but `{{if}}` and
 *  consumer-provided fixtures legitimately hold booleans/numbers for truthiness tests, so the
 *  type stays open. `chats.variableValues` (the persisted form) IS string-only — see the
 *  schema annotation there; the macro engine narrows when it flushes back. */
export type MacroEnv = Record<string, unknown>;

/** One recorded runtime variable mutation (D46). `set`/`add` carry `value`; `inc`/`dec`/`delete` don't.
 *  The macro mutation handlers push these to {@link MacroContext.opLog}; the chat domain persists the
 *  ordered list per message-variant and REPLAYS it (`foldVarOps`) along the selected-variant chain to
 *  derive the current runtime state — deriving, not stamping, so a swipe/fork rewinds by re-folding
 *  (kills ST's swipe-clobber #3263). `applyVarOp` is the one shared mutation-semantics home. */
export type VarOp =
  | { readonly op: "set"; readonly key: string; readonly value: string }
  | { readonly op: "add"; readonly key: string; readonly value: string }
  | { readonly op: "inc"; readonly key: string }
  | { readonly op: "dec"; readonly key: string }
  | { readonly op: "delete"; readonly key: string };

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
  // Character-field shortcuts (legacy card-format compat). Optional — undefined → the macro renders "".
  // These mirror the per-section markers the prompt assembler also exposes (char_description et al.),
  // but as inline {{macro}}s usable from any literal section / WI entry / guided template / regex
  // replacement string. Authors don't have to know the section markers exist.
  description?: string | undefined; // → {{description}} / {{charDescription}}
  personality?: string | undefined; // → {{personality}} / {{charPersonality}}
  appearance?: string | undefined; // → {{appearance}}
  backstory?: string | undefined; // → {{backstory}}
  exampleMessages?: string | undefined; // → {{example}} / {{mesExamples}}
  charSysInfo?: string | undefined; // → {{charSysInfo}} (the card's system-prompt override)
  charPostHistory?: string | undefined; // → {{charPostHistory}} (post-history instructions)
  // → {{original}} — the PRESET-level Main Prompt (when rendering char_system) or Jailbreak (when
  // rendering post_history), so a character's own system/jailbreak can WRAP the global one (ST's
  // `{{original}}` + prefer_character_prompt). Threaded per-marker by the assembler; "" elsewhere.
  original?: string | undefined;
  firstMessage?: string | undefined; // → {{charFirstMessage}}
  // Conversation-derived fields (optional — set by the chat send/assembly path, undefined elsewhere
  // so `{{input}}`/`{{lastMessage}}` degrade to "" rather than throwing in contexts that lack them).
  input?: string | undefined; // the in-flight user turn being answered
  lastMessage?: string | undefined; // most recent message of any role (excl. the in-flight one)
  lastUserMessage?: string | undefined;
  lastCharMessage?: string | undefined;
  // Server-injected content — read by templated markers (compact_summary / memory /
  // guided_instruction). Each is a per-chat ephemeral string the runner stages onto the assemble
  // context. Macros `{{compact_summary}}`/`{{memory}}`/`{{guided_instruction}}` return these.
  compactSummary?: string | undefined;
  memory?: string | undefined;
  guidedInstruction?: string | undefined;
  // The {{databank}} slot — RESERVED parallel to {{memory}} (D49 #5; databank-design/07 §3). The
  // retrieved-chunk string databank's gatherRetrieval stages onto the assemble context; undefined ⇒
  // nothing retrieved ⇒ the `{{databank}}` marker renders empty (byte-identical non-databank turn). The
  // slot is born now so the preset section templates + the rpg GM preset can reference it; the producer
  // (domain/databank.gatherRetrieval) fills it when DB2 proper lands.
  databank?: string | undefined;
  // Run-environment shortcuts (legacy card-format compat). Threaded by the chat send/assembly path.
  model?: string | undefined; // → {{model}}
  chatId?: string | undefined; // → {{chatId}}
  // IANA timezone (e.g. "America/New_York") for {{time}}/{{date}} — supplied per-request by the
  // browser (Intl.DateTimeFormat().resolvedOptions().timeZone). Absent/invalid → server-local.
  timezone?: string | undefined;
  // Fixed clock for {{time}}/{{date}}, as epoch-ms UTC (shared/time vocabulary). Absent → the
  // live wall clock (DateTime.now()). Threaded by the chat send/assembly path so a caller can pin
  // "now" — the deterministic-clock seam (tests, replay, scheduled re-renders).
  nowMs?: number | undefined;
  // Injectable PRNG for {{random}}/{{roll}}/{{pick}}/dice — a float in [0,1) like Math.random.
  // Absent → the ambient Math.random (live entropy). Mirrors the nowMs clock seam: supplying a
  // fixed/sequenced generator makes the randomized macros deterministic (tests, replay, reproducible
  // rolls). The default (ambient Math.random) preserves current behavior byte-for-byte.
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
  // Optional ordered log of runtime variable mutations (D46). When present, the setvar/addvar/incvar/
  // decvar/deletevar handlers push each op here (in addition to applying it to `env`). The chat turn
  // threads a fresh array per turn and persists it as the produced variant's `variable_delta`; absent ⇒
  // no recording (assembly-only re-renders, config-plane previews, tests).
  opLog?: VarOp[];
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
  /** Returns the registered `requires` flag for a macro, or undefined if context-free. Preview
   *  uses this to mark "this macro was substituted with a placeholder, not real data". */
  requirementsOf: (name: string) => "chat" | "char" | undefined;
}
