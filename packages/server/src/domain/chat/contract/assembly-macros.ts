// domain/chat/contract/assembly-macros — the exported SHAPES the assembly macro-render seam produces/consumes
// (WAVE MU user-macro delivery + the render-knob bag). `types-in-contract` (§7.4) forbids an exported
// interface outside `contract/`, so these live here rather than file-local in `assembly/macros.ts` /
// `assembly/user-macros.ts` (the `contract/macro-ids.ts` precedent — the same §7.4 move).

import type { UserMacroDraws } from "@orb/contracts/chat";
import type { UserMacroValues } from "@orb/contracts/preset";
import type { MacroRegistry, RejectedUserMacro, UserMacroDef } from "@orb/kit/macro";

/** Per-render knobs for `renderMacros`. `original` is the preset Main-Prompt/Jailbreak (the two overridable
 *  markers only); `registry` is the per-turn user-macro registry (WAVE MU) — absent ⇒ the process
 *  `globalMacroRegistry` (byte-identical). An options bag (not positional) keeps the arity under the 4-param
 *  cap while both knobs stay optional. */
export interface RenderMacrosOptions {
  readonly original?: string | undefined;
  readonly registry?: MacroRegistry | undefined;
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
