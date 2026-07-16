// domain/settings/seed-themes — boot seeder. ensureSeedThemes upserts the three seed palettes at their
// fixed sentinel ids, overwriting on every boot: seeds are un-editable by construction, so an overwrite
// can never clobber user data. Hearth mirrors @orb/ui/styles/theme.css's live OKLCH ramp verbatim; Mocha
// is a cool-hued dark variant; Light is a luminance-inverted variant of the same warm hue family.

import type { ThemeOverride } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { getLog } from "#foundation/observability";
import { THEME_HEARTH_ID, THEME_HEARTH_NAME, THEME_LIGHT_ID, THEME_LIGHT_NAME, THEME_MOCHA_ID, THEME_MOCHA_NAME } from "./constants";
import { upsertSeedTheme } from "./persistence/theme-queries";

const HEARTH_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.72 0.175 52)",
  userBubble: { bg: "oklch(0.255 0.007 60)", fg: "oklch(0.955 0.004 75)" },
  aiBubble: { bg: "oklch(0.205 0.006 60)", fg: "oklch(0.955 0.004 75)" },
  systemBubble: { bg: "oklch(0.255 0.006 60)", fg: "oklch(0.705 0.008 65)" },
  speaker: "oklch(0.72 0.175 52)",
  dialogueColor: "oklch(0.955 0.004 75)",
  narrationColor: "oklch(0.78 0.02 70)",
  bodyColor: "oklch(0.9 0.008 72)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.158 0.006 60)",
  chatStyle: "bubble",
  density: "comfortable",
};

const MOCHA_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.7 0.14 250)",
  userBubble: { bg: "oklch(0.26 0.02 250)", fg: "oklch(0.95 0.01 250)" },
  aiBubble: { bg: "oklch(0.21 0.015 250)", fg: "oklch(0.95 0.01 250)" },
  systemBubble: { bg: "oklch(0.26 0.015 250)", fg: "oklch(0.7 0.01 250)" },
  speaker: "oklch(0.7 0.14 250)",
  dialogueColor: "oklch(0.95 0.01 250)",
  narrationColor: "oklch(0.76 0.03 230)",
  bodyColor: "oklch(0.88 0.015 240)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.015 250)",
  chatStyle: "bubble",
  density: "comfortable",
};

const LIGHT_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.55 0.16 50)",
  userBubble: { bg: "oklch(0.93 0.02 60)", fg: "oklch(0.25 0.02 60)" },
  aiBubble: { bg: "oklch(0.97 0.006 60)", fg: "oklch(0.22 0.02 60)" },
  systemBubble: { bg: "oklch(0.93 0.015 60)", fg: "oklch(0.45 0.02 60)" },
  speaker: "oklch(0.5 0.17 50)",
  dialogueColor: "oklch(0.2 0.02 60)",
  narrationColor: "oklch(0.42 0.03 60)",
  bodyColor: "oklch(0.28 0.015 60)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.98 0.004 75)",
  chatStyle: "bubble",
  density: "comfortable",
};

export async function ensureSeedThemes(db: Db, now: () => number): Promise<void> {
  const at = now();
  await upsertSeedTheme(db, {
    id: THEME_HEARTH_ID,
    ownerId: null,
    name: THEME_HEARTH_NAME,
    override: HEARTH_OVERRIDE,
    css: null,
    createdAt: at,
    updatedAt: at,
  });
  await upsertSeedTheme(db, {
    id: THEME_MOCHA_ID,
    ownerId: null,
    name: THEME_MOCHA_NAME,
    override: MOCHA_OVERRIDE,
    css: null,
    createdAt: at,
    updatedAt: at,
  });
  await upsertSeedTheme(db, {
    id: THEME_LIGHT_ID,
    ownerId: null,
    name: THEME_LIGHT_NAME,
    override: LIGHT_OVERRIDE,
    css: null,
    createdAt: at,
    updatedAt: at,
  });
  getLog().info({ themeIds: [THEME_HEARTH_ID, THEME_MOCHA_ID, THEME_LIGHT_ID] }, "settings: seeded/reseeded theme palettes");
}
