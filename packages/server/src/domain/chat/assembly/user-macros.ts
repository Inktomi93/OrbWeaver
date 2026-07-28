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
// Determinism: inputs resolve in DEFS order → declared-input order, so the injected PRNG's draw sequence is
// stable (the document-order draw invariant). Frozen draws (a swipe/continue replaying a prior turn) win
// byte-exact; fresh draws ride `deps.prng` and are reported for the commit drain.

import type { UserMacroDraws } from "@orb/contracts/chat";
import { createDefaultRegistry, createVolatileOnlyRegistry, registerUserMacros, resolveUserMacroInputs } from "@orb/kit/macro";
import type { BuildTurnUserMacrosArgs, TurnUserMacros } from "../contract/assembly-macros";

/** Build the per-turn user-macro registry pair + the effective draw record. Returns `null` when `defs` is
 *  empty — the byte-identical fast path: callers thread nothing and every render seam falls back to the
 *  process `globalMacroRegistry`/`VOLATILE_ONLY_REGISTRY` singletons (zero per-turn allocation). */
export function buildTurnUserMacros(args: BuildTurnUserMacrosArgs): TurnUserMacros | null {
  if (args.defs.length === 0) {
    return null;
  }
  // Resolve every macro's typed inputs ONCE — the bindings the handlers splice + the effective draw record.
  const inputBindings: Record<string, Record<string, string>> = {};
  const draws: UserMacroDraws = {};
  for (const def of args.defs) {
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

  const opts = { source: { kind: "preset", id: args.sourceId } as const, inputBindings };
  const registry = createDefaultRegistry();
  const registration = registerUserMacros(registry, args.defs, opts);
  const freezeRegistry = createVolatileOnlyRegistry();
  registerUserMacros(freezeRegistry, args.defs, opts);

  return { registry, freezeRegistry, draws, rejected: registration.rejected };
}
