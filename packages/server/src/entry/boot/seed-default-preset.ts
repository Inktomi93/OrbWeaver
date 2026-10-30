import type { DatabaseHandle } from "@orb/db/wiring";
import type { Clock } from "@orb/kit/time";
import { ensureSystemDefaultPreset } from "#domain/preset";
import type { Logger } from "#foundation/observability";

export interface SeedDefaultPresetDeps {
  readonly logger: Logger;
  readonly db: DatabaseHandle;
  readonly now: Clock;
}

/** Ensure the system-default preset row exists (version-gated reseed). Idempotent. */
export async function seedDefaultPreset(deps: SeedDefaultPresetDeps): Promise<void> {
  await ensureSystemDefaultPreset(deps.db, deps.now, deps.logger);
}
