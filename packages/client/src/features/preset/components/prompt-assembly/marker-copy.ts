// Plain-language per-marker copy for The Assembly (BUILD-SPEC §2.1) — REGISTRY-AS-DATA, node-safe. A
// `Record<MarkerType, …>` keyed EXHAUSTIVELY off the imported `MarkerType` enum: adding a marker to the
// contract (`preset/index.ts` MARKER_TYPES) and forgetting its copy is a `tsc` error HERE, not a blank
// row in production. This is a net-new FILE, not net-new machinery — pure lookup data.
//
// The three strings map to the three surfaces the copy feeds (§3.3 / §3.5):
//   - `label`    — the human name on the rack row + inspector header (vs the raw snake_case marker).
//   - `oneLiner` — the one-line "what this is / where it comes from" under the inspector header.
//   - `subtitle` — the terser rack-row subtitle (source hint), shown beside the row name.
// For the two empty-default templated markers (`main_prompt` / `post_history`) the `oneLiner` doubles
// as the empty-default explainer the inspector shows instead of a bare ghost.

import type { MarkerType } from "@orb/contracts/preset";

export interface MarkerCopy {
  readonly label: string;
  readonly oneLiner: string;
  readonly subtitle: string;
}

// Bracketed string-literal keys match the snake_case `MarkerType` members verbatim (the same idiom
// `DEFAULT_MARKER_TEMPLATES` uses to sidestep `useNamingConvention` on the slot names).
/** The plain-language copy for every marker slot. Exhaustive over `MarkerType` by construction. */
export const MARKER_COPY: Record<MarkerType, MarkerCopy> = {
  ["main_prompt"]: {
    label: "Main prompt",
    oneLiner: "Your top-level system instruction — the character's card can replace it in place.",
    subtitle: "your core system instruction",
  },
  ["char_description"]: {
    label: "Character description",
    oneLiner: "The active character's description, wrapped by this section's framing.",
    subtitle: "from the character card",
  },
  ["char_personality"]: {
    label: "Character personality",
    oneLiner: "The active character's personality summary.",
    subtitle: "from the character card",
  },
  ["scenario"]: {
    label: "Scenario",
    oneLiner: "The scene or setting the character card declares.",
    subtitle: "from the character card",
  },
  ["dialogue_examples"]: {
    label: "Dialogue examples",
    oneLiner: "Example exchanges that teach the character's voice.",
    subtitle: "from the character card",
  },
  ["post_history"]: {
    label: "Post-history instructions",
    oneLiner:
      "A reminder placed after the conversation — the character's card can replace it in place.",
    subtitle: "reminder after the conversation",
  },
  ["persona"]: {
    label: "Persona",
    oneLiner: "Who YOU are in the scene — your persona's description.",
    subtitle: "from your persona",
  },
  ["memory"]: {
    label: "Memory",
    oneLiner: "Long-term notes carried forward from earlier in the chat.",
    subtitle: "remembered past events",
  },
  ["compact_summary"]: {
    label: "Summary",
    oneLiner: "The running summary of the conversation so far (from /compact).",
    subtitle: "conversation summary",
  },
  ["guided_instruction"]: {
    label: "Guided instruction",
    oneLiner: "The wrapper that lands when you steer a generation (see Guided actions).",
    subtitle: "your steer, wrapped",
  },
  ["chat_history"]: {
    label: "Chat history",
    oneLiner: "The conversation itself — the pivot everything sits before or after.",
    subtitle: "the conversation",
  },
  ["world_info_before"]: {
    label: "World info (before)",
    oneLiner: "Lorebook entries positioned to sit before the conversation.",
    subtitle: "lorebook — before",
  },
  ["world_info_after"]: {
    label: "World info (after)",
    oneLiner: "Lorebook entries positioned to sit after the conversation.",
    subtitle: "lorebook — after",
  },
};
