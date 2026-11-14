// The turn gather's call shapes (`assembly/gather.ts`), homed in the contract so `ChatContext` can type the
// bound op without importing `assembly/`.

import type { ChatInjection, GuidedSteer, MacroFreezeRecord, MacroSlice } from "@orb/contracts/chat";
import type { GenerationType } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { MacroRegistry, RandomSource } from "@orb/kit/macro";
import type { IanaTimeZone } from "@orb/kit/time";
import type { ChoicePickMode, TurnMacroContextArgs } from "./assembly-macros.ts";
import type { MemoryRecallInputs } from "./memory.ts";

/** The SEND USER_INPUT regex out-param sink — `buildAssembleContext` writes the post-regex user text
 *  here so the verb persists that. Threaded straight through to the pure core. */
export interface SendRegexSink {
  sendUserText?: string;
  /** The SEND bake's VOLATILE-FREEZE record (D129-F) — written by the pure core beside `sendUserText` so the
   *  verb persists it on the same variant. Absent ⇒ nothing froze. */
  sendMacroFreezes?: MacroFreezeRecord;
  /** The round-level recall inputs for the engine's per-speaker witnessed re-run (D6) — written by
   *  `gatherMemory` (NOT the pure core, which never touches it). `null` ⇒ no character to key on. */
  memoryRecall?: MemoryRecallInputs | null;
}

/** The per-call inputs `ctx.gatherAssembleContext` takes beside the foreign DTO. */
export interface GatherAssembleArgs {
  readonly chatId: ChatId;
  readonly runAsUserId: UserId;
  readonly model: TurnMacroContextArgs["model"];
  readonly characterIds: readonly CharacterId[];
  /** Present seated agents (D60), soul-resolved by `loadRoom`; threaded straight to the pure build core. */

  /** The muted-seat `speakerKey`s from `loadRoom` (character + agent) — the `unmutedCharacters` producer. */
  readonly mutedSpeakerKeys?: ReadonlySet<string> | undefined;
  readonly personaIds: readonly PersonaId[];
  /** The live human driving this turn — the author of the pending row the recall query folds in. Absent/null
   *  ⇒ a turn with no triggering human (drain/auto). */
  readonly triggerUserId?: UserId | null | undefined;
  /** The room seats more than one present human — carried onto the built ctx for SHAPE's name-stamp. */
  readonly multiHuman?: boolean | undefined;
  readonly pendingUserText?: string | undefined;
  readonly sendDraft?: string | undefined;
  /** The one-turn typed steer — threaded to the BUILD, which resolves the action template once and
   *  delivers it via its placement. */
  readonly guided?: GuidedSteer | undefined;
  /** The render PRNG: every `{{random}}`/`{{roll}}`/`{{pick}}` in the build (injections, lore, personas, notes,
   *  steers, the WI-stage macro context) draws from it. A turn passes the live seeded PRNG; a preview passes the
   *  stable preview one. Never ambient `Math.random`. */
  readonly prng: RandomSource;
  /** How ChoiceBlock `randomPick` variables resolve — `random` draws with {@link prng} (a turn), `stable` leaves
   *  the stored value (a preview, so it never varies per poll). Explicit, never derived from `prng`. */
  readonly choicePicks: ChoicePickMode;
  /** The `injection_trigger` gate — maps the driving `TurnKind` → `GenerationType` at the verb so
   *  trigger-gated preset sections fire on the right turn kind. Absent ⇒ "normal". */
  readonly generationType?: GenerationType | undefined;
  /** A game turn's GATHER macros (D58), keyed by the RpgGatherMacros field names — fed to the
   *  pure build as `rpgMacros`; absent ⇒ every rpg macro resolves empty (byte-identical non-game turn). */
  readonly rpgMacros?: Readonly<Record<string, string>> | undefined;
  /** A game turn's `{{expr::…}}` CEL activation (parity-plus §12) — the data-only `{ rpg: <tracker view tree> }`,
   *  threaded verbatim onto the AssembleContext's `celBindings`. Absent ⇒ `{{expr::rpg.…}}` errors-to-"". */
  readonly rpgCelBindings?: Readonly<Record<string, unknown>> | undefined;
  /** The S2 teaching collection's injections (`substrate/teaching.ts`) — every registered contribution's
   *  prose steering for THIS turn, ALREADY origin-stamped by its producer, merged into the chat injection
   *  list (a game turn's depth-0 reminder is recency-biased nearest generation via its `depth:0`). Absent /
   *  empty ⇒ only the chat's own `chat_injections` rows (byte-identical to a turn with nothing teaching). */
  readonly teachingInjections?: readonly ChatInjection[] | undefined;
  /** The per-turn user-macro RENDER + FREEZE registries (WAVE MU) — threaded verbatim to the pure build.
   *  Absent ⇒ the pure build falls back to the process singletons (byte-identical non-user-macro turn). */
  readonly macroRegistry?: MacroRegistry | undefined;
  readonly freezeMacroRegistry?: MacroRegistry | undefined;
  /** The registry build's slice for the assembly trace; absent with the registries. */
  readonly macroTrace?: MacroSlice | undefined;
  /** The zone `{{date}}`/`{{time}}`/`{{weekday}}` read in: the viewer's reported zone, or the caller's ruled
   *  one for a turn with no viewer. Absent ⇒ UTC. */
  readonly timeZone?: IanaTimeZone | undefined;
}
