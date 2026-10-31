// The retained parent a generation-observation session records under.

import type { ChatId, ChatTurnId, MessageId, MessageVariantId } from "@orb/kit/ids";

/** A retained source fences late responses; absent source ids mean the room itself is the parent. */
export interface GenerationObservationParent {
  readonly chatId: ChatId;
  readonly turnId: ChatTurnId;
  readonly sourceMessageId: MessageId | null;
  readonly sourceVariantId: MessageVariantId | null;
}

/** Opens a retained observation sink for an admitted host-door call. `Callback` is the provider's report callback,
 *  a runtime type contracts cannot name. */
export type BeginGenerationObservationOp<Callback> = (parent: GenerationObservationParent) => Callback;
