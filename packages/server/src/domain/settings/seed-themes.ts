// domain/settings/seed-themes — boot seeder. ensureSeedThemes upserts the seed palettes at their fixed
// sentinel ids, overwriting on every boot: seeds are un-editable by construction, so an overwrite can never
// clobber user data. Hearth mirrors @orb/ui's base TOKENS ramp; every other palette mirrors the
// SEED_THEME_VALUE_SETS[<lowercased name>] vars — the SAME OKLCH the theme.css [data-theme] blocks emit.
// These OVERRIDEs are pinned byte-equal to those @orb/ui values by tests/server/domain/settings/
// seed-theme-pairing.suite.test.ts (the cake forbids server↔ui imports, so the test is the enforcer), which
// also asserts registry set-equality with the value-set jsons in BOTH directions.
//
// Palettes 4–13 are the default-character pack's own palettes (one per seeded card): the same colours the
// card carries as its `themeOverride`, published here as an installable app theme. Per D71 a seed theme
// RENDERS from its generated [data-theme] block; the row's override is the duplicate-to-customize template.

import type { ThemeOverride } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { ThemeId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import {
  THEME_BIRDIE_ID,
  THEME_BIRDIE_NAME,
  THEME_CALAMITY_ID,
  THEME_CALAMITY_NAME,
  THEME_CHARLOTTE_ID,
  THEME_CHARLOTTE_NAME,
  THEME_ELIAS_ID,
  THEME_ELIAS_NAME,
  THEME_HANA_ID,
  THEME_HANA_NAME,
  THEME_HEARTH_ID,
  THEME_HEARTH_NAME,
  THEME_JFC_ID,
  THEME_JFC_NAME,
  THEME_KOHAKU_ID,
  THEME_KOHAKU_NAME,
  THEME_LIGHT_ID,
  THEME_LIGHT_NAME,
  THEME_MOCHA_ID,
  THEME_MOCHA_NAME,
  THEME_MORGATHA_ID,
  THEME_MORGATHA_NAME,
  THEME_NIKO_ID,
  THEME_NIKO_NAME,
  THEME_SABINE_ID,
  THEME_SABINE_NAME,
} from "./constants";
import { upsertSeedTheme } from "./persistence/theme-queries";

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
  chatStyle: "bubble",
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
  chatStyle: "bubble",
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
  chatStyle: "bubble",
  density: "comfortable",
};

// ── The default-character palettes (one per seeded card; the card carries the identical colours as its
//    `themeOverride`). Generated from the Mocha/Light lightness ladders — only hue/chroma move — so the
//    per-palette AA sweep that holds for the base palettes holds for these. ──

const CHARLOTTE_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.74 0.1 248)",
  userBubble: { bg: "oklch(0.26 0.016 255)", fg: "oklch(0.95 0.008 255)" },
  aiBubble: { bg: "oklch(0.21 0.012 255)", fg: "oklch(0.95 0.008 255)" },
  systemBubble: { bg: "oklch(0.26 0.012 255)", fg: "oklch(0.7 0.008 255)" },
  speaker: "oklch(0.74 0.1 248)",
  dialogueColor: "oklch(0.85 0.08 72)",
  narrationColor: "oklch(0.76 0.03 250)",
  bodyColor: "oklch(0.88 0.015 252)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.012 255)",
  chatStyle: "bubble",
  density: "comfortable",
};

const JFC_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.76 0.13 85)",
  userBubble: { bg: "oklch(0.26 0.012 75)", fg: "oklch(0.95 0.006 75)" },
  aiBubble: { bg: "oklch(0.21 0.009 75)", fg: "oklch(0.95 0.006 75)" },
  systemBubble: { bg: "oklch(0.26 0.009 75)", fg: "oklch(0.7 0.006 75)" },
  speaker: "oklch(0.76 0.13 85)",
  dialogueColor: "oklch(0.85 0.1 80)",
  narrationColor: "oklch(0.76 0.03 75)",
  bodyColor: "oklch(0.88 0.015 80)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.009 75)",
  chatStyle: "bubble",
  density: "comfortable",
};

