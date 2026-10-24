import type { DatabaseHandle } from "@orb/db/wiring";
import { ensureSystemDefaultPreset } from "#domain/preset";

export interface SeedDefaultPresetDeps {
  readonly db: DatabaseHandle;
  readonly now: () => number;
}

/** Ensure the system-default preset row exists (version-gated reseed). Idempotent. */
export async function seedDefaultPreset(deps: SeedDefaultPresetDeps): Promise<void> {
  await ensureSystemDefaultPreset(deps.db, deps.now);
}
