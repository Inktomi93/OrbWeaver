// The transcript and theme preview share this value; cross-feature runtime imports are forbidden.
import type { MessageRole } from "@orb/kit/message-role";
import { cn } from "@orb/ui/lib";

/** The per-role fill + ink. Themeable: every token here is a ThemeScope-overridable custom property. */
const BUBBLE_TOKENS: Record<MessageRole, string> = {
  user: "bg-user-bubble text-user-bubble-foreground",
  assistant: "bg-ai-bubble text-ai-bubble-foreground",
  system: "bg-system-bubble text-system-bubble-foreground",
};

/** The bubble box for a role. `w-fit` (D66 N3) so a short reply hugs its text instead of stretching the whole
 *  reading column; `--reading-bubble-cap` caps the long-form line. It is its own token because the reading
 *  floor is a min-width and the transcript measure belongs to the column, not the bubble. */
export function messageBubbleClass(role: MessageRole): string {
  // `cn` is typed `string | undefined` (never undefined at runtime) — coalesce so callers get a `string`.
  return cn("w-fit min-w-0 max-w-(--reading-bubble-cap) rounded-card px-block py-row", BUBBLE_TOKENS[role]) ?? "";
}
