import type { MessageRole } from "@orb/kit/message-role";

/** The bubble box: the elevated radius and the island inset, fit to its text (a short reply hugs its words instead of
 *  stretching the column) and capped at `--reading-bubble-cap` for a long one. The cap is its own token because the
 *  reading floor is a min-width and the transcript measure belongs to the column, not the bubble. */
export const MESSAGE_BUBBLE_BOX = "rounded-card px-block py-row inline-fit max-inline-(--reading-bubble-cap) min-inline-0";

/** The per-role fill and its paired ink. Every token is a ThemeScope-overridable custom property. */
export const MESSAGE_BUBBLE_GROUND = {
  user: "bg-user-bubble text-user-bubble-foreground",
  assistant: "bg-ai-bubble text-ai-bubble-foreground",
  system: "bg-system-bubble text-system-bubble-foreground",
} as const satisfies Record<MessageRole, string>;

/** The per-role fill and ink as a box's, edgeless. The edge colour returns to the ink: a Card's base `border-border`
 *  would otherwise colour the sides a decoration leaves at zero width beside the one edge it draws inline (whisper's
 *  stripe), and that mixed-colour edge changes how Chromium rasterises the box's text. */
export const MESSAGE_BUBBLE_FILL = {
  user: `border-0 border-current ${MESSAGE_BUBBLE_GROUND.user}`,
  assistant: `border-0 border-current ${MESSAGE_BUBBLE_GROUND.assistant}`,
  system: `border-0 border-current ${MESSAGE_BUBBLE_GROUND.system}`,
} as const satisfies Record<MessageRole, string>;
