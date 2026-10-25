// The "Sizing & motion" appearance-section MODEL (SET-SEAMS §6): the one `ConfigSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp. app-shell reads every knob here (the shell scope
// tokens, `data-elevation` and the root appearance channel), and §6's rule is that a section is owned by its reader.
// The `sizing` anchor id is stable (§7.1), so a fuzzy jump for "reduce motion" or "density" lands on a real anchor.

import { APPEARANCE_OWNER_KEYS, DENSITY_ITEMS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { ELEVATION_ITEMS, OS_PREFERENCE_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_SIZING_SUBCATEGORY: ConfigSubcategory = {
  id: "sizing",
  label: "Sizing & motion",
  teach: {
    summary:
      "Global layout knobs: chat column width, text scale, density and surface elevation, and the app's answer to your device's motion, transparency and contrast settings.",
    affects: ["the entire app's spacing, depth, animation, glass and contrast, on this account"],
  },
  settings: [
    {
      id: "chat-width",
      key: "chatWidthPct",
      label: "Chat width",
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
        summary: "A global multiplier for all text (1 = default) — the whole app scales together.",
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
      keywords: ["layered", "depth", "shadow", "flat"],
      teach: {
        summary: "Layered lifts the panels and content into a brightness ladder and drops the region borders; Flat keeps one tone with hairlines.",
        affects: ["panel backgrounds and region borders app-wide"],
      },
    },
    {
      id: "reduced-motion",
      key: "reducedMotion",
      label: "Reduce motion",
      options: OS_PREFERENCE_ITEMS,
      keywords: ["animation", "transition", "accessibility", "motion"],
      teach: {
        summary:
          "System follows your device's reduced-motion setting. On freezes animations and transitions; Off keeps them even when the device asks for less motion.",
        affects: ["animations and transitions app-wide, including portals and the boot veil"],
      },
    },
    {
      id: "reduced-transparency",
      key: "reducedTransparency",
      label: "Reduce transparency",
      options: OS_PREFERENCE_ITEMS,
      keywords: ["glass", "blur", "transparency", "accessibility", "solid"],
      teach: {
        summary:
          "System follows your device's reduce-transparency setting. On makes the glass surfaces solid; Off keeps the glass even when the device asks for less transparency.",
        affects: ["the glass panels, composer, dialogs and message bubbles you enabled under Effects"],
        related: [{ group: "appearance", sub: "effects", setting: "frosted-glass" }],
      },
    },
    {
      id: "increased-contrast",
      key: "increasedContrast",
      label: "Increase contrast",
      options: OS_PREFERENCE_ITEMS,
      keywords: ["contrast", "borders", "accessibility", "legibility"],
      teach: {
        summary:
          "System follows your device's increase-contrast setting. On draws stronger edges, a denser glass fill and drops the film grain; Off keeps the standard look even when the device asks for more contrast.",
        affects: ["panel, composer and dialog edges on large screens", "the glass fill and the film-grain texture"],
      },
    },
  ],
};

/** The label the model gives the setting a control writes; the section's controls read it so a row has one name. */
export function sizingSettingLabel(key: string): string {
  const leaf = APPEARANCE_SIZING_SUBCATEGORY.settings?.find((setting) => setting.key === key);
  if (leaf === undefined) {
    throw new Error(`The sizing model has no setting for ${key}`);
  }
  return leaf.label;
}

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_SIZING_KEYS = APPEARANCE_OWNER_KEYS.sizing;
