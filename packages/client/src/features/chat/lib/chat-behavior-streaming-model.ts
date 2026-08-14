// The "Streaming" chat-behavior SECTION MODEL (SET-SEAMS §6, stage 2) — the section's non-JSX facts: the ONE
// `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp
// (split out so neither imports the other), the `OWNS` key tuple, and the scroll-mode Select options. The
// `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).

import type { ChatSettings } from "@orb/contracts/settings";
import { STREAM_SCROLL_MODES } from "@orb/contracts/settings";
import type { SelectItems } from "@orb/ui/select";
import type { SettingsSubcategory } from "#state";

export const CHAT_STREAMING_SUBCATEGORY: SettingsSubcategory = {
  id: "streaming",
  label: "Streaming",
  keywords: ["stream", "reveal", "typing"],
  settings: [
    { id: "smooth-stream", label: "Smooth streaming", keywords: ["smooth", "reveal", "pace", "fade", "typing"] },
    { id: "smooth-stream-cps", label: "Reveal speed", keywords: ["speed", "cps", "rate", "characters"] },
    { id: "reasoning-auto-collapse", label: "Auto-collapse reasoning", keywords: ["reasoning", "thinking", "collapse", "trace"] },
  ],
};

/** The `chat` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE spelling,
 *  four consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form type, and the
 *  contribution's `owns` claim. */
export const CHAT_STREAMING_KEYS = ["streamScrollMode", "smoothStream", "smoothStreamCps", "reasoningAutoCollapse"] as const;

export const SMOOTH_STREAM_CPS_MIN = 15;
export const SMOOTH_STREAM_CPS_MAX = 300;

const STREAM_SCROLL_MODE_LABELS: Record<ChatSettings["streamScrollMode"], string> = {
  follow: "Follow the reply",
  "pin-prompt": "Pin my message to the top",
};

/** The scroll-mode Select options — pinned to the contract union so a typo'd value is a tsc error. */
export const STREAM_SCROLL_MODE_ITEMS: SelectItems<string> = STREAM_SCROLL_MODES.map((value) => ({
  value,
  label: STREAM_SCROLL_MODE_LABELS[value],
}));
