// The "Sizing" appearance-section MODEL (SET-SEAMS §6): the one `ConfigSubcategory` shared by the contribution def
// and the section body's `<Section>` anchor stamp. app-shell reads every knob here (the shell scope tokens,
// `data-elevation` and the root appearance channel), and §6's rule is that a section is owned by its reader.
// The `sizing` anchor id is stable (§7.1), so a fuzzy jump for "density" lands on a real anchor.

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { DENSITY_ITEMS, ELEVATION_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_SIZING_SUBCATEGORY: ConfigSubcategory = {
  id: "sizing",
  label: "Sizing",
  teach: {
    summary: "Global layout knobs: chat column width, text scale, density and surface elevation.",
    affects: ["the entire app's spacing and depth, on this account"],
  },
  settings: [
    {
      id: "chat-width",
      key: "chatWidthPct",
      label: "Chat width (%)",
      keywords: ["width", "column", "reading"],
      teach: {
        summary: "How wide the reading column may grow on large screens. Narrower columns are easier to read; wider ones fit more of a long turn.",
        affects: ["the chat reading column on large screens", "nothing below the width where the column already fills the pane"],
      },
    },
    {
      id: "font-scale",
      key: "fontScale",
      label: "Text size",
      keywords: ["font", "scale", "zoom"],
      teach: {
        summary: "A global multiplier for all text (1 = default). The whole app scales together.",
        affects: ["every piece of text in the app"],
        related: [{ group: "appearance", sub: "reading-typography", setting: "body-scale" }],
      },
    },
    {
      id: "density",
      key: "density",
      label: "Density",
      options: DENSITY_ITEMS,
      keywords: ["compact", "comfortable", "spacing"],
      teach: {
        summary: "Compact tightens spacing throughout the app; Comfortable keeps the default breathing room.",
        affects: ["row heights and padding across every panel and list"],
      },
    },
    {
      id: "elevation",
      key: "elevation",
      label: "Surface elevation",
      options: ELEVATION_ITEMS,
      keywords: ["layered", "depth", "flat", "hairline"],
      teach: {
        summary: "Flat parts the regions with hairlines; Layered drops them for a brightness ladder. Clickable cards and panels never cast a shadow.",
        affects: ["panel backgrounds and region borders app-wide"],
      },
    },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_SIZING_KEYS = APPEARANCE_OWNER_KEYS.sizing;
