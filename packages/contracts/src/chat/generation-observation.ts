// The retained parent a generation-observation session records under.

import type { ChatId, ChatTurnId, MessageId, MessageVariantId } from "@orb/kit/ids";

/** A retained source fences late responses; absent source ids mean the room itself is the parent. */
export interface GenerationObservationParent {
  readonly chatId: ChatId;
  readonly turnId: ChatTurnId;
  readonly sourceMessageId: MessageId | null;
  readonly sourceVariantId: MessageVariantId | null;
}
