// domain/chat/assembly/macros — the chat-domain wiring over the pure `@orb/kit/macro` engine ("chat
// orchestrates the pure kit engines, owns the order, not the engines"). This is the ONE place the macro
// ATOM gets fed chat context. Three constructions,
// co-located so both the section walk (assemble.ts) AND the WI matcher (world-info consumers in
// context.ts) import ONE renderer instead of reaching back into assemble.ts (a circular import):
//
//   • `renderMacros(text, ctx, persona, original?)` — the ASSEMBLE-stage SECTION renderer: a pure
//     AssembleContext → processMacros mapping. {{user}}/{{persona}} resolve against the section-
//     appropriate persona (pinned for card-derived sections, active for user-authored — the
//     dual-persona rule); `original` threads the preset Main-Prompt/Jailbreak into the two overridable
//     markers so a card can {{original}}-wrap the preset.
//   • `renderHistoryMacros(content, stamps, ctx, producer, speakerCharName?)` — the CANON-HISTORY-ROW
//     resolver (Chat-Macro-Resolution.md, doc §2/§3): a thin chat-ctx adapter over `@orb/kit/macro`'s
//     `resolveRowMacros`, the ONE shared atom server ASSEMBLE + client DISPLAY both call so they cannot
//     diverge. Read the doctrine in full before touching this function.
//   • `buildTurnMacroContext(args)` — the TURN-stage `MacroContext` the engine threads through regex
//     execution (USER_INPUT/AI_OUTPUT/REASONING/WORLD_INFO) + guided-instruction resolution.
//
// D46 (env-by-reference): the SECTION + TURN-STAGE constructions point `env` at the SAME
// `assembleCtx.variableValues` map reference, so a `{{setvar}}` in a rendered section is visible to a later
// section AND to a regex replacement within one turn (and vice versa) — there is exactly ONE env per turn,
// owned here. `renderHistoryMacros` does NOT thread `env` (Chat-Macro-Resolution.md §0 scopes history
// resolution to `{{char}}`/`{{user}}`/`{{persona}}` only — the shared atom's own floor, `resolveRowMacros`,
// never touches ChoiceBlock state).
//
// Determinism (testing §3 / D46): the clock seam is `nowMs`/`timezone` (no ambient `Date.now()` reaches
// the macro engine — it reads `ctx.nowMs`); the PRNG seam is the optional `random` passed through to the
// kit engine's injectable `ctx.random` (absent ⇒ the kit's ambient `Math.random`). The chat path pins
// both via the immutable turn ctx so a re-render is byte-identical.

import type { AssembleContext, AssemblePersona } from "@orb/contracts/chat";
import type { GuidedActionKind, GuidedImpersonatePerson } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS } from "@orb/contracts/preset";
import { resolveGuidedInstruction } from "@orb/kit/guided";
import type { ChatId } from "@orb/kit/ids";
import type { MacroContext, ProcessMacroOptions, RowMacroStamps } from "@orb/kit/macro";
import {
  createMacroContext,
  createVolatileOnlyRegistry,
  processMacros,
  resolveRowMacros,
} from "@orb/kit/macro";
import type { HistoryMacroNames } from "../contract/results";

// The COMMIT-TIME FREEZE registry (Chat-Macro-Resolution.md §0 — the inverse of the names-only history
// registry): resolves ONLY the nondeterministic macros ({{roll}}/{{random}}/{{pick}}/{{time}}/{{date}}/…),
// re-emitting IDENTITY + everything else verbatim. Built ONCE (fixed restricted set) — the freeze pass fires
// per committed user turn; a per-call rebuild would be pure waste (the row-macros.ts NAMES_ONLY precedent).
const VOLATILE_ONLY_REGISTRY = createVolatileOnlyRegistry();

/** null → undefined (the MacroContext fields are `T | undefined`, not `T | null`). A function call, so it
 *  keeps the option-builder's branch count flat (vs a `?? undefined` per field). */
function u<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined;
}

/** Assign `value` to `target[key]` only when defined (omit, never `undefined`, under
 *  exactOptionalPropertyTypes). */
