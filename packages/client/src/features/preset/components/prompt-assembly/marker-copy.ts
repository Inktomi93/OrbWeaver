// Plain-language per-marker copy for the Assembly — a `Record<MarkerType, …>` keyed exhaustively off the
// `MarkerType` enum, so adding a marker and forgetting its copy is a tsc error here, not a blank row in
// production. `label` names the rack row/inspector header; `oneLiner` explains the marker; `subtitle` is
// the terser rack-row source hint.

import type { MarkerType } from "@orb/contracts/preset";

export interface MarkerCopy {
  readonly label: string;
  readonly oneLiner: string;
  readonly subtitle: string;
}

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
