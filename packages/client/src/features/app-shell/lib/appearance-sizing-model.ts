// The "Sizing & motion" appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp.
//
// This subcategory ABSORBS the pane's old `motion` sub and the `density`/`elevation` leaves that used to sit under
// `message-style`: app-shell reads all five knobs (`surfaces/app-shell.tsx` paints the shell scope tokens, the
// content-width clamp and `data-elevation`; `data-reduced-motion` goes onto <html> through
// `useAppearanceRootEffects`, so the floor reaches portals and the boot veil), and §6's rule is that a SECTION is owned by its
// reader — so the five land in one app-shell section rather than being split across two owners. The `sizing` anchor
// id is unchanged (§7.1); every absorbed search LEAF travels here intact (§7.2), so a fuzzy jump for "reduce motion"
// or "density" still lands on a real anchor.

import { APPEARANCE_OWNER_KEYS, DENSITY_ITEMS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { ELEVATION_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_SIZING_SUBCATEGORY: ConfigSubcategory = {
  id: "sizing",
  label: "Sizing & motion",
  teach: {
    summary: "Global layout knobs: chat column width, text scale, density, surface elevation and the app-wide reduced-motion override.",
    affects: ["the entire app's spacing, depth and animation behavior, on this account"],
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
      keywords: ["animation", "transition", "accessibility", "motion"],
      teach: {
        summary: "Freezes animations and transitions, beyond your system's own reduced-motion setting.",
        affects: ["animations and transitions app-wide, including portals and the boot veil"],
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
