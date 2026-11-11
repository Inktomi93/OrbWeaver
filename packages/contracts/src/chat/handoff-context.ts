import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { z } from "zod";

/** Source and recipient identities in an already-authorized host-handoff plan. */
export interface HandoffCardPair {
  readonly sourceCharacterId: CharacterId;
  readonly characterId: CharacterId;
}

export interface HandoffCardCopy extends HandoffCardPair {}

// Internal, FK-derived ids rather than wire input: the parse proves the stored string kind, because the source and
// destination were minted or read through character's typed doors before a handoff marker exists.
const storedCharacterId = (field: string): z.ZodType<CharacterId> =>
  z.custom<CharacterId>((value) => typeof value === "string" && value.length > 0, { error: `${field} must be a non-empty string` });

/** The actor re-keys `chat_handoff_resumptions.actor_rekeys` stores; chat's read seam parses a stored row with it. */
export const handoffCardPairsSchema = z.array(
  // Stored data: a key outside the pair is dropped on read.
  z.object({ sourceCharacterId: storedCharacterId("sourceCharacterId"), characterId: storedCharacterId("characterId") }).strip(),
) satisfies z.ZodType<readonly HandoffCardPair[]>;

/** Cross-domain handoff data; the chat verb resolves authority before invoking its owning-domain operations. */
export interface HandoffHealArgs {
  readonly chatId: ChatId;
  readonly newHostUserId: UserId;
  readonly oldHostUserId: UserId | null;
  readonly copyGmPreset: boolean;
  readonly cardCopies: readonly HandoffCardPair[];
}
