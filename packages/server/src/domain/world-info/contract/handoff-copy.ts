// domain/world-info/contract/handoff-copy — the `WorldInfoHandoffCopyContext` DI bundle + op type for the
// world-info-owned lore copy the host-handoff property offer executes.
//
// WHY A COPY AND NOT A CARRY. `character.duplicate`'s book carry re-points fresh junctions at the
// SAME books, which is right for a clone inside ONE library. It is exactly WRONG across owners: the
// character-book POOL is owner-filtered (`listCharacterBooks` … `eq(worldBooks.ownerId, ownerId)`), so a
// copied card pointing at the departed host's books loses its entire lore SILENTLY — the card reads fine, the
// entries simply never fire. So the books themselves are copied, entries and all, and the copy's junctions
// point copy→copy.
//
// WHY THE CHAT-ATTACHED BOOKS TOO. A book the old host owns stays theirs to edit and delete, so the room keeps
// it only as a copy under the new host. Without an accepted offer the swap detaches it instead
// ({@link DetachHandoffBooks}), and the chat pool reads only host-owned chat books (D64).
//
// THE RE-POINT IS RETURNED, NOT WRITTEN. Copying a book is orphan-safe and may land early; MOVING the room's
// attachment is a room-state change and must commit with the role swap, so the `chat_books` statements come
// back UNEXECUTED for the caller's batch (the `handoffHealStatements` co-statement seam).

import type { CopyHandoffBooksArgs } from "@orb/contracts/world-info";
import type { StatementToken } from "@orb/db/wiring";
import type { ChatId, UserId } from "@orb/kit/ids";

/** The UNEXECUTED `chat_books` delete the handoff swap commits (D64): every book attached to `chatId` that
 *  `hostUserId`, the incoming host, does not own leaves the room. It runs after the copy re-point, so the
 *  copies an accepted offer attached stay. */
export type DetachHandoffBooks = (args: { readonly chatId: ChatId; readonly hostUserId: UserId }) => StatementToken;

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
export type CopyHandoffBooks = (args: CopyHandoffBooksArgs) => Promise<readonly StatementToken[]>;
