// domain/rpg — the ctx BUILDER: assembles `RpgContext` (db + injected clock + id mints + the staging singleton
// + the five injected cross-feature ops + the dice CSPRNG) for the verbs to close over. The injected ops
// (`getMembership`/`setPointer`/`resolveRoster`/`postNarratorMessage`/`resolveStateDelivery`) flow IN from
// the composition root — rpg declares their SHAPE (contract/service.ts) and closes over them, never reaching
// sideways into chat/connection (§2 one-directional flow). The bundle's TYPE is the explicit `RpgContext`
// interface in `contract/service.ts` (no `ReturnType<>` — the `no-context-returntype` gate).

import type { RpgContext, RpgContextDeps } from "./contract/service";

export function createRpgContext(deps: RpgContextDeps): RpgContext {
  return deps;
}
