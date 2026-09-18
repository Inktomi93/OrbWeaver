// The "Streaming" chat-behavior SECTION MODEL (SET-SEAMS §6, stage 2) — the section's non-JSX facts: the ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp
// (split out so neither imports the other), the `OWNS` key tuple, and the scroll-mode Select options. The
// `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).

import type { ChatSettings } from "@orb/contracts/settings";
import { STREAM_SCROLL_MODES } from "@orb/contracts/settings";
import type { SelectOption } from "@orb/ui/select";
import type { ConfigSubcategory } from "#state";

const STREAM_SCROLL_MODE_LABELS: Record<ChatSettings["streamScrollMode"], string> = {
  follow: "Follow the reply",
  "pin-prompt": "Pin my message to the top",
};

/** The scroll-mode Select options — pinned to the contract union so a typo'd value is a tsc error. */
export const STREAM_SCROLL_MODE_ITEMS: readonly SelectOption<string>[] = STREAM_SCROLL_MODES.map((value) => ({
  value,
  label: STREAM_SCROLL_MODE_LABELS[value],
}));

export const CHAT_STREAMING_SUBCATEGORY: ConfigSubcategory = {
  id: "streaming",
  label: "Streaming",
  keywords: ["stream", "reveal", "typing"],
  teach: {
    summary: "How replies appear while they stream: scroll behavior, smooth reveal pacing and whether reasoning traces auto-collapse.",
    affects: ["the streaming experience in every chat, on this account"],
  },
  settings: [
    {
      id: "stream-follow",
      key: "streamScrollMode",
      options: STREAM_SCROLL_MODE_ITEMS,
      label: "While a reply streams",
      keywords: ["follow", "pin", "scroll", "anchor"],
      teach: {
        summary:
          "Follow keeps the newest text in view. Pin scrolls your just-sent message to the top and holds it there while the reply grows below (ChatGPT-style).",
        affects: ["the transcript's scroll behavior while a reply streams"],
      },
    },
    {
      id: "smooth-stream",
      key: "smoothStream",
      label: "Smooth streaming",
      keywords: ["smooth", "reveal", "pace", "fade", "typing"],
      teach: {
        summary: "Reveals replies at a steady pace instead of raw network chunks. The reveal speeds up automatically when the model gets ahead.",
        affects: ["how streaming text paints — never what arrives"],
        related: [{ group: "chat-behavior", sub: "streaming", setting: "smooth-stream-cps" }],
      },
    },
    {
      id: "smooth-stream-cps",
      key: "smoothStreamCps",
      label: "Reveal speed",
      keywords: ["speed", "cps", "rate", "characters"],
      teach: { summary: "The minimum reveal rate (characters per second) while the model is keeping pace.", affects: ["smooth streaming's floor speed"] },
    },
    {
      id: "reasoning-auto-collapse",
      key: "reasoningAutoCollapse",
      label: "Auto-collapse reasoning",
      keywords: ["reasoning", "thinking", "collapse", "trace"],
      teach: {
        summary:
          "Folds a reasoning-capable model's thinking trace to a 'Thought for Ns' summary the moment its answer starts. Off keeps the trace open until you close it.",
        affects: ["reasoning-capable models' messages"],
      },
    },
  ],
};

/** The `chat` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE spelling,
 *  four consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form type, and the
 *  contribution's `owns` claim. */
export const CHAT_STREAMING_KEYS = ["streamScrollMode", "smoothStream", "smoothStreamCps", "reasoningAutoCollapse"] as const;

export const SMOOTH_STREAM_CPS_MIN = 15;
export const SMOOTH_STREAM_CPS_MAX = 300;
