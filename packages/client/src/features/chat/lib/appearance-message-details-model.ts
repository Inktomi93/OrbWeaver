// The "Message details & actions" appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts:
// the ONE `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp.
//
// This subcategory ABSORBS the pane's old `message-actions` sub: `messageActions` is read by the same chat hook as
// the `show*` chips (`use-message-appearance.ts`), so under §6's reader-owns rule they are ONE section — a section is
// the unit of ownership, and a two-key sub whose keys belong to this reader would be a split with no owner-boundary
// behind it. The `message-details` anchor id is unchanged (§7.1); the absorbed sub's search LEAF (`message-actions`)
// travels here intact (§7.2), so the fuzzy jump still lands on a real anchor.

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY: SettingsSubcategory = {
  id: "message-details",
  label: "Message details & actions",
  keywords: ["metadata"],
  settings: [
    { id: "show-timestamps", label: "Show timestamps", keywords: ["time", "date"] },
    { id: "show-message-id", label: "Show message ID" },
    { id: "show-model", label: "Show model" },
    { id: "show-token-count", label: "Show token count", keywords: ["tokens", "usage"] },
    { id: "show-generation-time", label: "Show generation time", keywords: ["timer", "duration"] },
    { id: "show-generation-cost", label: "Show generation cost", keywords: ["cost", "price", "spend"] },
    { id: "show-reasoning", label: "Show reasoning icon", keywords: ["thinking", "reasoning"] },
    { id: "message-actions", label: "Action cluster", keywords: ["edit", "delete", "fork", "copy", "hide", "hover"] },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_MESSAGE_DETAILS_KEYS = [
  "showTimestamps",
  "showMessageId",
  "showModelIcon",
  "showTokenCount",
  "showGenerationTimer",
  "showGenerationCost",
  "showLLMReasoningIcon",
  "messageActions",
] as const;
