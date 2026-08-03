// domain/character/contract/handoff-copy — the `CharacterHandoffCopyContext` DI bundle + op type for the
// character-OWNED card copy the host handoff's property offer executes (stickler 2026-08-03 §5.1).
//
// WHY IT EXISTS. `chat.acceptHostHandoff` must mint cards into the NOMINEE's library from cards the OLD HOST
// owns — a cross-domain write, and a deliberately cross-TENANT one (it is a gift, made by the departing host
// at nominate and accepted by the nominee at accept). Tier-1-DB.md §"Cross-tier composition" routes every
// cross-domain write through the OWNING domain's own persistence factory, injected as an op (the
// `createLinkCharacterAvatars` / `createBulkImportPersonas` precedent), so the write lives in `character`
// and chat receives it as `ChatContext.copyHandoffCards`.
//
// WHY NOT `duplicate`. `duplicate` is principal-scoped in both directions: it reads the source under the
// CALLER's ownership and mints under the same. A handoff copy crosses owners by construction, and it must
// also carry PROVENANCE (`duplicate` deliberately CLEARS it — a clone is app-authored). That provenance is
// not decoration: it is the idempotency key (below).
//
// BOTH ENDS ARE EXPLICIT PARAMS, AND BOTH ARE PROVEN HERE (the injected-op caller-gate class). `fromOwnerId`
// is the ownership axis every source read carries in its WHERE — a card that is not the old host's is not a
// candidate and cannot be gifted by naming its id. `toOwnerId` is the nominee. An op that re-derived either
// end would be a cross-tenant hole the moment a second call site appeared.
//
// IDEMPOTENT BY PROVENANCE, NOT BY LUCK. Every copy is stamped `importedFrom = handoff:<chatId>:<sourceId>`
// (see `handoffProvenance`), and the op FINDS BEFORE IT MINTS under that exact key. So a crash between the
// mint phase and the room swap leaves inert library rows the nominee owns, and a re-accept converges on the
// SAME copies rather than minting a second set — which is the whole reason the mints are allowed to land
// before the atomic swap at all.

import type { Db } from "@orb/db";
import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";

/** Re-own ONE avatar blob into the recipient's library, returning the RECIPIENT's asset id (or `null` when
 *  the source asset is gone / not the old host's — the copy then lands faceless rather than not at all).
 *
 *  A copy CANNOT carry `avatarAssetId` verbatim: `assets` is per-owner with a `(owner_id, hash)` dedup key
 *  (D21), so a foreign id on the nominee's card is a pointer into a library they cannot read AND a GC root
 *  holding the departed host's blob alive through a row they no longer control. Content-addressing makes the
 *  re-own cheap and idempotent — the same bytes under an owner who already has them resolve to their existing
 *  row rather than a second copy. Injected (assets owns the table); wired at the entry composition root. */
export type CopyAvatarToOwner = (args: { readonly fromOwnerId: UserId; readonly toOwnerId: UserId; readonly assetId: AssetId }) => Promise<AssetId | null>;

/** The DI bundle `createCopyHandoffCards` closes over (assembled at the entry composition root). Purpose-
 *  built, NOT the full `CharacterContext`: the copy needs `db` + the clock + the id minter + the avatar
 *  re-own. It deliberately emits NO `character.updated` and writes NO audit row — the chat verb owns the
 *  audit for the transfer, and the embedding of a copied card rides the nominee's own next index sweep (the
 *  bulk-write silence `createBulkImportPersonas` keeps). */
export interface CharacterHandoffCopyContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newCharacterId: () => CharacterId;
  readonly copyAvatar: CopyAvatarToOwner;
}

/** One source→copy pairing the op resolved: `sourceCharacterId` is the OLD host's card (the id the room's
 *  seats, canon stamps and rpg rows still point at), `characterId` is the nominee's copy. `minted` is false
 *  when a prior accept attempt already landed this copy and the provenance key found it — the caller re-points
 *  at it exactly the same way (the distinction exists for the audit trail, not for control flow). */
export interface HandoffCardCopy {
  readonly sourceCharacterId: CharacterId;
  readonly characterId: CharacterId;
  readonly minted: boolean;
}

/** Copy the named cards from `fromOwnerId`'s library into `toOwnerId`'s, point-in-time and verbatim.
 *
 *  Returns one entry per card that RESOLVED under `fromOwnerId` — a source id that is not the old host's (or
 *  was deleted between nominate and accept) is silently absent from the result, and the caller's seat for it
 *  falls back to the built D64 drop. That is the honest degrade: the alternative is refusing an accept because
 *  a card the accepting user never had any claim on went away. */
export type CopyHandoffCards = (args: {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  /** The room the transfer is FOR — the provenance key's scope, so the same card gifted through two different
   *  rooms yields two independent copies rather than one shared by accident. */
  readonly chatId: ChatId;
  readonly characterIds: readonly CharacterId[];
}) => Promise<readonly HandoffCardCopy[]>;

/** The provenance stamp a handoff copy carries — ALSO the find-before-mint idempotency key. One home, because
 *  the writer and the finder must never spell it differently (a drifted key mints a duplicate library on every
 *  retry). Exported for the test that pins the format. */
export function handoffProvenance(chatId: ChatId, sourceCharacterId: CharacterId): string {
  return `handoff:${chatId}:${sourceCharacterId}`;
}
