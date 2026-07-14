// The shared theme-override form primitives (clone-audit item 5). Both theme editors — the per-character
// Appearance tab (`character-theme-form-model`) and the settings theme editor (`theme-editor-model`) —
// bind a FLAT, all-string palette to a sparse `ThemeOverride`, with the SAME "a blank color field drops
// from the override so <ThemeScope> derives/inherits that token" rule. Features can't import each other, so
// the shared shape + rule live in `#lib` (below every feature); each model keeps its own from-override
// mapper (character seeds "" sentinels, the theme editor seeds the Hearth defaults — a real divergence).

import type { ThemeOverride } from "@orb/contracts/theme";

// The flat palette color keys both theme forms carry (each field a color STRING; "" = unset → inherit).
const THEME_COLOR_KEYS = [
  "background",
  "accent",
  "borderColor",
  "speaker",
  "dialogueColor",
  "narrationColor",
  "bodyColor",
] as const;

/** The flat palette-color fields shared by every theme form value shape (both editors extend this). */
export interface ThemeColorFields {
  readonly background: string;
  readonly accent: string;
  readonly borderColor: string;
  readonly speaker: string;
  readonly dialogueColor: string;
  readonly narrationColor: string;
  readonly bodyColor: string;
}

/** Assign the SET (non-blank) palette color fields onto an in-progress `ThemeOverride` — the shared
 *  "empty ⇒ token inherits/derives" rule. A blank field is omitted so the parent scope supplies it. */
export function assignThemeColorFields(target: ThemeOverride, v: ThemeColorFields): void {
  for (const key of THEME_COLOR_KEYS) {
    if (v[key].trim() !== "") {
      target[key] = v[key];
    }
  }
}
