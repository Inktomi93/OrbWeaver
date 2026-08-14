// domain/chat/contract/import — the `ChatImportContext` DI bundle for the bulk-import WRITE op
// (`createBulkImportChats`, Option B). A PURPOSE-BUILT context (NOT the full `ChatContext`): the bulk-import
// path needs only the db handle + the injected clock + the chat id minters — no `can()`/roles/bus/assembly.
// Homed under `contract/` (the `types-in-contract`/`no-context-returntype` gate forbids an exported type in a
// conventional `context.ts` slot); an explicit `interface`, never `ReturnType<typeof …>`.
//
// The bulk-import op is `import`'s injected write seam: `import` translates ST → the canonical
// `BulkImportChatInput` (`@orb/contracts/chat`) and calls this op. Chat owns the WRITE (its own tables +
// row shapes — D26 slot/variant, the founding roster, branch resolution); it learns nothing about ST.

import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { AssetId, CharacterId, ChatId, ChatInjectionId, ChatParticipantId, MessageAssetId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { MintSyntheticGroupCharacterOp } from "./context.ts";

/** The DI bundle `createBulkImportChats` closes over (assembled at the entry composition root). All ids are
 *  minted by the INJECTED minters (determinism — no ambient `mintTypeId()` in the write). */
export interface ChatImportContext {
  readonly db: Db;
  /** The injected clock (epoch-ms) — the fallback when a chat/message carries no ST date. */
  readonly now: () => number;
  readonly newChatId: () => ChatId;
  readonly newMessageId: () => MessageId;
  readonly newMessageVariantId: () => MessageVariantId;
  readonly newMessageAssetId: () => MessageAssetId;
  readonly newParticipantId: () => ChatParticipantId;
  /** The imported author's-note prompt lands as a `chat_injections` row (the ONE per-chat prose door — the
   *  room-override author's note is retired), so the write mints injection ids. */
  readonly newChatInjectionId: () => ChatInjectionId;
  /** #67 — the subset of `assetIds` that EXIST for `ownerId` on the target box (owner-scoped; wired from
   *  `assets.resolveOwnedAssetRefs`). Import re-creates a `message_assets` retaining row ONLY for an inline
   *  `asset:<id>` body ref whose asset actually landed (the bundle's `assets` entity imports FIRST, so a
   *  bundled attachment resolves); a ref to a non-bundled asset degrades to plain body text (no dangling FK,
   *  matching the asset-refs "generic canon-scan" note). */
  readonly filterExistingAssetIds: (ownerId: UserId, assetIds: readonly AssetId[]) => Promise<readonly AssetId[]>;
  /** Find-or-mint the room's synthetic `__group__<chatId>` narrator identity — the SAME injected op
   *  `verbs/turn.ts` runs for a live `output:"narrator"` round, so an imported narrator slot and a generated
   *  one are authored by the identical row. Called ONCE per imported chat that carries a narrator slot (the
   *  verb is itself find-or-mint idempotent, so a retry is free); a chat with none never calls it. */
  readonly mintSyntheticGroupCharacter: MintSyntheticGroupCharacterOp;
}

/** The chat-owned bulk-import op (`createBulkImportChats`) the entry root wires into `import`'s
 *  `ImportContext.profile.bulkImportChats`. Throws `DomainNotFoundError` when the target character isn't the
 *  caller's. */
export type BulkImportChats = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly chats: readonly BulkImportChatInput[];
}) => Promise<BulkImportChatsResult>;