const NIKO_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.75 0.11 296)",
  userBubble: { bg: "oklch(0.26 0.018 292)", fg: "oklch(0.95 0.009 292)" },
  aiBubble: { bg: "oklch(0.21 0.0135 292)", fg: "oklch(0.95 0.009 292)" },
  systemBubble: { bg: "oklch(0.26 0.0135 292)", fg: "oklch(0.7 0.009 292)" },
  speaker: "oklch(0.75 0.11 296)",
  dialogueColor: "oklch(0.85 0.08 300)",
  narrationColor: "oklch(0.76 0.03 268)",
  bodyColor: "oklch(0.88 0.015 288)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.0135 292)",
  chatStyle: "bubble",
  density: "comfortable",
};

const HANA_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.78 0.12 25)",
  userBubble: { bg: "oklch(0.26 0.02 265)", fg: "oklch(0.95 0.01 265)" },
  aiBubble: { bg: "oklch(0.21 0.015 265)", fg: "oklch(0.95 0.01 265)" },
  systemBubble: { bg: "oklch(0.26 0.015 265)", fg: "oklch(0.7 0.01 265)" },
  speaker: "oklch(0.78 0.12 25)",
  dialogueColor: "oklch(0.85 0.09 30)",
  narrationColor: "oklch(0.76 0.03 262)",
  bodyColor: "oklch(0.88 0.015 265)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.015 265)",
  chatStyle: "bubble",
  density: "comfortable",
};

const MORGATHA_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.72 0.16 308)",
  userBubble: { bg: "oklch(0.26 0.022 305)", fg: "oklch(0.95 0.011 305)" },
  aiBubble: { bg: "oklch(0.21 0.0165 305)", fg: "oklch(0.95 0.011 305)" },
  systemBubble: { bg: "oklch(0.26 0.0165 305)", fg: "oklch(0.7 0.011 305)" },
  speaker: "oklch(0.72 0.16 308)",
  dialogueColor: "oklch(0.85 0.1 315)",
  narrationColor: "oklch(0.76 0.03 295)",
  bodyColor: "oklch(0.88 0.015 302)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.0165 305)",
  chatStyle: "bubble",
  density: "comfortable",
};

const SABINE_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.75 0.12 68)",
  userBubble: { bg: "oklch(0.26 0.014 238)", fg: "oklch(0.95 0.007 238)" },
  aiBubble: { bg: "oklch(0.21 0.0105 238)", fg: "oklch(0.95 0.007 238)" },
  systemBubble: { bg: "oklch(0.26 0.0105 238)", fg: "oklch(0.7 0.007 238)" },
  speaker: "oklch(0.75 0.12 68)",
  dialogueColor: "oklch(0.85 0.1 62)",
  narrationColor: "oklch(0.76 0.03 240)",
  bodyColor: "oklch(0.88 0.015 236)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.0105 238)",
  chatStyle: "bubble",
  density: "comfortable",
};

const BIRDIE_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.53 0.14 58)",
  userBubble: { bg: "oklch(0.93 0.02 78)", fg: "oklch(0.25 0.02 78)" },
  aiBubble: { bg: "oklch(0.97 0.006 78)", fg: "oklch(0.22 0.02 78)" },
  systemBubble: { bg: "oklch(0.93 0.015 78)", fg: "oklch(0.45 0.02 78)" },
  speaker: "oklch(0.53 0.14 58)",
  dialogueColor: "oklch(0.4 0.1 40)",
  narrationColor: "oklch(0.42 0.03 78)",
  bodyColor: "oklch(0.28 0.015 62)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.98 0.004 78)",
  chatStyle: "bubble",
  density: "comfortable",
};

const KOHAKU_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.74 0.15 38)",
  userBubble: { bg: "oklch(0.26 0.016 48)", fg: "oklch(0.95 0.008 48)" },
  aiBubble: { bg: "oklch(0.21 0.012 48)", fg: "oklch(0.95 0.008 48)" },
  systemBubble: { bg: "oklch(0.26 0.012 48)", fg: "oklch(0.7 0.008 48)" },
  speaker: "oklch(0.74 0.15 38)",
  dialogueColor: "oklch(0.85 0.1 32)",
  narrationColor: "oklch(0.76 0.03 52)",
  bodyColor: "oklch(0.88 0.015 45)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.012 48)",
  chatStyle: "bubble",
  density: "comfortable",
};

