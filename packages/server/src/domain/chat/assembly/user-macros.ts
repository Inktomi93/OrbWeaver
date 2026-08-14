// domain/chat/assembly/user-macros — the chat-domain wiring over the pure `@orb/kit/macro` user-macro
// engine (WAVE MU delivery). Builds the PER-TURN macro registry the section walk + turn-stage macro ctx
// render against, resolving the preset/game-authored macro defs' typed inputs ONCE per turn against the
// per-chat values bag + the frozen draws, and reporting the effective draw record the engine persists.
//
// Why per-turn (kit forbids the singleton): `registerUserMacros` composes handler CLOSURES that capture
// this turn's resolved input bindings — one user's macros can never leak into another's evaluation, so the
// registry is a fresh `createDefaultRegistry()` per turn. It rides `TurnPrep` (server-only), NEVER the
// serializable `AssembleContext` (a client-imported contract shape).
//
// TWO AUTHORING HOMES, ONE TURN: defs come from the
// active preset (`promptConfig.userMacros`) AND from the game (`rpg_games.config.userMacros`, delivered by
// the injected `ChatRpgOps.resolveUserMacros` — never a sideways import). On a name clash the GAME wins
// (specific-over-general, the `roomOverrides` precedent) — `substrate/user-macros::shadowPresetUserMacros`
// (the ONE home for that rule, shared with the picks-pane read) drops the preset's def BEFORE
// resolution/registration, so the shadow is a decision, not kit's first-wins refusal.
//
// Determinism: inputs resolve in GAME-defs order → surviving-PRESET-defs order → declared-input order, so
// the injected PRNG's draw sequence is stable (the document-order draw invariant). Frozen draws (a
// swipe/continue replaying a prior turn) win byte-exact; fresh draws ride `deps.prng` and are reported for
// the commit drain. The draw record keys by macro NAME (as the picks bag does), so a shadow inherits the
// prior turn's frozen draw for the same name — one question per name, whoever owns it this turn.

import type { UserMacroDraws } from "@orb/contracts/chat";
import type { MacroRegistry, RejectedUserMacro, UserMacroDef } from "@orb/kit/macro";
import { createDefaultRegistry, createVolatileOnlyRegistry, registerUserMacros, resolveUserMacroInputs } from "@orb/kit/macro";
import type { BuildTurnUserMacrosArgs, TurnUserMacros, UserMacroDefGroup } from "../contract/assembly-macros.ts";
import { shadowPresetUserMacros } from "../substrate/user-macros.ts";

/** One source group's registration onto BOTH registries (the same defs + the same bindings, so the section
 *  walk and the freeze bake resolve identically). Reports the RENDER registry's refusals — a genuine
 *  authoring error (a bad name, or a builtin clash); the volatile-only freeze registry carries fewer
 *  builtins, so ITS refusal set would under-report. The ruled preset↔game shadow was already applied by
 *  {@link shadowPresetUserMacros} and never surfaces here as a rejection. */
function registerGroup(
  registries: { readonly render: MacroRegistry; readonly freeze: MacroRegistry },
  group: UserMacroDefGroup,
  kind: "preset" | "game",
  inputBindings: Readonly<Record<string, Record<string, string>>>,
): readonly RejectedUserMacro[] {
  const opts = { source: { kind, id: group.id } as const, inputBindings };
  const { rejected } = registerUserMacros(registries.render, group.defs, opts);
  registerUserMacros(registries.freeze, group.defs, opts);
  return rejected;
}

/** Build the per-turn user-macro registry pair + the effective draw record over the turn's EFFECTIVE def set
 *  (the game's defs, then the preset defs they don't shadow). Returns `null` when that set is empty — the
 *  byte-identical fast path: callers thread nothing and every render seam falls back to the process
 *  `globalMacroRegistry`/`VOLATILE_ONLY_REGISTRY` singletons (zero per-turn allocation). */
export function buildTurnUserMacros(args: BuildTurnUserMacrosArgs): TurnUserMacros | null {
  const gameDefs = args.game?.defs ?? [];
  const presetDefs = shadowPresetUserMacros(args.preset.defs, gameDefs);
  if (gameDefs.length === 0 && presetDefs.length === 0) {
    return null;
  }
  // Resolve every EFFECTIVE macro's typed inputs ONCE — the bindings the handlers splice + the draw record.
  // A shadowed preset def is resolved NOT AT ALL: it never renders, so drawing for it would consume the
  // turn's prng and write a ghost entry into the persisted record for a macro nothing can reference.
  const inputBindings: Record<string, Record<string, string>> = {};
  const draws: UserMacroDraws = {};
  for (const def of [...gameDefs, ...presetDefs]) {
    resolveDefInputs(def, args, inputBindings, draws);
  }

  const registry = createDefaultRegistry();
  const freezeRegistry = createVolatileOnlyRegistry();
  const registries = { render: registry, freeze: freezeRegistry };
  // GAME FIRST — kit refuses a name already registered, so registration order IS the precedence (the
  // shadow filter above already removed the preset defs this would otherwise refuse).
  const rejected = [
    ...(args.game !== undefined ? registerGroup(registries, args.game, "game", inputBindings) : []),
    ...registerGroup(registries, { id: args.preset.id, defs: presetDefs }, "preset", inputBindings),
  ];

  return { registry, freezeRegistry, draws, rejected };
}

/** One def's input resolution + its draw-record contribution (hoisted so the builder stays flat). */
function resolveDefInputs(
  def: UserMacroDef,
  args: BuildTurnUserMacrosArgs,
  inputBindings: Record<string, Record<string, string>>,
  draws: UserMacroDraws,
): void {
  const frozenForMacro = args.frozenDraws?.[def.name];
  const resolved = resolveUserMacroInputs(def.inputs, args.values[def.name] ?? {}, {
    prng: args.prng,
    ...(frozenForMacro !== undefined ? { frozenDraws: frozenForMacro } : {}),
  });
  inputBindings[def.name] = resolved.bindings;
  // The EFFECTIVE record = the frozen draws we replayed (still in force) ∪ the fresh draws made now. A
  // random-pick input that replayed contributes its frozen value; one drawn fresh contributes the new
  // value; a non-random input contributes nothing. Self-contained, so a swipe-of-a-swipe reads one record.
  const macroDraws: Record<string, string> = { ...(frozenForMacro ?? {}), ...resolved.draws };
  if (Object.keys(macroDraws).length > 0) {
    draws[def.name] = macroDraws;
  }
}
