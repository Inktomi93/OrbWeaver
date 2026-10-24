// The first default card, the persona item and the seed ledger policy the content seeder suites share.

import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { SEED_MANIFEST } from "@orb/default-content";
import type { ContentSeedStep } from "@orb/server/domain/settings";
import { createReadSeededKeys, createSettingsComposedOps, createUserContentSeeder, recordSeededItemKeys } from "@orb/server/domain/settings";

const firstCard = SEED_MANIFEST.find((item) => item.kind === "character");
if (firstCard?.kind !== "character") {
  throw new Error("the canonical seed manifest has no character");
}
const personaItem = SEED_MANIFEST.find((item) => item.kind === "persona");
if (personaItem === undefined) {
  throw new Error("the canonical seed manifest has no persona");
}
export const FIRST_CARD = firstCard;
export const PERSONA_ITEM = personaItem;

/** Drive the real ledger owner with a real owner operation, not a fake ledger or a copied manifest interpreter. */
export function ledgerPolicy(
  db: Db,
  now: () => number,
  settings: Parameters<typeof createSettingsComposedOps>[0],
  steps: readonly ContentSeedStep[],
): ReturnType<typeof createUserContentSeeder> {
  return createUserContentSeeder({
    enabled: () => true,
    steps,
    now,
    seededKeys: createReadSeededKeys(databaseHandle(db)),
    recordSeeded: (userId, keys, at) => recordSeededItemKeys(databaseHandle(db), userId, keys, at),
    legacyLatches: createSettingsComposedOps(settings).legacyLatches,
  });
}
