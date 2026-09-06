// op: resolvePersonasForParticipants — the ROOM-plane persona read (the multi-human resolution widening). A
// STANDALONE compose-built factory, NOT a `PersonaService` verb: it takes NO Principal (the `ExtractQuiet` /
// `postNarratorMessage` Principal-less precedent), because the room's assembly is a room-plane read under
// the frozen host (D106/D19) and no single Principal can speak for every human whose persona the room
// consumes. Never tRPC — the only caller is the composition root's `resolveForeignInputs`.
//
// The consent rule + why the gate rides IN the params: `contract/ops.ts`. A read: no audit, no writes.

import type { PersonaContext } from "../context.ts";
import type { ResolvePersonasForParticipants } from "../contract/ops.ts";
import { loadPersonasForOwners } from "../persistence/queries.ts";

export function createResolvePersonasForParticipants(ctx: PersonaContext): ResolvePersonasForParticipants {
  return async ({ personaIds, allowedOwnerIds }) => {
    // Dedup both sides: the room hands us its anchor + every present human's active persona (the same id
    // can appear twice when two pointers agree), and the same human can hold only one seat but the caller
    // is not required to prove it.
    const rows = await loadPersonasForOwners(ctx.db, [...new Set(personaIds)], [...new Set(allowedOwnerIds)]);
    return new Map(rows.map((row) => [row.id, row]));
  };
}
