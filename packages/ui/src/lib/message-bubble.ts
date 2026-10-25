import type { MessageRole } from "@orb/kit/message-role";

/** The bubble box: the elevated radius and the island inset, fit to its text (a short reply hugs its words instead of
 *  stretching the column) and capped at `--reading-bubble-cap` for a long one. The cap is its own token because the
 *  reading floor is a min-width and the transcript measure belongs to the column, not the bubble. */
export const MESSAGE_BUBBLE_BOX = "rounded-card px-block py-row inline-fit max-inline-(--reading-bubble-cap) min-inline-0";

/** The per-role fill and ink, edgeless. Every token is a ThemeScope-overridable custom property. */
export const MESSAGE_BUBBLE_FILL = {
  user: "border-0 bg-user-bubble text-user-bubble-foreground",
  assistant: "border-0 bg-ai-bubble text-ai-bubble-foreground",
  system: "border-0 bg-system-bubble text-system-bubble-foreground",
} as const satisfies Record<MessageRole, string>;
