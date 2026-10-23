// domain/settings/seed-themes — boot seeder. `ensureSeedThemes` CONVERGES the library's seed half to the
// shipped set: it upserts every shipped palette at its fixed sentinel id (overwriting on every boot — seeds
// are un-editable by construction, so an overwrite can never clobber user data) and DELETES the retired
// sentinel rows (TD/O-9: the ten default-character palettes left the picker). The delete is scoped to those
// exact ids AND to `ownerId IS NULL`, so the "can never clobber user data" promise holds unchanged: a
// duplicate a user made of a retired palette is THEIR row and survives.
//
// Retiring a row can orphan a pointer, so the converge also HEALS `theme.selectedThemeId` on any
// user_settings blob that named one — only-if-set, back to `null` (Hearth). The client already degrades a
// dangling id gracefully (`use-selected-theme` → null → Hearth), so this is for blob honesty and the
// picker's active-row display, not crash safety.
//
// Hearth mirrors @orb/ui's base TOKENS ramp; every other palette mirrors the SEED_THEME_VALUE_SETS[<lowercased
// name>] vars — the SAME OKLCH the theme.css [data-theme] blocks emit. These OVERRIDEs are kept byte-equal
// to those @orb/ui values (the cake forbids server↔ui imports) and registry set-equal with the
// value-set jsons in BOTH directions. Per D71 a seed theme RENDERS from its generated [data-theme] block;
// the row's override is the duplicate-to-customize template.

import type { Db } from "@orb/db";
import { getLog } from "#foundation/observability";
import { RETIRED_SEED_THEME_IDS } from "./constants.ts";
import { deleteSeedThemes, upsertSeedThemes } from "./persistence/system-themes.ts";
import { clearSelectedThemeIds } from "./persistence/theme-queries.ts";
import { SEED_THEMES } from "./substrate/seed-themes.ts";

export async function ensureSeedThemes(db: Db, now: () => number): Promise<void> {
  const at = now();
  // Each upsert is an independent idempotent write keyed by its own sentinel id — no ordering between
  // them, so they go out together (the `boot/seed-owner` per-owner precedent), and one clock read keeps
  // the whole registry's timestamps identical.
  await upsertSeedThemes(db, at);
  // ORDER IS LOAD-BEARING: heal the pointers BEFORE dropping the rows they point at, so a crash between
  // the two leaves a dangling-but-degrading selection rather than a healed pointer with the row still live.
  const healed = await clearSelectedThemeIds(db, RETIRED_SEED_THEME_IDS, at);
  const retired = await deleteSeedThemes(db);
  getLog().info({ themeIds: SEED_THEMES.map((t) => t.id), retired, healed }, "settings: converged theme palettes to the shipped set");
}
