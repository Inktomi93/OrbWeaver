// verb: importPersonas — translate a profile's settings.json personas → the canonical
// `BulkImportPersonaInput` and delegate the WRITE to the injected persona-owned `bulkImportPersonas` op
// (Option B — `import` performs NO db access). Then POPULATE the cross-verb `personaByUserName` map (from the
// op's `idByName`) so the chat importers can attribute their `user_name`s. MUST run BEFORE the chat importers
// (the driver + the import-st runner order it so).
//
// DEDUP is the persona op's job (content identity per D290: an equal persona is reused; a different persona under
// the same name follows the run's per-collision choice — merge into the owned one, or land beside it under a
// numbered name). `avatarAssetId` is set by the driver after storing `avatarBytes` (domain/import can't
// reach domain/assets — the avatar store is injected, same as the card PNG).

import type { PersonaCollisionChoices } from "@orb/contracts/import";
import type { BulkImportPersonaInput, PersonaMetadata } from "@orb/contracts/persona";
import type { ImportContext } from "../context.ts";
import type { ImportPersonaInput } from "../contract/params.ts";
import type { ImportPersonasResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import { requireProfile } from "../guard.ts";

export function createImportPersonas(ctx: ImportContext): ImportService["importPersonas"] {
  return async ({
    personas: input,
    collisions,
  }: {
    readonly personas: readonly ImportPersonaInput[];
    readonly collisions?: PersonaCollisionChoices | undefined;
  }): Promise<ImportPersonasResult> => {
    const profile = requireProfile(ctx);

    const personas: BulkImportPersonaInput[] = input.map((pi) => ({
      name: pi.parsed.name,
      description: pi.parsed.description,
      avatarAssetId: pi.avatarAssetId ?? null,
      metadata: (pi.parsed.metadata as PersonaMetadata | null) ?? null,
      isDefault: pi.parsed.isDefault,
    }));

    const result = await profile.bulkImportPersonas({ ownerId: ctx.ownerId, personas, collisions });

    // The chat importers read `personaByUserName` (lowercased name → id) to attribute `user_name`s.
    for (const [key, personaId] of Object.entries(result.idByName)) {
      profile.personaByUserName.set(key, personaId);
    }

    return {
      personasCreated: result.personasCreated,
      personasSkipped: result.personasSkipped,
      personasMerged: result.personasMerged,
      mergedKeys: result.mergedKeys,
      defaultPersonaId: result.defaultPersonaId,
    };
  };
}
