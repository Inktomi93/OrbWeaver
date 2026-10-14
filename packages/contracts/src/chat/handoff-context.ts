import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";

/** Source and recipient identities in an already-authorized host-handoff plan. */
export interface HandoffCardPair {
  readonly sourceCharacterId: CharacterId;
  readonly characterId: CharacterId;
}

export interface HandoffCardCopy extends HandoffCardPair {
  readonly minted: boolean;
}

/** Cross-domain handoff data; the chat verb resolves authority before invoking its owning-domain operations. */
export interface HandoffHealArgs {
  readonly chatId: ChatId;
  readonly newHostUserId: UserId;
  readonly oldHostUserId: UserId | null;
  readonly copyGmPreset: boolean;
  readonly cardCopies: readonly HandoffCardPair[];
}
