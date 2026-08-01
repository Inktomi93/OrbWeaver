// The Background appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split out so
// neither imports the other. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_BACKGROUND_SUBCATEGORY: SettingsSubcategory = {
  id: "background",
  label: "Background",
  keywords: ["wallpaper", "photo", "image"],
  settings: [
    { id: "background-image", label: "Background image", keywords: ["photo", "wallpaper"] },
    { id: "background-fit", label: "Fit", keywords: ["cover", "contain", "stretch"] },
    { id: "background-dim", label: "Scrim opacity", keywords: ["darken", "overlay"] },
    { id: "background-blur", label: "Image blur" },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_BACKGROUND_KEYS = [
  "backgroundImageKind",
  "backgroundSeededId",
  "backgroundAssetId",
  "backgroundAssetHash",
  "backgroundAssetMime",
  "backgroundLibrary",
  "backgroundFit",
  "backgroundDim",
  "backgroundBlur",
] as const;
