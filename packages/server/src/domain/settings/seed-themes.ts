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
// name>] vars — the SAME OKLCH the theme.css [data-theme] blocks emit. These OVERRIDEs are pinned byte-equal
// to those @orb/ui values by tests/server/domain/settings/seed-theme-pairing.suite.test.ts (the cake forbids
// server↔ui imports, so the test is the enforcer), which also asserts registry set-equality with the
// value-set jsons in BOTH directions. Per D71 a seed theme RENDERS from its generated [data-theme] block;
// the row's override is the duplicate-to-customize template.

import type { ThemeOverride } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { ThemeId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { RETIRED_SEED_THEME_IDS, THEME_HEARTH_ID, THEME_HEARTH_NAME, THEME_LIGHT_ID, THEME_LIGHT_NAME, THEME_MOCHA_ID, THEME_MOCHA_NAME } from "./constants";
import { clearSelectedThemeIds, deleteSeedThemes, upsertSeedTheme } from "./persistence/theme-queries";

const HEARTH_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.72 0.175 52)",
  userBubble: { bg: "oklch(0.255 0.006 60)", fg: "oklch(0.955 0.004 75)" },
  aiBubble: { bg: "oklch(0.205 0.006 60)", fg: "oklch(0.955 0.004 75)" },
  systemBubble: { bg: "oklch(0.255 0.006 60)", fg: "oklch(0.74 0.008 65)" },
  speaker: "oklch(0.72 0.175 52)",
  dialogueColor: "oklch(0.86 0.1 85)",
  narrationColor: "oklch(0.78 0.02 70)",
  bodyColor: "oklch(0.9 0.008 72)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.158 0.006 60)",
  density: "comfortable",
};

const MOCHA_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.7 0.14 250)",
  userBubble: { bg: "oklch(0.26 0.02 250)", fg: "oklch(0.95 0.01 250)" },
  aiBubble: { bg: "oklch(0.21 0.015 250)", fg: "oklch(0.95 0.01 250)" },
  systemBubble: { bg: "oklch(0.26 0.015 250)", fg: "oklch(0.7 0.01 250)" },
  speaker: "oklch(0.7 0.14 250)",
  dialogueColor: "oklch(0.85 0.09 55)",
  narrationColor: "oklch(0.76 0.03 230)",
  bodyColor: "oklch(0.88 0.015 240)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.015 250)",
  density: "comfortable",
};

const LIGHT_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.55 0.16 50)",
  userBubble: { bg: "oklch(0.93 0.02 60)", fg: "oklch(0.25 0.02 60)" },
  aiBubble: { bg: "oklch(0.97 0.006 60)", fg: "oklch(0.22 0.02 60)" },
  systemBubble: { bg: "oklch(0.93 0.015 60)", fg: "oklch(0.45 0.02 60)" },
  speaker: "oklch(0.5 0.17 50)",
  dialogueColor: "oklch(0.4 0.1 240)",
  narrationColor: "oklch(0.42 0.03 60)",
  bodyColor: "oklch(0.28 0.015 60)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.98 0.004 75)",
  density: "comfortable",
};

/** One seeded palette row: its sentinel id, display name, and the duplicate-to-customize override. The
 *  ORDER is the boot upsert order and the id order — the registry the pairing suite sweeps. */
export const SEED_THEMES: ReadonlyArray<{ readonly id: ThemeId; readonly name: string; readonly override: ThemeOverride }> = [
  { id: THEME_HEARTH_ID, name: THEME_HEARTH_NAME, override: HEARTH_OVERRIDE },
  { id: THEME_MOCHA_ID, name: THEME_MOCHA_NAME, override: MOCHA_OVERRIDE },
  { id: THEME_LIGHT_ID, name: THEME_LIGHT_NAME, override: LIGHT_OVERRIDE },
];

export async function ensureSeedThemes(db: Db, now: () => number): Promise<void> {
  const at = now();
  // Each upsert is an independent idempotent write keyed by its own sentinel id — no ordering between
  // them, so they go out together (the `boot/seed-owner` per-owner precedent), and one clock read keeps
  // the whole registry's timestamps identical.
  await Promise.all(
    SEED_THEMES.map(({ id, name, override }) => upsertSeedTheme(db, { id, ownerId: null, name, override, css: null, createdAt: at, updatedAt: at })),
  );
  // ORDER IS LOAD-BEARING: heal the pointers BEFORE dropping the rows they point at, so a crash between
  // the two leaves a dangling-but-degrading selection rather than a healed pointer with the row still live.
  const healed = await clearSelectedThemeIds(db, RETIRED_SEED_THEME_IDS, at);
  const retired = await deleteSeedThemes(db, RETIRED_SEED_THEME_IDS);
  getLog().info({ themeIds: SEED_THEMES.map((t) => t.id), retired, healed }, "settings: converged theme palettes to the shipped set");
}
