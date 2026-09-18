// The "Message details & actions" appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts:
// the ONE `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp.
//
// This subcategory ABSORBS the pane's old `message-actions` sub: `messageActions` is read by the same chat hook as
// the `show*` chips (`use-message-appearance.ts`), so under §6's reader-owns rule they are ONE section — a section is
// the unit of ownership, and a two-key sub whose keys belong to this reader would be a split with no owner-boundary
// behind it. The `message-details` anchor id is unchanged (§7.1); the absorbed sub's search LEAF (`message-actions`)
// travels here intact (§7.2), so the fuzzy jump still lands on a real anchor.

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { MESSAGE_ACTIONS_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY: ConfigSubcategory = {
  id: "message-details",
  label: "Message details & actions",
  // The full name overflows the 220px nav column; the heading keeps it, the nav row drops the "& actions"
  // half (the action cluster is one of eight knobs here, the metadata chips are the section).
  navLabel: "Message details",
  keywords: ["metadata"],
  teach: {
    summary: "Per-message metadata chips (timestamps, token count, cost, model, reasoning icon) and the action cluster (edit/fork/delete/copy).",
    affects: ["message chrome and hover actions in every chat, on this account"],
  },
  settings: [
    {
      id: "show-timestamps",
      key: "showTimestamps",
      label: "Show timestamps",
      keywords: ["time", "date"],
      teach: { summary: "A time chip on every message.", affects: ["message chrome in every chat"] },
    },
    {
      id: "show-message-id",
      key: "showMessageId",
      label: "Show message ID",
      teach: { summary: "The message's stable id, for scripting and reference.", affects: ["message chrome in every chat"] },
    },
    {
      id: "show-model",
      key: "showModelIcon",
      label: "Show model",
      teach: { summary: "Credits the model that generated the message, in its actions row on hover.", affects: ["assistant messages' hover chrome"] },
    },
    {
      id: "show-token-count",
      key: "showTokenCount",
      label: "Show token count",
      keywords: ["tokens", "usage"],
      teach: { summary: "The message's token usage, when known.", affects: ["message chrome in every chat"] },
    },
    {
      id: "show-generation-time",
      key: "showGenerationTimer",
      label: "Show generation time",
      keywords: ["timer", "duration"],
      teach: { summary: "How long the model took to generate the message, when known.", affects: ["assistant messages' chrome"] },
    },
    {
      id: "show-generation-cost",
      key: "showGenerationCost",
      label: "Show generation cost",
      keywords: ["cost", "price", "spend"],
      teach: {
        summary: "A click-to-reveal per-message cost, settled on demand against OpenRouter.",
        affects: ["assistant messages' chrome, on OpenRouter connections"],
      },
    },
    {
      id: "show-reasoning",
      key: "showLLMReasoningIcon",
      label: "Show reasoning icon",
      keywords: ["thinking", "reasoning"],
      teach: { summary: "A small glyph on the reasoning disclosure, alongside its Thinking/Thought label.", affects: ["reasoning-capable models' messages"] },
    },
    {
      id: "message-actions",
      key: "messageActions",
      label: "Action cluster",
      options: MESSAGE_ACTIONS_ITEMS,
      keywords: ["edit", "delete", "fork", "copy", "hide", "hover"],
      teach: { summary: "Edit/hide/fork/delete/copy — shown on hover (default) or always.", affects: ["every message row's action affordances"] },
    },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_MESSAGE_DETAILS_KEYS = APPEARANCE_OWNER_KEYS["message-details"];
