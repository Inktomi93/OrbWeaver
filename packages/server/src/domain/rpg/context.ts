// domain/rpg — the ctx BUILDER: assembles `RpgContext` (db + injected clock + id mints + the staging singleton
// + the five injected cross-feature ops + the dice CSPRNG) for the verbs to close over. The injected ops
// (`getMembership`/`setPointer`/`resolveParticipants`/`postNarratorMessage`/`resolveStateDelivery`) flow IN from
// the composition root — rpg declares their SHAPE (contract/service.ts) and closes over them, never reaching
// sideways into chat/connection (§2 one-directional flow). The bundle's TYPE is the explicit `RpgContext`
// interface in `contract/service.ts` (no `ReturnType<>` — the `no-context-returntype` gate).

import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RpgRoundsAssemblyDeps, RpgRoundsDeps } from "./contract/rounds.ts";
import type { RpgAssemblyContext, RpgContext } from "./contract/service.ts";

export function createRpgContext(deps: RpgAssemblyContext): RpgContext {
  return { ...deps, db: databaseForOwner(deps.db) };
}

/** Round closures borrow the same physical connection without exposing it at entry. */
export function createRpgRoundsContext(deps: RpgRoundsAssemblyDeps): RpgRoundsDeps {
  return { ...deps, db: databaseForOwner(deps.db) };
}
