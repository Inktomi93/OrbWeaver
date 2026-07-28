// domain/chat/assembly/macros — the chat-domain wiring over the pure `@orb/kit/macro` engine. The ONE
// place the macro atom gets fed chat context: `renderMacros` (per-section render), `renderHistoryMacros`
// (canon-row resolver shared by server ASSEMBLE + client DISPLAY), `buildTurnMacroContext` (turn-stage
// regex/guided context). `env` is the SAME `assembleCtx.variableValues` reference across section + turn
// stage, so a `{{setvar}}` is visible everywhere within one turn; `renderHistoryMacros` never threads it.

import type { AssembleCharacter, AssembleContext, AssemblePersona } from "@orb/contracts/chat";
import type { GuidedActionKind, GuidedImpersonatePerson } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS } from "@orb/contracts/preset";
import { resolveGuidedInstruction } from "@orb/kit/guided";
import type { ChatId } from "@orb/kit/ids";
import type { MacroContext, MacroRegistry, ProcessMacroOptions, RowMacroStamps } from "@orb/kit/macro";
import { createMacroContext, createVolatileOnlyRegistry, globalMacroRegistry, processMacros, resolveRowMacros } from "@orb/kit/macro";
import type { RenderMacrosOptions } from "../contract/assembly-macros";
import type { HistoryMacroNames } from "../contract/results";

// Commit-time freeze registry: resolves ONLY the nondeterministic macros ({{roll}}/{{random}}/{{time}}/…),
// re-emitting identity + everything else verbatim. Built once — a per-call rebuild would be pure waste.
const VOLATILE_ONLY_REGISTRY = createVolatileOnlyRegistry();

/** null → undefined (MacroContext fields are `T | undefined`, not `T | null`). */
function u<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined;
}

/** Assign `value` to `target[key]` only when defined (omit, never `undefined`, under
 *  exactOptionalPropertyTypes). */
