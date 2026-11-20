// The "Accessibility" appearance-section MODEL (SET-SEAMS §6): the one `ConfigSubcategory` shared by the contribution
// def and the section body's `<Section>` anchor stamp. app-shell reads both knobs (the root appearance channel and the
// boot replay), and §6's rule is that a section is owned by its reader. It renders outside the "Customize this look"
// fold, because a person who needs these should not have to know a fold exists.

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { OS_PREFERENCE_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_ACCESSIBILITY_SUBCATEGORY: ConfigSubcategory = {
  id: "accessibility",
  label: "Accessibility",
  keywords: ["a11y", "motion", "contrast", "transparency"],
  teach: {
    summary: "The app's answer to your device's motion, contrast and transparency settings.",
    affects: ["animation, contrast and glass app-wide, on this account"],
  },
  settings: [
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
      id: "increased-contrast",
      key: "increasedContrast",
      label: "Increase contrast",
      options: OS_PREFERENCE_ITEMS,
      keywords: ["contrast", "borders", "accessibility", "legibility"],
      teach: {
        summary:
          "System follows your device's increase-contrast setting. On draws stronger edges, a denser glass fill and drops the texture; Off keeps the standard look even when the device asks for more contrast.",
        affects: ["panel, composer and dialog edges on large screens", "the glass fill and the texture overlay"],
      },
    },
    {
      id: "follow-system-transparency",
      key: "followSystemTransparency",
      label: "Follow the device's reduced transparency",
      keywords: ["transparency", "glass", "blur", "solid", "accessibility"],
      teach: {
        summary: "On, glass surfaces go solid when your device asks for reduced transparency. Off keeps the glass you chose in Frosted glass even then.",
        affects: ["every glass surface while the device asks for reduced transparency"],
      },
    },
  ],
};

/** The `appearance` keys this section, and only this section, writes (SET-SEAMS §2.3 S1/S2): the body's projection,
 *  its form type and the contribution's `owns` claim all read this one spelling. */
export const APPEARANCE_ACCESSIBILITY_KEYS = APPEARANCE_OWNER_KEYS.accessibility;