function setIf<K extends keyof ProcessMacroOptions>(
  target: ProcessMacroOptions,
  key: K,
  value: ProcessMacroOptions[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/** The `{{char}}` binding for a turn: the single character name normally, OR the joined cast names under a
 *  `cast` speaker (narrator mode — Part III §7/§8). A cast-of-one collapses to that one name, so single /
 *  per-speaker / solo are byte-identical (no `if(isGroup)`). The kit engine resolves `{{char}}` from
 *  `MacroContext.char`; this is the ONE place that maps the speaker arm to it. */
function charForSpeaker(ctx: AssembleContext): string {
  if (ctx.speaker?.kind === "cast") {
    return ctx.speaker.members.map((m) => m.name).join(", ");
  }
  return ctx.character.name;
}

/** Per-render extras layered onto the shared option base. All optional. */
interface MacroExtras {
  /** `{{original}}` — the preset Main-Prompt/Jailbreak, threaded ONLY while rendering the two overridable
   *  markers; absent ⇒ `{{original}}` resolves to "". */
  original?: string | undefined;
  /** `{{input}}` override (the in-flight steer / user turn for regex replace-strings). */
  input?: string | undefined;
  /** `{{model}}` — the routing-resolved model id (turn-stage only; the assemble ctx carries none). */
  model?: string | undefined;
  /** `{{chatId}}`. */
  chatId?: ChatId | undefined;
  /** The injectable PRNG seam for `{{random}}`/`{{roll}}`/`{{pick}}` (determinism — D46). Absent ⇒ kit ambient. */
  random?: (() => number) | undefined;
  onWarn?: ((msg: string, err?: unknown) => void) | undefined;
}

/** The ONE AssembleContext → `ProcessMacroOptions` mapping, shared by both `renderMacros` (per-section
 *  render) and `buildTurnMacroContext` (the turn-stage regex/guided context). `persona` decides
 *  `{{user}}`/`{{persona}}` (the dual-persona routing); `env` is the SHARED `variableValues` reference (D46). */
function macroOptionsFor(
  ctx: AssembleContext,
  persona: AssemblePersona | null | undefined,
  extras: MacroExtras = {},
): ProcessMacroOptions {
  const opts: ProcessMacroOptions = {
    char: charForSpeaker(ctx),
    user: persona?.name ?? "User",
    persona: persona?.description ?? "",
    // {{scenario}} = the EFFECTIVE scenario (host room override > card > empty). `ctx.character.scenario`
    // stays intact so the section walk can still report which tier won (assemble.ts `scenario` marker).
    scenario: ctx.roomOverrides?.scenario ?? ctx.character.scenario ?? "",
    // {{group}}/{{charIfNotGroup}}/{{notChar}} — the FULL cast (incl. muted, who still carry lore). Absent
    // cast (hand-built ctx) degrades to the cast-of-one [character] → solo byte-identical.
    cast: (ctx.cast ?? [ctx.character]).map((c) => c.name),
    // {{groupNotMuted}} — the ACTIVE (non-muted) cast; falls back to the full cast, then [character].
    castNotMuted: (ctx.castNotMuted ?? ctx.cast ?? [ctx.character]).map((c) => c.name),
    // Character-field shortcuts ({{description}}/{{personality}}/{{example}}/…) — also visible to regex.
    description: ctx.character.description,
    personality: u(ctx.character.personality),
    exampleMessages: u(ctx.character.exampleMessages),
    charSysInfo: u(ctx.character.systemPrompt),
    charPostHistory: u(ctx.character.postHistoryInstructions),
    // Conversation-derived inputs for {{input}}/{{lastMessage}}/… (undefined → "" in the macro).
    input: extras.input ?? ctx.currentInput,
    lastMessage: ctx.lastMessage,
    lastUserMessage: ctx.lastUserMessage,
    lastCharMessage: ctx.lastCharMessage,
    // Server-injected content for {{compact_summary}}/{{memory}}/{{guided_instruction}}.
    compactSummary: u(ctx.compactSummary),
    memory: u(ctx.memory),
    guidedInstruction: u(ctx.guidedInstruction),
    timezone: ctx.timezone,
    nowMs: ctx.nowMs,
    random: extras.random,
    // env: the SHARED ChoiceBlock variable map (D46 by-reference) — a setvar in one section is visible to
    // the next + to regex replacements within one turn.
    env: ctx.variableValues ?? {},
  };
  setIf(opts, "original", extras.original);
  setIf(opts, "model", extras.model);
  setIf(opts, "chatId", extras.chatId);
  setIf(opts, "onWarn", extras.onWarn);
  // D46 runtime plane: thread the SAME per-assembly op-log (by reference) into every macro context so the
  // mutation handlers record this turn's `{{setvar}}`/`{{incvar}}` ops onto it. Absent ⇒ no recording (a
  // preview/hand-built ctx with no opLog just mutates `env`).
  setIf(opts, "opLog", ctx.opLog);
  return opts;
}

/**
 * Render `{{macros}}` in `text` against the character + the section-appropriate `persona` (pinned for
 * card-derived sections, active for user-authored). `original` is the preset-level Main-Prompt/Jailbreak,
 * threaded only while rendering the two overridable markers (so a card's own system/jailbreak can
 * `{{original}}`-wrap the preset). Pure: one macro pass, no second render (render once).
 */
export function renderMacros(
  text: string,
  ctx: AssembleContext,
  persona: AssemblePersona | null | undefined,
  original?: string,
): string {
  return processMacros(text, macroOptionsFor(ctx, persona, { original }));
}

/**
 * FREEZE the VOLATILE (nondeterministic — clock/PRNG) macros in `text` at COMMIT (Chat-Macro-Resolution.md
 * §0): resolve `{{roll}}/{{random}}/{{pick}}/{{time}}/{{date}}`/… ONCE against the turn's pinned clock
 * (`ctx.nowMs`/`ctx.timezone`) + seeded PRNG (`random`) and bake the value in; IDENTITY macros
 * (`{{char}}/{{user}}/{{persona}}` + name aliases) and everything else pass through RAW (the volatile-only
 * registry has no handler → the evaluator re-emits the source span verbatim) so they stay per-view /
 * resolved-at-read (§2/§4). This is the exact inverse of `renderHistoryMacros`' names-only pass: that one
 * bakes identity and passes volatiles through; this one bakes volatiles and passes identity through. Applied
 * to a user turn's composer text at SEND before the row is persisted (a no-`{{` string is byte-identical
 * passthrough) — the D51 "storage is raw" law now carries the owner-ruled exception that a COMMITTED row's
 * nondeterministic value is frozen, never re-derived.
 */
export function freezeVolatileMacros(
  text: string,
  ctx: AssembleContext,
  args?: { readonly random?: (() => number) | undefined },
): string {
  return processMacros(
    text,
    macroOptionsFor(ctx, ctx.activePersona, { random: args?.random }),
    VOLATILE_ONLY_REGISTRY,
  );
}

/**
 * Resolve `{{char}}`/`{{user}}`/`{{persona}}` in a stored CANON HISTORY row's body — the resolve-on-READ seam
 * mirroring how card fields are already macro-resolved (D26/D51: content is stored raw as a `string`, NEVER
 * mutated; every prompt build re-resolves it here). A thin chat-ctx adapter over `@orb/kit/macro`'s
 * `resolveRowMacros` — THE shared atom server ASSEMBLE (this call site) and client DISPLAY both call, so
 * they cannot diverge (Chat-Macro-Resolution.md §2/§6 — read the doctrine in full before touching this):
 *   • `{{char}}` → a VOICED row (`characterId` set) resolves against `args.producer.characterNamesById` —
 *     the ROW'S OWN speaker, not the current turn's speaker (a past line by Aria stays Aria's even when Kai
 *     is the active speaker), falling back to `args.speakerCharName`. A HUMAN-authored / narrator row
 *     (`characterId === null`) resolves to the CAST (`ctx.cast`, roster order): the joined names in a
 *     multi-character room (== `{{group}}`, ruling B), the one character in solo — matching client DISPLAY.
 *   • `{{user}}`/`{{persona}}` → `stamps.personaId` resolved against `args.producer.personaNamesById` — the
 *     ROW'S OWN author (the PD-100 send-time stamp). A null stamp (a greeting / AI line / legacy row) falls
 *     back to the chat ANCHOR (`ctx.pinnedPersona` = anchor ?? active), NEVER a per-viewer active persona —
 *     so the model (this call) and every human (client DISPLAY) see the SAME `{{user}}` (the design
 *     principle: identity is the row's or the chat anchor's, never the reader's). A stamped row wins.
 * Pure: one macro pass, no framing, no `<speaker>`-tag handling (the parser only touches `{{…}}`; narrator
 * tags pass through verbatim for the downstream `speakerTagsToPlain`).
 */
export function renderHistoryMacros(
  content: string,
  stamps: RowMacroStamps,
  ctx: AssembleContext,
  args: {
    readonly producer: HistoryMacroNames;
    /** The turn's current speaker/cast `{{char}}` default — absent ⇒ `charForSpeaker(ctx)`. */
    readonly speakerCharName?: string | undefined;
  },
): string {
  return resolveRowMacros(content, stamps, {
    characterNamesById: args.producer.characterNamesById,
    personaNamesById: args.producer.personaNamesById,
    speakerCharName: args.speakerCharName ?? charForSpeaker(ctx),
    // Ruling B: a HUMAN-authored / narrator row's `{{char}}` resolves to the CAST (group in multi, one in
    // solo), NOT the arbitrary current speaker — so it matches client DISPLAY. The full cast in roster order.
    cast: (ctx.cast ?? [ctx.character]).map((c) => c.name),
    // Ruling A / the design principle: the null-stamp `{{user}}`/`{{persona}}` fallback is the chat ANCHOR
    // (`pinnedPersona` = anchor ?? active), NEVER a per-viewer active persona — a greeting/AI line then
    // addresses the SAME persona for the model (this call) and every human (client DISPLAY). A stamped row
    // still wins over it (the producer lookup). `pinnedPersona` carries the null-anchor→active fallback.
    fallbackPersonaName: ctx.pinnedPersona?.name,
    fallbackPersonaDescription: ctx.pinnedPersona?.description,
  });
}

/** Which guided actions are PURE `{{input}}` scaffolds — their default templates carry NO standalone
 *  instruction, so with a blank steer they render a dangling `[Take the following into special consideration…: ]`
 *  (F2 / FINAL-Chat-Tab-Redesign risk #17.6: "inject nothing rather than an empty
 *  scaffold"). `impersonate`/`opening` are FALSE: their templates carry standalone instructions that must
 *  fire UNSTEERED (opening's default explicitly supports an unsteered generated opening). Exhaustive over
 *  `GuidedActionKind` (a new action fails `tsc` here until it declares its arm). */
const GUIDED_SCAFFOLD_ONLY_ACTIONS: Record<GuidedActionKind, boolean> = {
  response: true,
  swipe: true,
  continue: true,
  rewrite: true,
  impersonate: false,
  opening: false,
};

/**
 * Resolve a guided-action TEMPLATE against the turn ctx (guided steering, PD-63 routed):
 * the per-action config comes from the preset (`promptConfig.guidedActions`, falling back to the contract
 * defaults); the untrusted steering `input` is macro-NEUTRALIZED by the kit resolver (ZWSP between braces)
 * before it is spliced into `{{input}}`; the rest of the macro context (`{{char}}`/`{{user}}`/`{{persona}}`/…)
 * resolves against the ACTIVE persona (a steer is user-authored — the dual-persona rule). Resolved ONCE;
 * the caller delivers the result via EXACTLY ONE placement (system-marker / depth-0 injection / the
 * `opening` turn prompt) — never re-routed at splice time.
 *
 * `person` threads the guided-impersonate perspective word (`{{person}}`, kit/guided's `opts.person`) —
 * meaningless for every OTHER action's template (none of them carry the token), so callers besides
 * `impersonate` simply omit it and the kit resolver's own `DEFAULT_PERSON` floor applies (a no-op there).
 */
export function resolveGuidedActionText(
  ctx: AssembleContext,
  args: {
    readonly action: GuidedActionKind;
    readonly input: string;
    readonly model?: string | undefined;
    readonly chatId?: ChatId | undefined;
    readonly person?: GuidedImpersonatePerson | undefined;
  },
): string {
  // F2: a scaffold-only action (response/swipe/continue/rewrite) with a blank steer injects NOTHING — its
  // template is a pure `{{input}}` frame, so rendering it empty ships a dangling scaffold to the model. The
  // standalone actions (impersonate/opening) still fire unsteered. This is the SERVER belt (start-chat's
  // `opening` + resolveGuidedSteer both route through here) — it survives any caller that forwards a `guided`.
  if (GUIDED_SCAFFOLD_ONLY_ACTIONS[args.action] && args.input.trim().length === 0) {
    return "";
  }
  const config =
    ctx.promptConfig.guidedActions?.[args.action] ?? DEFAULT_GUIDED_ACTIONS[args.action];
  return resolveGuidedInstruction(
    config.prompt,
    args.input,
    macroOptionsFor(ctx, ctx.activePersona, { model: args.model, chatId: args.chatId }),
    args.person !== undefined ? { person: args.person } : undefined,
  );
}

/**
 * Build the turn-stage `MacroContext` the engine threads through regex execution
 * (USER_INPUT/AI_OUTPUT/REASONING/WORLD_INFO) + guided-instruction resolution. Built ONCE per turn; the
 * SAME object is reused everywhere so live variable state (setvar/addvar) is consistent across the turn.
 * `env` is the SAME map reference as `assembleCtx.variableValues` (D46).
 */
export function buildTurnMacroContext(args: {
  readonly assembleCtx: AssembleContext;
  /** The routing-resolved model id — `{{model}}`, visible to regex replacements. */
  readonly model: string;
  readonly chatId: ChatId;
  /** The in-flight user input (`{{input}}` for USER_INPUT regex replace-strings). */
  readonly input?: string | undefined;
  /** The injectable PRNG seam (determinism — D46). */
  readonly random?: (() => number) | undefined;
  readonly onWarn?: ((msg: string, err?: unknown) => void) | undefined;
}): MacroContext {
  const { assembleCtx } = args;
  return createMacroContext(
    macroOptionsFor(assembleCtx, assembleCtx.activePersona, {
      model: args.model,
      chatId: args.chatId,
      input: args.input,
      random: args.random,
      onWarn: args.onWarn,
    }),
  );
}
