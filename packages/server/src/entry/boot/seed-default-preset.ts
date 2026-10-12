import type { Db } from "@orb/db";
import { ensureSystemDefaultPreset } from "#domain/preset";

// @orb-waive no-inline-package-interface(SeedDefaultPresetDeps): baselined when the gate landed; burn-down item 952.
export interface SeedDefaultPresetDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Ensure the system-default preset row exists (version-gated reseed). Idempotent. */
export async function seedDefaultPreset(deps: SeedDefaultPresetDeps): Promise<void> {
  await ensureSystemDefaultPreset(deps.db, deps.now);
}
