// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { ChatId, UserId } from "@orb/kit/ids";

/** Cancel the owner's in-flight state rounds on a chat and return how many were signalled. */
export type CancelStateRoundsOp = (chatId: ChatId, ownerUserId: UserId) => number;
