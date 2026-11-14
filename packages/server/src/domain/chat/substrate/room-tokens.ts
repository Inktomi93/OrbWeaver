// The one home of the room tokens' runtime values (D166). The tokens carry only their room; their worth is that
// `orb/room-token-mint` lets each mint run only at its listed sites, so holding one proves the step that mints it ran.

import type { RoomAdmission, RoomClaim } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ClaimExempt } from "../contract/room-write.ts";

/** Minted by a membership gate once it has loaded the caller's present seat in `chatId`. */
export function mintRoomAdmission(chatId: ChatId): RoomAdmission {
  return Object.freeze({ chatId }) as RoomAdmission;
}

/** Minted by the claim op once the room's claim has settled. */
export function mintRoomClaim(chatId: ChatId): RoomClaim {
  return Object.freeze({ chatId }) as RoomClaim;
}

/** Minted by a write that needs no claim of its own. */
export function mintClaimExempt(chatId: ChatId): ClaimExempt {
  return Object.freeze({ chatId }) as ClaimExempt;
}
