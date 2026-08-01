// The Effects appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split out so
// neither imports the other. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_EFFECTS_SUBCATEGORY: SettingsSubcategory = {
  id: "effects",
  label: "Effects",
  settings: [
    { id: "frosted-glass", label: "Frosted glass", keywords: ["blur", "glass", "backdrop"] },
    { id: "glass-blur", label: "Glass blur radius" },
    { id: "prose-shadow", label: "Prose shadow", keywords: ["halo", "readability"] },
    { id: "surface-texture", label: "Surface texture", keywords: ["grain", "film", "noise"] },
    { id: "accent-tint", label: "Tint the UI with the accent color", keywords: ["accent", "color", "border", "hairline"] },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_EFFECTS_KEYS = ["blurSurfaces", "blurStrength", "shadowEffects", "surfaceTexture", "enableThemeColorization"] as const;
