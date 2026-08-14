// domain/chat/substrate/user-macros — the user-macro DECLARATION-SET policy: how the chat's two authoring
// homes (the active preset's `promptConfig.userMacros` and the game's `rpg_games.config.userMacros`)
// combine into the ONE effective set. The `substrate/variables.ts` sibling for the other knob
// family — a pure rule with TWO consumers that must never diverge: the per-turn registry build
// (`assembly/user-macros.ts`) and the picks-pane read (`verbs/chat-lifecycle.ts::getUserMacroPicks`). It
// lives in substrate/ because a verb reaches a named subsystem only through this slot, and because a pane
// that asked about a def the turn no longer resolves would be a lie.

/** THE COLLISION POLICY — the game's def SHADOWS the preset's on a name clash.
 *  Specific-over-general, the `roomOverrides` precedent: a game is the narrower authoring home, so a game
 *  that redefines `{{mood}}` gets its own definition, not a refusal. Returns the preset defs that SURVIVE.
 *
 *  Applied BEFORE registration (rather than leaning on kit's first-wins refusal) so the shadow is a ruled
 *  DECISION: the dropped def never reports as an authoring error, and never resolves its inputs (no prng
 *  consumption, no ghost draw record for a macro nothing can reference).
 *
 *  Case-insensitive, because the registry's lookup is: matching by exact bytes would let a preset `{{Mood}}`
 *  "survive" the shadow and then be REFUSED at registration — turning a ruled override into a silent error.
 *
 *  Generic over the def shape: the turn threads kit `UserMacroDef`s, the pane threads contracts
 *  `UserMacroSpec`s, and the rule reads only `name` — one home, both callers, no re-spelling. */
export function shadowPresetUserMacros<T extends { readonly name: string }>(
  presetDefs: readonly T[],
  gameDefs: readonly { readonly name: string }[],
): readonly T[] {
  if (gameDefs.length === 0) {
    return presetDefs;
  }
  const shadowed = new Set(gameDefs.map((def) => def.name.toLowerCase()));
  return presetDefs.filter((def) => !shadowed.has(def.name.toLowerCase()));
}
