// domain/chat/contract/assembly-macros — the exported SHAPES the assembly macro-render seam produces/consumes
// (WAVE MU user-macro delivery + the render-knob bag). `types-in-contract` (§7.4) forbids an exported
// interface outside `contract/`, so these live here rather than file-local in `assembly/macros.ts` /
// `assembly/user-macros.ts` (the `contract/macro-ids.ts` precedent — the same §7.4 move).

import type { AssembleContext, UserMacroDraws } from "@orb/contracts/chat";
import type { UserMacroValues } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import type { MacroFreeze, MacroRegistry, RejectedUserMacro, UserMacroDef } from "@orb/kit/macro";

const CHOICE_PICK_MODES = ["random", "stable"] as const;
/** How a ChoiceBlock `randomPick` variable resolves: `random` draws one of the stored values from the gather's PRNG
 *  (a turn); `stable` leaves the stored value as is, so a preview or an aux build reads the same on every poll. Chosen
 *  by the caller, never inferred from whether a PRNG was passed. */
export type ChoicePickMode = (typeof CHOICE_PICK_MODES)[number];

/** What every section, lore and persona render reads besides the assemble ctx: the per-turn user-macro registry
 *  (WAVE MU) and the turn PRNG every `{{random}}`/`{{roll}}`/`{{pick}}` draw rides. One bag, so the walk threads a
 *  single value and no render can fall back to kit's ambient `Math.random`. */
export interface MacroRenderEnv {
  readonly registry: MacroRegistry;
  readonly random: () => number;
}

/** Per-render knobs for `renderMacros`. `original` is the preset Main-Prompt/Jailbreak (the two overridable
 *  markers only); `registry` is the per-turn user-macro registry (WAVE MU) — absent ⇒ the process
 *  `globalMacroRegistry` (byte-identical); `random` is the turn PRNG and is required. An options bag (not
 *  positional) keeps the arity under the 4-param cap. */
export interface RenderMacrosOptions {
  readonly original?: string | undefined;
  readonly registry?: MacroRegistry | undefined;
  readonly random: () => number;
}

/** The inputs to `buildTurnMacroContext` — the turn-stage regex/guided macro context, built once per turn. */
export interface TurnMacroContextArgs {
  readonly assembleCtx: AssembleContext;
  readonly model: string;
  readonly chatId: ChatId;
  readonly input?: string | undefined;
  /** The turn PRNG (`ChatContext.prng`) every `{{random}}`/`{{roll}}`/`{{pick}}` draw rides; required so no draw
   *  reaches kit's ambient fallback. */
  readonly random: () => number;
  readonly onWarn?: ((msg: string, err?: unknown) => void) | undefined;
  /** The per-turn user-macro registry (WAVE MU) — the turn-stage regex/guided context resolves user macros
   *  against it; absent ⇒ the process `globalMacroRegistry` (byte-identical). */
  readonly registry?: MacroRegistry | undefined;
}

/** The inputs to `freezeVolatileMacros` — the commit-time volatile bake. */
export interface FreezeVolatileMacrosArgs {
  /** The turn PRNG the bake draws from, so a committed row's baked value is deterministic and replayable. */
  readonly random: () => number;
  /** The per-turn FREEZE registry (WAVE MU); absent ⇒ the process volatile-only registry. */
  readonly registry?: MacroRegistry | undefined;
  /** The caller's sink for the record of what this bake froze (D129-F). */
  readonly freezes?: MacroFreeze[] | undefined;
  /** A PRIOR record to REPLAY (D129-F freeze-at-selection): matched occurrences reproduce their stored value
   *  instead of drawing, so re-freezing an already-frozen body is byte-identical and consumes no entropy. */
  readonly frozenMacros?: readonly MacroFreeze[] | undefined;
}

/** ONE authoring home's macro defs + the id its source attribution carries (`MacroSourceRef.id` — the
 *  resolved preset id for the preset group, the game's chat id for the game group). */
export interface UserMacroDefGroup {
  readonly id: string;
  readonly defs: readonly UserMacroDef[];
}

/** The inputs to `buildTurnUserMacros` — the per-turn user-macro registry build (WAVE MU delivery). The two
 *  authoring homes (owner ruling #20) ride SEPARATE groups rather than one pre-merged list: the collision
 *  policy is law, not a caller's choice, so `buildTurnUserMacros` owns it (see its header). */
export interface BuildTurnUserMacrosArgs {
  /** The active preset's authored macro defs (`foreign.promptConfig.userMacros`) + the resolved preset id. */
  readonly preset: UserMacroDefGroup;
  /** The GAME's authored macro defs (`rpg_games.config.userMacros`, via `ChatRpgOps.resolveUserMacros`) +
   *  the game's chat id. Absent ⇒ a non-game chat (byte-identical to preset-only). */
  readonly game?: UserMacroDefGroup | undefined;
  /** The turn AUTHOR's PLUGIN macros, already resolved to values by the plugin
   *  plane (`ChatContext.pluginMacros`). A THIRD authoring home, and the only one whose names are HOST-assigned
   *  (`plugin_<slug'>_<name>`), which is why it needs no shadow policy: it cannot collide with a builtin, and a
   *  preset/game def that deliberately spells the same name simply wins by registering first. Absent ⇒ a chat
   *  with no plugin macros, byte-identical to preset+game only. */
  readonly plugin?: UserMacroDefGroup | undefined;
  /** The per-chat input picks bag — macro NAME → input name → pick. `{}` is fully functional (unpicked
   *  inputs resolve their per-kind defaults; a random-pick pool falls back to ALL options). Keyed by NAME,
   *  never by source: a pick made while the PRESET owned `{{mood}}` keeps applying when a game def shadows
   *  it (same name, same input name ⇒ the same answer — the pane asks one question per name). */
  readonly values: UserMacroValues;
  /** The slot's persisted draw record on a swipe/continue turn (`loadSlotTarget.macroDraws`) — replayed
   *  byte-exact so a re-generation resolves the identical draw. Absent ⇒ a fresh-draw turn. */
  readonly frozenDraws?: UserMacroDraws | undefined;
  /** The seeded turn PRNG (`deps.prng`) — fresh random-pick draws ride it; NEVER ambient entropy. */
  readonly prng: () => number;
}

/** The `buildTurnUserMacros` product — the per-turn registry pair + the effective draw record + refusals. */
export interface TurnUserMacros {
  /** The per-turn RENDER registry: `createDefaultRegistry()` + the accepted defs (input bindings baked in). */
  readonly registry: MacroRegistry;
  /** The per-turn FREEZE registry: `createVolatileOnlyRegistry()` + the same defs/bindings — the SEND
   *  volatile bake + greeting freeze resolve user macros in composer/greeting text against the SAME
   *  bindings the section walk sees (one input resolution per turn). */
  readonly freezeRegistry: MacroRegistry;
  /** The EFFECTIVE draw record (frozen ∪ fresh) the engine persists onto every committed variant. */
  readonly draws: UserMacroDraws;
  /** Refused defs (name collision / bad name) — the caller logs these loud at turn time (D53); the
   *  authoring surface (preset editor macro-browser) is the primary error UI. */
  readonly rejected: readonly RejectedUserMacro[];
}
