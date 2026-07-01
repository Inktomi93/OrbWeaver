// entry/boot/seed-default-preset — boot step 4: idempotent seed of the single system-default preset
// (core/Tier-5-Entry.md §"Boot order"; domains/preset.md — the default preset). The domain owns the seeding logic
// (`ensureSystemDefaultPreset` — the version-gated upsert of the one `owner_id IS NULL` row); this boot step
// is the thin home that adapts the uniform boot-step deps bundle onto it. Idempotent by construction: a
// re-run only overwrites the row when `DEFAULT_PROMPT_CONFIG.schemaVersion` has bumped above the stored one.
//
// `now` is INJECTED (the domain seeder takes the clock — determinism).

import type { Db } from "@orb/db";
import { ensureSystemDefaultPreset } from "#domain/preset";

export interface SeedDefaultPresetDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Boot step 4: ensure the system-default preset row exists (version-gated reseed). Idempotent. */
export async function seedDefaultPreset(deps: SeedDefaultPresetDeps): Promise<void> {
  await ensureSystemDefaultPreset(deps.db, deps.now);
}
