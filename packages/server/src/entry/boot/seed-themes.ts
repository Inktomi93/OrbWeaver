import type { DatabaseHandle } from "@orb/db/wiring";
import { ensureSeedThemes } from "#domain/settings";

export interface SeedThemesDeps {
  readonly db: DatabaseHandle;
  readonly now: () => number;
}

/** Ensure the three seed theme palettes exist (overwritten on every boot, never version-gated). */
export async function seedThemes(deps: SeedThemesDeps): Promise<void> {
  await ensureSeedThemes(deps.db, deps.now);
}
