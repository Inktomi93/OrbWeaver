// The licence a room write door takes (D166): the room's claim, or an exemption for a write that needs none.
// `orb/room-token-mint` lists each exemption site with the reason it needs no claim of its own.

import type { RoomClaim } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";

declare class ClaimExemptMint {
  private claimExempt(): void;
}

/** A room write that does not claim: the room was claimed by an earlier step, or D166 rules the write non-claiming. */
export interface ClaimExempt extends ClaimExemptMint {
  readonly chatId: ChatId;
}

/** What a room write door shared by claiming and non-claiming callers takes. */
export type RoomWriteLicence = RoomClaim | ClaimExempt;
