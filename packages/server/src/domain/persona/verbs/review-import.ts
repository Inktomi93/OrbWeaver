// verb: reviewImport — the read-only half of the profile import's per-collision ask. It answers with the
// SAME identity rules the bulk write applies (`findDuplicatePersona`, then `findNameCollision`), so the
// review can never list a persona the write would reuse, nor miss one it would split.

import type { PersonaCollision } from "@orb/contracts/import";
import { findDuplicatePersona, findNameCollision, foldPersonaName, personaPlacementOf } from "#kit/serde/persona";
import type { PersonaContext } from "../context.ts";
import type { ReviewPersonaImportParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";
import { loadOwnedPersonaCandidates } from "../persistence/queries.ts";

export function createReviewImport(ctx: PersonaContext): PersonaService["reviewImport"] {
  return async ({ principal, incoming }: ReviewPersonaImportParams): Promise<readonly PersonaCollision[]> => {
    const candidates = await loadOwnedPersonaCandidates(ctx.db, principal.userId);
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
      if (key.length === 0 || collisions.has(key) || findDuplicatePersona(identity, candidates) !== null) {
        continue;
      }
      const owned = findNameCollision(identity, candidates);
      if (owned !== null) {
        collisions.set(key, { key, name: persona.name, existingDescription: owned.description, incomingDescription: persona.description });
      }
    }
    return [...collisions.values()];
  };
}
