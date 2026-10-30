import type { BootDatabaseHandle } from "@orb/db/wiring";
import type { Clock } from "@orb/kit/time";
import { ensureSeedThemes } from "#domain/settings";
import type { Logger } from "#foundation/observability";

export interface SeedThemesDeps {
  readonly logger: Logger;
  readonly db: BootDatabaseHandle;
  readonly now: Clock;
}

/** Ensure the three seed theme palettes exist (overwritten on every boot, never version-gated). */
export async function seedThemes(deps: SeedThemesDeps): Promise<void> {
  await ensureSeedThemes(deps.db, deps.now, deps.logger);
}
