// domain/embeddings/contract/handoff-restamp — the `EmbeddingsHandoffRestampContext` DI bundle + op type for
// the embeddings-owned digest re-stamp the host-handoff property offer executes (stickler 2026-08-03 §5.5).
//
// WHY IT EXISTS. The room's derived memory addresses characters BY ID in two places, and both CASCADE on a
// `characters` delete: `chat_digests.scopedCharacterId` (the egocentric bucket key — the row IS keyed by whose
// memory it is) and `chat_digest_speakers.characterId` (the "which characters this digest contains" join that
// lets search find a character's moments across rooms). When the offer copies the cast, the room's cast id
// changes; leaving these pointed at the ORIGINALS would mean the departed host deleting their library
// silently evaporates the transferred room's memory — the exact dependency the copy exists to sever.
//
// SPEAKERS ALONE WOULD BE HALF A MIGRATION. Re-stamping only the join keeps the cross-room lookup honest
// while the digest ROW still hangs off the old card; the delete cascade takes the whole digest anyway. Both
// columns move, or neither is worth moving.
//
// NOT A COPY OF THE VECTORS. D64's "the old buckets orphan, the new host's assembly rebuilds" still stands for
// everything OUTSIDE this room — this op re-keys the rows of ONE chat that is changing hands, it does not
// re-embed, re-scope or migrate a library.
//
// The return is UNEXECUTED statements: the re-key is a property of the authority move and must commit in the
// SAME batch as the role swap (the `handoffHealStatements` co-statement seam).

import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId } from "@orb/kit/ids";

/** db only — a re-key writes no vectors, mints no ids and needs no clock. */
export interface EmbeddingsHandoffRestampContext {
  readonly db: Db;
}

/** One source→copy card pairing (the structural shape of character's `HandoffCardCopy` — embeddings declares
 *  its own copy rather than importing a sibling domain's type). */
export interface HandoffRestampPair {
  readonly sourceCharacterId: CharacterId;
  readonly characterId: CharacterId;
}

/** The digest statements the host-handoff swap must carry for `chatId` — empty for an empty pair list.
 *  Every statement is scoped to `chatId` AND the exact source id: an identical card witnessing another room
 *  is never touched, and the chat's authority was proven by the caller. Collision-free by construction — the
 *  copy ids are freshly minted, so no `(chatId, scopedCharacterId, tier, blockIdx, model)` unique and no
 *  `(digestId, characterId)` PK can already hold the destination. */
export type HandoffRestampStatements = (args: { readonly chatId: ChatId; readonly pairs: readonly HandoffRestampPair[] }) => Promise<readonly BatchStmt[]>;
