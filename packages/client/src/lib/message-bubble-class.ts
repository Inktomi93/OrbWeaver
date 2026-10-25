// The bubble box and per-role fill as one class string, for the transcript's row skins, which compose class
// strings. The recipe's home is `@orb/ui` (`MESSAGE_BUBBLE_BOX`, `MESSAGE_BUBBLE_FILL`), which is also what a
// `Card shape="bubble"` paints, so a preview bubble and a transcript bubble cannot drift.
import type { MessageRole } from "@orb/kit/message-role";
import { cn, MESSAGE_BUBBLE_BOX, MESSAGE_BUBBLE_FILL } from "@orb/ui/lib";

/** The bubble box for a role. */
export function messageBubbleClass(role: MessageRole): string {
  // `cn` is typed `string | undefined` (never undefined at runtime) — coalesce so callers get a `string`.
  return cn(MESSAGE_BUBBLE_BOX, MESSAGE_BUBBLE_FILL[role]) ?? "";
}
