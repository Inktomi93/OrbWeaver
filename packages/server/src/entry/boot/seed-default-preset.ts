import type { Db } from "@orb/db";
import { ensurePackagedPresets, ensureSystemDefaultPreset } from "#domain/preset";

export interface SeedDefaultPresetDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Ensure the system-default preset row + the shipped PACKAGED template presets exist (version-gated reseed).
 *  Idempotent. */
export async function seedDefaultPreset(deps: SeedDefaultPresetDeps): Promise<void> {
  await ensureSystemDefaultPreset(deps.db, deps.now);
  await ensurePackagedPresets(deps.db, deps.now);
}