function setIf<K extends keyof ProcessMacroOptions>(target: ProcessMacroOptions, key: K, value: ProcessMacroOptions[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/** The `{{char}}` binding for a turn: the single character name, or the joined cast names under a `cast`
 *  speaker (narrator mode). A cast-of-one collapses to that one name (no `if(isGroup)`). */
function charForSpeaker(ctx: AssembleContext): string {
  if (ctx.speaker?.kind === "cast") {
    return ctx.speaker.members.map((m) => m.name).join(", ");
  }
  return ctx.character.name;
}

/** The CHARACTER-only slice of the assemble cast — the `{{group}}`/`{{groupNotMuted}}` name feed (owner
 *  ruling): an agent seat voices through the assemble cast but NEVER appears in these macro name lists.
 *  `castMembers` is index-aligned with `cast`; a hand-built ctx with no `castMembers` treats every slot as
 *  a character (solo/legacy degenerate). Muting is orthogonal — the caller passes `cast` or `castNotMuted`. */
function characterCastNames(_ctx: AssembleContext, members: readonly AssembleCharacter[]): string[] {
  return members.map((m) => m.name);
}

/** Per-render extras layered onto the shared option base. All optional. */
interface MacroExtras {
  /** `{{original}}` — the preset Main-Prompt/Jailbreak, threaded only while rendering the two overridable
   *  markers; absent ⇒ resolves to "". */
  original?: string | undefined;
  input?: string | undefined;
  /** The routing-resolved model id (turn-stage only). */
  model?: string | undefined;
  chatId?: ChatId | undefined;
  /** The injectable PRNG seam for `{{random}}`/`{{roll}}`/`{{pick}}`. Absent ⇒ kit ambient. */
  random?: (() => number) | undefined;
  onWarn?: ((msg: string, err?: unknown) => void) | undefined;
}

/** The ONE AssembleContext → `ProcessMacroOptions` mapping, shared by `renderMacros` and
 *  `buildTurnMacroContext`. `persona` decides `{{user}}`/`{{persona}}`; `env` is the shared reference. */
function macroOptionsFor(ctx: AssembleContext, persona: AssemblePersona | null | undefined, extras: MacroExtras = {}): ProcessMacroOptions {
  // {{group}} = every present CHARACTER (muted included, for lore); {{groupNotMuted}} = the pre-filtered
  // character-only-not-muted field, or the full character cast when unset (a hand-built ctx).
  const characterCast = characterCastNames(ctx, ctx.cast ?? [ctx.character]);
  const opts: ProcessMacroOptions = {
    char: charForSpeaker(ctx),
    user: persona?.name ?? "User",
    persona: persona?.description ?? "",
    // {{scenario}} = the EFFECTIVE scenario (host room override > card > empty). `ctx.character.scenario`
    // stays intact so the section walk can still report which tier won (assemble.ts `scenario` marker).
    scenario: ctx.roomOverrides?.scenario ?? ctx.character.scenario ?? "",
    // {{group}} = the CHARACTER cast (incl. muted, who still carry lore), agents excluded (owner ruling).
    // {{groupNotMuted}} reads the pre-filtered character-only-not-muted field; absent ⇒ the full character cast.
    cast: characterCast,
    castNotMuted: ctx.castNotMuted !== undefined ? ctx.castNotMuted.map((c) => c.name) : characterCast,
    description: ctx.character.description,
    personality: u(ctx.character.personality),
    exampleMessages: u(ctx.character.exampleMessages),
    charSysInfo: u(ctx.character.systemPrompt),
    charPostHistory: u(ctx.character.postHistoryInstructions),
    input: extras.input ?? ctx.currentInput,
    lastMessage: ctx.lastMessage,
    lastUserMessage: ctx.lastUserMessage,
    lastCharMessage: ctx.lastCharMessage,
    compactSummary: u(ctx.compactSummary),
    memory: u(ctx.memory),
    databank: u(ctx.databank),
    guidedInstruction: u(ctx.guidedInstruction),
    timezone: ctx.timezone,
    nowMs: ctx.nowMs,
    random: extras.random,
    // Shared ChoiceBlock variable map by reference — a setvar in one section is visible to the next.
    env: ctx.variableValues ?? {},
  };
  setIf(opts, "original", extras.original);
  setIf(opts, "model", extras.model);
  setIf(opts, "chatId", extras.chatId);
  setIf(opts, "onWarn", extras.onWarn);
  // Thread the same per-assembly op-log by reference so mutation handlers record this turn's ops onto it.
  setIf(opts, "opLog", ctx.opLog);
  return opts;
}

/**
 * Render `{{macros}}` in `text` against the character + the section-appropriate `persona` (pinned for
 * card-derived sections, active for user-authored). `original` is the preset Main-Prompt/Jailbreak,
 * threaded only while rendering the two overridable markers.
 */
export function renderMacros(text: string, ctx: AssembleContext, persona: AssemblePersona | null | undefined, opts: RenderMacrosOptions = {}): string {
  return processMacros(text, macroOptionsFor(ctx, persona, { original: opts.original }), opts.registry ?? globalMacroRegistry);
}

/**
 * Freeze the volatile (nondeterministic — clock/PRNG) macros in `text` at commit: resolve
 * `{{roll}}/{{random}}/{{pick}}/{{time}}/{{date}}`/… once against the turn's pinned clock + seeded PRNG
 * and bake the value in; identity macros (`{{char}}/{{user}}/{{persona}}`) pass through raw so they stay
 * resolved-at-read. Exact inverse of `renderHistoryMacros`' names-only pass. Applied to a user turn's
 * composer text at send, before the row is persisted.
 */
export function freezeVolatileMacros(
  text: string,
  ctx: AssembleContext,
  args?: { readonly random?: (() => number) | undefined; readonly registry?: MacroRegistry | undefined },
): string {
  // The per-turn FREEZE registry (WAVE MU — volatile-only + user macros) when supplied; absent ⇒ the
  // process `VOLATILE_ONLY_REGISTRY` (byte-identical — user-macro tokens pass through verbatim).
  return processMacros(text, macroOptionsFor(ctx, ctx.activePersona, { random: args?.random }), args?.registry ?? VOLATILE_ONLY_REGISTRY);
}

/**
 * Resolve `{{char}}`/`{{user}}`/`{{persona}}` in a stored canon history row's body — the resolve-on-read
 * seam, re-run on every prompt build (content is stored raw, never mutated). A thin chat-ctx adapter over
 * `@orb/kit/macro`'s `resolveRowMacros` — the shared atom server ASSEMBLE and client DISPLAY both call, so
 * they cannot diverge:
 *   - `{{char}}` on a voiced row resolves to the ROW'S OWN speaker (not the current turn's speaker); a
 *     human/narrator row resolves to the cast (roster order), matching client DISPLAY.
 *   - `{{user}}`/`{{persona}}` resolve against the row's own persona stamp; a null stamp falls back to the
 *     chat anchor persona, never a per-viewer active persona, so model and every human see the same value.
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

/** Which guided actions are pure `{{input}}` scaffolds — a blank steer would render a dangling scaffold.
 *  `impersonate`/`opening` carry standalone instructions that must fire unsteered. Exhaustive over
 *  `GuidedActionKind` (a new action fails `tsc` here until it declares its arm). */
const GUIDED_SCAFFOLD_ONLY_ACTIONS: Record<GuidedActionKind, boolean> = {
  response: true,
  swipe: true,
  continue: true,
  rewrite: true,
  impersonate: false,
  opening: false,
  // Greeting-studio kinds (audit §3) — authoring-time card verbs, NEVER routed through this chat-turn
  // resolver; listed only to keep the Record exhaustive over GuidedActionKind. `true` is the safe classing
  // (their templates are `{{input}}`/`{{base}}` frames), but this arm is unreachable for these kinds.
  // biome-ignore-start lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
  greeting_rewrite: true,
  greeting_new: true,
  // biome-ignore-end lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
};

/**
 * Resolve a guided-action template against the turn ctx: per-action config from the preset, falling back
 * to the contract defaults; the untrusted steering `input` is macro-neutralized by the kit resolver before
 * splicing into `{{input}}`; the rest resolves against the active persona. Resolved once; the caller
 * delivers the result via exactly one placement, never re-routed at splice time.
 */
export function resolveGuidedActionText(
  ctx: AssembleContext,
  args: {
    readonly action: GuidedActionKind;
    readonly input: string;
    readonly model?: string | undefined;
    readonly chatId?: ChatId | undefined;
    readonly person?: GuidedImpersonatePerson | undefined;
    /** The per-turn user-macro registry (WAVE MU) when the guided template references a user macro; absent
     *  ⇒ the process `globalMacroRegistry` (byte-identical). */
    readonly registry?: MacroRegistry | undefined;
  },
): string {
  // A scaffold-only action with a blank steer injects nothing (its template is a pure {{input}} frame,
  // so rendering it empty ships a dangling scaffold to the model). impersonate/opening still fire unsteered.
  if (GUIDED_SCAFFOLD_ONLY_ACTIONS[args.action] && args.input.trim().length === 0) {
    return "";
  }
  const config = ctx.promptConfig.guidedActions?.[args.action] ?? DEFAULT_GUIDED_ACTIONS[args.action];
  return resolveGuidedInstruction(config.prompt, args.input, macroOptionsFor(ctx, ctx.activePersona, { model: args.model, chatId: args.chatId }), {
    ...(args.person !== undefined ? { person: args.person } : {}),
    ...(args.registry !== undefined ? { registry: args.registry } : {}),
  });
}

/**
 * Build the turn-stage `MacroContext` the engine threads through regex execution + guided-instruction
 * resolution. Built once per turn and reused everywhere so live variable state stays consistent.
 */
export function buildTurnMacroContext(args: {
  readonly assembleCtx: AssembleContext;
  readonly model: string;
  readonly chatId: ChatId;
  readonly input?: string | undefined;
  readonly random?: (() => number) | undefined;
  readonly onWarn?: ((msg: string, err?: unknown) => void) | undefined;
  /** The per-turn user-macro registry (WAVE MU) — the turn-stage regex/guided context resolves user macros
   *  against it; absent ⇒ the process `globalMacroRegistry` (byte-identical). */
  readonly registry?: MacroRegistry | undefined;
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
    args.registry ?? globalMacroRegistry,
  );
}