const CALAMITY_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.72 0.16 282)",
  userBubble: { bg: "oklch(0.26 0.02 278)", fg: "oklch(0.95 0.01 278)" },
  aiBubble: { bg: "oklch(0.21 0.015 278)", fg: "oklch(0.95 0.01 278)" },
  systemBubble: { bg: "oklch(0.26 0.015 278)", fg: "oklch(0.7 0.01 278)" },
  speaker: "oklch(0.72 0.16 282)",
  dialogueColor: "oklch(0.85 0.1 62)",
  narrationColor: "oklch(0.76 0.03 275)",
  bodyColor: "oklch(0.88 0.015 280)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.015 278)",
  chatStyle: "bubble",
  density: "comfortable",
};

const ELIAS_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.75 0.11 196)",
  userBubble: { bg: "oklch(0.26 0.018 212)", fg: "oklch(0.95 0.009 212)" },
  aiBubble: { bg: "oklch(0.21 0.0135 212)", fg: "oklch(0.95 0.009 212)" },
  systemBubble: { bg: "oklch(0.26 0.0135 212)", fg: "oklch(0.7 0.009 212)" },
  speaker: "oklch(0.75 0.11 196)",
  dialogueColor: "oklch(0.85 0.09 72)",
  narrationColor: "oklch(0.76 0.03 208)",
  bodyColor: "oklch(0.88 0.015 212)",
  font: "Geist",
  radius: "card",
  background: "oklch(0.15 0.0135 212)",
  chatStyle: "bubble",
  density: "comfortable",
};

/** One seeded palette row: its sentinel id, display name, and the duplicate-to-customize override. The
 *  ORDER is the boot upsert order and the id order — the registry the pairing suite sweeps. */
export const SEED_THEMES: ReadonlyArray<{ readonly id: ThemeId; readonly name: string; readonly override: ThemeOverride }> = [
  { id: THEME_HEARTH_ID, name: THEME_HEARTH_NAME, override: HEARTH_OVERRIDE },
  { id: THEME_MOCHA_ID, name: THEME_MOCHA_NAME, override: MOCHA_OVERRIDE },
  { id: THEME_LIGHT_ID, name: THEME_LIGHT_NAME, override: LIGHT_OVERRIDE },
  { id: THEME_CHARLOTTE_ID, name: THEME_CHARLOTTE_NAME, override: CHARLOTTE_OVERRIDE },
  { id: THEME_JFC_ID, name: THEME_JFC_NAME, override: JFC_OVERRIDE },
  { id: THEME_NIKO_ID, name: THEME_NIKO_NAME, override: NIKO_OVERRIDE },
  { id: THEME_HANA_ID, name: THEME_HANA_NAME, override: HANA_OVERRIDE },
  { id: THEME_MORGATHA_ID, name: THEME_MORGATHA_NAME, override: MORGATHA_OVERRIDE },
  { id: THEME_SABINE_ID, name: THEME_SABINE_NAME, override: SABINE_OVERRIDE },
  { id: THEME_BIRDIE_ID, name: THEME_BIRDIE_NAME, override: BIRDIE_OVERRIDE },
  { id: THEME_KOHAKU_ID, name: THEME_KOHAKU_NAME, override: KOHAKU_OVERRIDE },
  { id: THEME_CALAMITY_ID, name: THEME_CALAMITY_NAME, override: CALAMITY_OVERRIDE },
  { id: THEME_ELIAS_ID, name: THEME_ELIAS_NAME, override: ELIAS_OVERRIDE },
];

export async function ensureSeedThemes(db: Db, now: () => number): Promise<void> {
  const at = now();
  // Each upsert is an independent idempotent write keyed by its own sentinel id — no ordering between
  // them, so they go out together (the `boot/seed-owner` per-owner precedent), and one clock read keeps
  // the whole registry's timestamps identical.
  await Promise.all(
    SEED_THEMES.map(({ id, name, override }) => upsertSeedTheme(db, { id, ownerId: null, name, override, css: null, createdAt: at, updatedAt: at })),
  );
  getLog().info({ themeIds: SEED_THEMES.map((t) => t.id) }, "settings: seeded/reseeded theme palettes");
}
