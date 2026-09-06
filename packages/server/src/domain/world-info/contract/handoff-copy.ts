// domain/world-info/contract/handoff-copy — the `WorldInfoHandoffCopyContext` DI bundle + op type for the
// world-info-owned lore copy the host-handoff property offer executes.
//
// WHY A COPY AND NOT A CARRY. `character.duplicate`'s book carry (PD-141) re-points fresh junctions at the
// SAME books, which is right for a clone inside ONE library. It is exactly WRONG across owners: the
// character-book POOL is owner-filtered (`listCharacterBooks` … `eq(worldBooks.ownerId, ownerId)`), so a
// copied card pointing at the departed host's books loses its entire lore SILENTLY — the card reads fine, the
// entries simply never fire. So the books themselves are copied, entries and all, and the copy's junctions
// point copy→copy.
//
// WHY THE CHAT-ATTACHED BOOKS TOO. A chat's attached books are read UNSCOPED at assembly ("room-public prompt
// content — membership is the caller gate"), so post-handoff the OLD host's books keep firing into the NEW
// host's prompt while the old host retains edit AND delete (junction CASCADE — silent evaporation). That is
// the property-posture asymmetry the review named (cards DROP, chat books LICENSE); under an accepted offer
// the copy severs it, and the room's lore stops being someone else's to revoke.
//
// THE RE-POINT IS RETURNED, NOT WRITTEN. Copying a book is orphan-safe and may land early; MOVING the room's
// attachment is a room-state change and must commit with the role swap, so the `chat_books` statements come
// back UNEXECUTED for the caller's batch (the `handoffHealStatements` co-statement seam).

import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";

/** db + clock + the two id minters. Purpose-built (NOT the full `WorldInfoContext`): a lore copy writes rows
 *  and emits nothing — the same silence the bulk-import writes keep. */
export interface WorldInfoHandoffCopyContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
}

/** One source→copy card pairing the caller already minted — the structural shape of character's
 *  `HandoffCardCopy` (the foreign-op-shape precedent: world-info declares its own copy rather than importing
 *  a sibling domain's type). */
export interface HandoffCardPair {
  readonly sourceCharacterId: CharacterId;
  readonly characterId: CharacterId;
}

/** Copy the room's lore from `fromOwnerId` into `toOwnerId` and return the UNEXECUTED `chat_books` re-point.
 *
 *  Two halves, both OWNER-FILTERED at the source (a book on a seated card that the old host does not own is
 *  not theirs to give and is skipped — the same gate the character-book pool already applies at read time):
 *   • every source card's attached books → fresh books + entries under `toOwnerId`, attached to the CARD COPY
 *     with its role preserved. A book attached to two seated cards is copied ONCE and shared by the two
 *     copies, exactly as it was shared by the originals.
 *   • every `fromOwnerId`-owned book attached to THIS CHAT → a fresh book + entries under `toOwnerId`, plus
 *     the returned detach-original/attach-copy statement pair.
 *
 *  IDEMPOTENT ACROSS A RETRIED ACCEPT without a provenance column: a card copy that already carries junctions
 *  is left alone, and a chat-attached source book whose name `toOwnerId` already owns ON THIS CHAT resolves to
 *  that book instead of minting a second (the `(ownerId, name)` dedup key `importStandaloneLorebook` already
 *  uses). The returned attach is conflict-safe on the `(chatId, worldBookId)` PK. */
export type CopyHandoffBooks = (args: {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
  readonly cardCopies: readonly HandoffCardPair[];
}) => Promise<readonly BatchStmt[]>;

/** How many DISTINCT books {@link CopyHandoffBooks} would mint for `toOwnerId` — the NOMINATE-side
 *  disclosure the `handoff-nominated` notification carries (#1762), answered before anyone has consented to
 *  anything.
 *
 *  READ-ONLY BY CONSTRUCTION, and that is the whole reason it is a second op rather than a `dryRun` flag on
 *  the copy: it runs at NOMINATE, where the nominee has agreed to nothing, so the disclosure must be unable
 *  to write rather than merely choosing not to.
 *
 *  It shares the copy's OWN source reads and its OWN convergence rule (both owner-filtered halves; a
 *  chat-attached book whose name the recipient already owns on this chat is not a mint, exactly as the copy
 *  decides), so the number the nominee is shown and the rows the accept lands cannot come from two rules.
 *  `characterIds` are the SOURCE cards the offer would copy — the copy takes pairs because it already has
 *  them, this takes sources because at nominate no copy exists yet. */
export type CountHandoffBooks = (args: {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
  readonly characterIds: readonly CharacterId[];
}) => Promise<number>;
