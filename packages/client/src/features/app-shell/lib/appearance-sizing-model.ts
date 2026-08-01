// The "Sizing & motion" appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp.
//
// This subcategory ABSORBS the pane's old `motion` sub and the `density`/`elevation` leaves that used to sit under
// `message-style`: app-shell reads all five knobs (`surfaces/app-shell.tsx` paints the shell scope tokens, the
// content-width clamp, `data-elevation` and `data-reduced-motion`), and §6's rule is that a SECTION is owned by its
// reader — so the five land in one app-shell section rather than being split across two owners. The `sizing` anchor
// id is unchanged (§7.1); every absorbed search LEAF travels here intact (§7.2), so a fuzzy jump for "reduce motion"
// or "density" still lands on a real anchor.

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_SIZING_SUBCATEGORY: SettingsSubcategory = {
  id: "sizing",
  label: "Sizing & motion",
  settings: [
    { id: "chat-width", label: "Chat width", keywords: ["width", "column", "reading"] },
    { id: "font-scale", label: "Text size", keywords: ["font", "scale", "zoom"] },
    { id: "density", label: "Density", keywords: ["compact", "comfortable", "spacing"] },
    { id: "elevation", label: "Surface elevation", keywords: ["layered", "depth", "shadow", "flat"] },
    { id: "reduced-motion", label: "Reduce motion", keywords: ["animation", "transition", "accessibility", "motion"] },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_SIZING_KEYS = ["chatWidthPct", "fontScale", "density", "elevation", "reducedMotion"] as const;
