// verb: reviewImport — the read-only half of the profile import's per-collision ask. It answers with the
// SAME identity rules the bulk write applies (`findDuplicatePersona`, then `findNameCollision`), so the
// review can never list a persona the write would reuse, nor miss one it would split.

import type { PersonaCollision } from "@orb/contracts/import";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { nextFreeName } from "@orb/kit/strings";
import { differingPersonaFields, findDuplicatePersona, findNameCollision, foldPersonaName, personaPlacementOf } from "#kit/serde/persona";
import type { PersonaContext } from "../context.ts";
import type { ReviewPersonaImportParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";
import { loadOwnedPersonaCandidates } from "../persistence/queries.ts";

export function createReviewImport(ctx: PersonaContext): PersonaService["reviewImport"] {
  return async ({ principal, incoming }: ReviewPersonaImportParams): Promise<readonly PersonaCollision[]> => {
    const owned = await loadOwnedPersonaCandidates(ctx.db, principal.userId);
    // Replays the write's mint order, so `keepBothName` is the name keep-both would really land.
    const candidates = [...owned];
    const taken = new Set(owned.map((c) => c.name));
    const collisions = new Map<string, PersonaCollision>();
    for (const persona of incoming) {
      const key = foldPersonaName(persona.name);
      const identity = {
        name: persona.name,
        title: null,
        description: persona.description,
        placement: personaPlacementOf(persona.metadata),
        artHash: persona.artHash,
      };
      if (key.length === 0 || findDuplicatePersona(identity, candidates) !== null) {
        continue;
      }
      const keepBothName = nextFreeName(persona.name, taken);
      taken.add(keepBothName);
      candidates.push({ ...identity, id: mintTypeId(ID_PREFIX.persona), name: keepBothName });
      const holder = findNameCollision(identity, owned);
      if (holder !== null && !collisions.has(key)) {
        collisions.set(key, {
          key,
          name: persona.name,
          existingDescription: holder.description,
          incomingDescription: persona.description,
          differs: differingPersonaFields(identity, holder),
          keepBothName,
        });
      }
    }
    return [...collisions.values()];
  };
}
