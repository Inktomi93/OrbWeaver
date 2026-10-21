// Shipped seed palette data; persistence and the palette-pairing proof share this one registry.
import type { ThemeOverride } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { THEME_HEARTH_ID, THEME_HEARTH_NAME, THEME_LIGHT_ID, THEME_LIGHT_NAME, THEME_MOCHA_ID, THEME_MOCHA_NAME } from "../constants.ts";

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
  accent: "oklch(0.5 0.16 50)",
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
 *  ORDER is the boot upsert order and the id order — the registry the pairing suite sweeps.
 */
export const SEED_THEMES: ReadonlyArray<{ readonly id: ThemeId; readonly name: string; readonly override: ThemeOverride }> = [
  { id: THEME_HEARTH_ID, name: THEME_HEARTH_NAME, override: HEARTH_OVERRIDE },
  { id: THEME_MOCHA_ID, name: THEME_MOCHA_NAME, override: MOCHA_OVERRIDE },
  { id: THEME_LIGHT_ID, name: THEME_LIGHT_NAME, override: LIGHT_OVERRIDE },
];
