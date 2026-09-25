// The Background appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split out so
// neither imports the other. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { BACKGROUND_FIT_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_BACKGROUND_SUBCATEGORY: ConfigSubcategory = {
  id: "background",
  label: "Background",
  keywords: ["wallpaper", "photo", "image"],
  teach: {
    summary: "A decorative photo layer behind the entire app, dimmed by a scrim so text stays readable. Pick a bundled scene or upload your own.",
    affects: ["the wallpaper behind every panel, on this account everywhere you sign in"],
  },
  settings: [
    {
      id: "background-image",
      label: "Background image",
      keywords: ["photo", "wallpaper"],
      teach: {
        summary: "A decorative photo behind the app, with a scrim so text stays readable. Pick a bundled scene or one from your own library.",
        affects: ["the layer behind every panel, on this account everywhere you sign in"],
        related: [{ group: "appearance", sub: "effects", setting: "frosted-glass" }],
      },
    },
    {
      id: "background-fit",
      key: "backgroundFit",
      options: BACKGROUND_FIT_ITEMS,
      label: "Fit",
      keywords: ["cover", "contain", "stretch"],
      teach: {
        summary: "How the picked image maps onto the window — fill and crop, letterbox, actual size, or stretch.",
        affects: ["the background layer only"],
      },
    },
    {
      id: "background-dim",
      key: "backgroundDim",
      label: "Scrim opacity",
      keywords: ["darken", "overlay"],
      teach: {
        summary: "Darkens the image so text stays legible — never fully off.",
        affects: ["text contrast over the background image"],
      },
    },
    {
      id: "background-blur",
      key: "backgroundBlur",
      label: "Image blur",
      teach: { summary: "Softens the photo itself; the darkening scrim above stays sharp.", affects: ["the background image only"] },
    },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_BACKGROUND_KEYS = APPEARANCE_OWNER_KEYS.background;

/** The owned key that is a library, not a setting: the backgrounds a user uploads and the plates a first run seeds. It
 *  never marks the section Modified. */
export const APPEARANCE_BACKGROUND_LIBRARY_KEYS = ["backgroundLibrary"] as const satisfies readonly (typeof APPEARANCE_BACKGROUND_KEYS)[number][];
