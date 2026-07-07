// entry/boot/seed-themes — boot step: idempotent upsert of the three seed theme palettes (D44 §12.1,
// core/Tier-5-Entry.md §"Boot order"). The domain owns the seeding logic (`ensureSeedThemes` — overwritten
// on every boot, never version-gated: seeds are un-editable by construction, themes-design.md §5); this
// boot step is the thin home that adapts the uniform boot-step deps bundle onto it.
//
// `now` is INJECTED (the domain seeder takes the clock — determinism).

import type { Db } from "@orb/db";
import { ensureSeedThemes } from "#domain/settings";

export interface SeedThemesDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Boot step: ensure the three seed theme palettes exist (overwritten on every boot). Idempotent. */
export async function seedThemes(deps: SeedThemesDeps): Promise<void> {
  await ensureSeedThemes(deps.db, deps.now);
}
