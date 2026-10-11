// verb: reviewImport — the read-only half of the profile import's per-collision ask. It answers with the
// SAME identity rules the bulk write applies (`findDuplicatePersona`, then `findNameCollision`), so the
// review can never list a persona the write would reuse, nor miss one it would split.

import type { PersonaCollision } from "@orb/contracts/import";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import {
  differingPersonaFields,
  findDuplicatePersona,
  findNameCollision,
  foldPersonaName,
  mintPersonaName,
  personaPlacementOf,
} from "#primitives/serde/persona";
import type { PersonaContext } from "../context.ts";
import type { ReviewPersonaImportParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";
import { loadOwnedPersonaCandidates } from "../persistence/queries.ts";

export function createReviewImport(ctx: PersonaContext): PersonaService["reviewImport"] {
  return async ({ principal, incoming }: ReviewPersonaImportParams): Promise<readonly PersonaCollision[]> => {
    const owned = await loadOwnedPersonaCandidates(ctx.db, principal.userId);
    // Replays the write under its default (merge) path. A collision mints nothing until the owner picks
    // keep-both, so it never moves another preview; a persona that clashes with no owned name is added
    // whatever the owner picks, so its name is taken for every collision after it.
    const known = [...owned];
    const taken = new Set(owned.map((c) => foldPersonaName(c.name)));
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
      if (key.length === 0 || findDuplicatePersona(identity, known) !== null) {
        continue;
      }
      const holder = findNameCollision(identity, owned);
      if (holder === null) {
        const name = mintPersonaName(persona.name.trim(), taken);
        taken.add(foldPersonaName(name));
        known.push({ ...identity, id: mintTypeId(ID_PREFIX.persona), name });
      } else if (!collisions.has(key)) {
        collisions.set(key, {
          key,
          name: persona.name,
          existingDescription: holder.description,
          incomingDescription: persona.description,
          differs: differingPersonaFields(identity, holder),
          keepBothName: mintPersonaName(persona.name.trim(), taken),
        });
      }
    }
    return [...collisions.values()];
  };
}
