// The imagery-templates settings-section nav entry (Phase B ⑫) — the ONE `SettingsSubcategory` shared by the
// contribution def (imagery-templates-section.tsx) and the section surface's `<Section>` anchor stamp; split
// out so neither imports the other (the databank-settings-section-nav precedent).

import type { SettingsSubcategory } from "#state";

export const IMAGERY_TEMPLATES_SUBCATEGORY: SettingsSubcategory = {
  id: "imagery-templates",
  label: "Image prompts",
  keywords: ["image", "imagine", "prompt", "template", "caption", "portrait", "scene", "background", "picture", "generation"],
};
