// domain/character/contract/avatar-link — the `CharacterAvatarLinkContext` DI bundle + op type for the
// character-OWNED avatar-pointer WRITE (`createLinkCharacterAvatars`), the mirror of persona's
// `contract/import.ts` / `createBulkImportPersonas`.
//
// WHY IT EXISTS. `assets.backfillAvatars` (the workload re-link of staged card PNGs) has to write
// `characters.avatarAssetId` — another domain's column. Tier-1-DB.md §"Cross-tier composition" allows a
// cross-domain READ in `persistence/` but routes every cross-domain WRITE through the OWNING domain's own
// persistence helper (`domain/import` writes six domains' canon and imports `@orb/db` zero times), and
// AGENTS §2 makes the delivery an INJECTED op, never a sideways import. So the write lives here and assets
// receives it as `AssetsContext.linkCharacterAvatars`, wired at `entry/compose/assets-character.ts`.
//
// A PURPOSE-BUILT context (NOT the full `CharacterContext`): the relink needs only `db` — no audit, no
// event bus, no id minter. A backfill is a maintenance reconciliation, not a card edit: it emits nothing
// and snapshots nothing (the same silence persona's bulk-import write keeps).

import type { Db } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";

/** The DI bundle `createLinkCharacterAvatars` closes over (assembled at the entry composition root). */
export interface CharacterAvatarLinkContext {
  readonly db: Db;
}

/** One character→avatar pairing the backfill proved (the stored blob's hash matched the card's `importHash`). */
export interface CharacterAvatarLink {
  readonly characterId: CharacterId;
  readonly assetId: AssetId;
}

/** The character-owned avatar-relink op the entry root wires into `AssetsContext.linkCharacterAvatars`.
 *  Owner-scoped per row (`ownerId` is in every WHERE), one `db.batch`; a no-op on an empty list. */
export type LinkCharacterAvatars = (args: { readonly ownerId: UserId; readonly links: readonly CharacterAvatarLink[] }) => Promise<void>;
