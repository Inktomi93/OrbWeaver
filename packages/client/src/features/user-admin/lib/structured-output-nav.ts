// The Structured-output admin-section nav entry (D126) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section's `<Section>` anchor stamp; split out so neither imports the other (the
// system-tuning-nav precedent).
//
// The keywords are the words an admin actually types when they hit the wall this knob exists for: a provider
// REJECTED the schema ("required", "strict", "too many optional fields"), not the knob's own name.

import type { ConfigSubcategory } from "#state";

export const STRUCTURED_OUTPUT_SUBCATEGORY: ConfigSubcategory = {
  id: "structured-output",
  label: "Structured output",
  keywords: ["schema", "json", "strict", "required", "optional", "nullable", "grammar", "extraction", "rejected", "400"],
  teach: {
    summary:
      "How the server sends JSON-Schema to models for structured calls: schema strictness level and the delivery vehicle (response_format, tool call or grammar).",
    affects: ["every structured-output call, deployment-wide"],
  },
  settings: [
    {
      id: "structuredOutputShape",
      label: "JSON-Schema shape",
      keywords: ["strict", "nullable", "required"],
      teach: {
        summary: "How strict the JSON-Schema sent for structured calls is \u2014 strict shapes fail loudly, lenient ones tolerate model drift.",
        affects: ["every structured-output call, deployment-wide"],
      },
    },
    {
      id: "structuredOutputVehicle",
      label: "Schema delivery",
      keywords: ["response_format", "tool", "enforced", "grammar", "require_parameters"],
      teach: {
        summary: "How the schema reaches the model \u2014 response_format, an enforced tool call, or a grammar, per what the provider supports.",
        affects: ["every structured-output call, deployment-wide"],
      },
    },
  ],
};
