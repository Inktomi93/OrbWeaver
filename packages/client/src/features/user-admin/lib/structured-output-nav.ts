// The Structured-output admin-section nav entry (D126) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section's `<Section>` anchor stamp; split out so neither imports the other (the
// system-tuning-nav precedent).
//
// The keywords are the words an admin actually types when they hit the wall this knob exists for: a provider
// REJECTED the schema ("required", "strict", "too many optional fields"), not the knob's own name.

import type { SettingsSubcategory } from "#state";

export const STRUCTURED_OUTPUT_SUBCATEGORY: SettingsSubcategory = {
  id: "structured-output",
  label: "Structured output",
  keywords: ["schema", "json", "strict", "required", "optional", "nullable", "grammar", "extraction", "rejected", "400"],
  settings: [
    { id: "structuredOutputShape", label: "JSON-Schema shape", keywords: ["strict", "nullable", "required"] },
    { id: "structuredOutputVehicle", label: "Schema delivery", keywords: ["response_format", "tool", "enforced", "grammar", "require_parameters"] },
  ],
};
