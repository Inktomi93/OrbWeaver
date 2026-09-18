// The Effects appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split out so
// neither imports the other. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { BLUR_SURFACE_ITEMS, SURFACE_TEXTURE_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_EFFECTS_SUBCATEGORY: ConfigSubcategory = {
  id: "effects",
  label: "Effects",
  teach: {
    summary: "Surface treatments layered over the app: frosted-glass blur, prose readability shadows, film-grain texture and accent tinting.",
    affects: ["panels, dialogs, composer and message text across the app, on this account"],
  },
  settings: [
    {
      id: "frosted-glass",
      key: "blurSurfaces",
      options: BLUR_SURFACE_ITEMS,
      label: "Frosted glass",
      keywords: ["blur", "glass", "backdrop"],
      teach: {
        summary:
          "Backdrop blur plus a translucent fill on the surfaces you pick. Messages carry glass poorly (scrolling prose over blur), so they stay off unless you opt in.",
        affects: ["the panels, topbar, dialogs and composer you switch on", "readability over a background image"],
        related: [{ group: "appearance", sub: "background", setting: "background-image" }],
      },
    },
    {
      id: "glass-blur",
      key: "blurStrength",
      label: "Glass blur radius",
      teach: { summary: "How strong the frosted-glass blur is, for any surface enabled above.", affects: ["every surface with Frosted glass on"] },
    },
    {
      id: "prose-shadow",
      key: "shadowEffects",
      label: "Prose shadow",
      keywords: ["halo", "readability"],
      teach: { summary: "A subtle readability halo on message text.", affects: ["message text over busy or translucent backdrops"] },
    },
    {
      id: "surface-texture",
      key: "surfaceTexture",
      options: SURFACE_TEXTURE_ITEMS,
      label: "Surface texture",
      keywords: ["grain", "film", "noise"],
      teach: {
        summary:
          "A subtle film-grain overlay across the whole app that breaks up flat-color banding. Off by default; dropped automatically if your system asks for higher contrast.",
        affects: ["every surface in the app"],
      },
    },
    {
      id: "accent-tint",
      key: "enableThemeColorization",
      label: "Tint the UI with the accent color",
      keywords: ["accent", "color", "border", "hairline"],
      teach: {
        summary: "Retints borders and hairlines across panels, dialogs, and the composer from your accent color.",
        affects: ["borders and hairlines app-wide"],
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
export const APPEARANCE_EFFECTS_KEYS = APPEARANCE_OWNER_KEYS.effects;
