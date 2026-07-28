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

/** The inputs to `buildTurnUserMacros` — the per-turn user-macro registry build (WAVE MU delivery). */
export interface BuildTurnUserMacrosArgs {
  /** The active preset/game's authored macro defs (`foreign.promptConfig.userMacros`). */
  readonly defs: readonly UserMacroDef[];
  /** Source attribution stamped onto each macro's browser metadata — the resolved preset id (`MacroSourceRef`). */
  readonly sourceId: string;
  /** The per-chat/per-user input picks bag — macro name → input name → pick. `{}` is fully functional
   *  (unpicked inputs resolve their per-kind defaults; a random-pick pool falls back to ALL options). */
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
