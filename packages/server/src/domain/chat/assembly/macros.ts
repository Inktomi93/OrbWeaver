// domain/chat/assembly/macros — the chat-domain wiring over the pure `@orb/kit/macro` engine ("chat
// orchestrates the pure kit engines, owns the order, not the engines"). This is the ONE place the macro
// ATOM gets fed chat context. Two constructions,
// co-located so both the section walk (assemble.ts) AND the WI matcher (world-info consumers in
// context.ts) import ONE renderer instead of reaching back into assemble.ts (a circular import):
//
//   • `renderMacros(text, ctx, persona, original?)` — the ASSEMBLE-stage renderer: a pure
//     AssembleContext → processMacros mapping. {{user}}/{{persona}} resolve against the section-
//     appropriate persona (pinned for card-derived sections, active for user-authored — the
//     dual-persona rule); `original` threads the preset Main-Prompt/Jailbreak into the two overridable
//     markers so a card can {{original}}-wrap the preset.
//   • `buildTurnMacroContext(args)` — the TURN-stage `MacroContext` the engine threads through regex
//     execution (USER_INPUT/AI_OUTPUT/REASONING/WORLD_INFO) + guided-instruction resolution.
//
// D46 (env-by-reference): BOTH constructions point `env` at the SAME `assembleCtx.variableValues` map
// reference, so a `{{setvar}}` in a rendered section is visible to a later section AND to a regex
// replacement within one turn (and vice versa). There is exactly ONE env per turn — owned here.
//
// Determinism (testing §3 / D46): the clock seam is `nowMs`/`timezone` (no ambient `Date.now()` reaches
// the macro engine — it reads `ctx.nowMs`); the PRNG seam is the optional `random` passed through to the
// kit engine's injectable `ctx.random` (absent ⇒ the kit's ambient `Math.random`). The chat path pins
// both via the immutable turn ctx so a re-render is byte-identical.

import type { AssembleContext, AssemblePersona } from "@orb/contracts/chat";
import type { GuidedActionKind } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS } from "@orb/contracts/preset";
import { resolveGuidedInstruction } from "@orb/kit/guided";
import type { ChatId } from "@orb/kit/ids";
import type { MacroContext, ProcessMacroOptions } from "@orb/kit/macro";
import { createMacroContext, processMacros } from "@orb/kit/macro";

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

/** The {{char}} binding for a turn: the single character name normally, OR the joined cast names under a
 *  `cast` speaker (narrator mode — Part III §7/§8). A cast-of-one collapses to that one name, so single /
 *  per-speaker / solo are byte-identical (no `if(isGroup)`). The kit engine resolves {{char}} from
 *  `MacroContext.char`; this is the ONE place that maps the speaker arm to it. */
function charForSpeaker(ctx: AssembleContext): string {
  if (ctx.speaker?.kind === "cast") {
    return ctx.speaker.members.map((m) => m.name).join(", ");
  }
  return ctx.character.name;
}

/** Per-render extras layered onto the shared option base. All optional. */
interface MacroExtras {
  /** {{original}} — the preset Main-Prompt/Jailbreak, threaded ONLY while rendering the two overridable
   *  markers; absent ⇒ {{original}} resolves to "". */
  original?: string | undefined;
  /** {{input}} override (the in-flight steer / user turn for regex replace-strings). */
  input?: string | undefined;
  /** {{model}} — the routing-resolved model id (turn-stage only; the assemble ctx carries none). */
  model?: string | undefined;
  /** {{chatId}}. */
  chatId?: ChatId | undefined;
  /** The injectable PRNG seam for {{random}}/{{roll}}/{{pick}} (determinism — D46). Absent ⇒ kit ambient. */
  random?: (() => number) | undefined;
  onWarn?: ((msg: string, err?: unknown) => void) | undefined;
}

/** The ONE AssembleContext → `ProcessMacroOptions` mapping, shared by both `renderMacros` (per-section
 *  render) and `buildTurnMacroContext` (the turn-stage regex/guided context). `persona` decides
 *  {{user}}/{{persona}} (the dual-persona routing); `env` is the SHARED `variableValues` reference (D46). */
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
    // Run-environment + determinism seams.
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
 * Resolve a guided-action TEMPLATE against the turn ctx (guided steering, PD-63 routed):
 * the per-action config comes from the preset (`promptConfig.guidedActions`, falling back to the contract
 * defaults); the untrusted steering `input` is macro-NEUTRALIZED by the kit resolver (ZWSP between braces)
 * before it is spliced into `{{input}}`; the rest of the macro context ({{char}}/{{user}}/{{persona}}/…)
 * resolves against the ACTIVE persona (a steer is user-authored — the dual-persona rule). Resolved ONCE;
 * the caller delivers the result via EXACTLY ONE placement (system-marker / depth-0 injection / the
 * `opening` turn prompt) — never re-routed at splice time.
 */
export function resolveGuidedActionText(
  ctx: AssembleContext,
  args: {
    readonly action: GuidedActionKind;
    readonly input: string;
    readonly model?: string | undefined;
    readonly chatId?: ChatId | undefined;
  },
): string {
  const config =
    ctx.promptConfig.guidedActions?.[args.action] ?? DEFAULT_GUIDED_ACTIONS[args.action];
  return resolveGuidedInstruction(
    config.prompt,
    args.input,
    macroOptionsFor(ctx, ctx.activePersona, { model: args.model, chatId: args.chatId }),
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
  /** The routing-resolved model id — {{model}}, visible to regex replacements. */
  readonly model: string;
  readonly chatId: ChatId;
  /** The in-flight user input ({{input}} for USER_INPUT regex replace-strings). */
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
