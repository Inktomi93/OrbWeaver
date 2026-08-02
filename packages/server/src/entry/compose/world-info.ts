// Composition seam for world-info + the import ports built alongside it (the live card-import lorebook writer,
// the carried-book re-linker, and the bulk chat/persona importers) + the OWNER-principal resolver the automation
// / plugin / portability blocks thread. Built AFTER chat — world-info's chat scope injects chat's membership
// guards + the chat bus emit. Owns no business logic.
//
// The `resolveOwnerPrincipal` minted here is a DELIBERATELY SEPARATE resolver from the keystone's
// `resolveHostPrincipal` (both are `createHostPrincipalResolver(sessions)`): the host resolver serves chat's own
// role-sensitive ops; the owner resolver serves the automation/plugin/portability author-ownership gates. Two
// distinct call sites, kept distinct.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { can } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import type { BulkImportPersonas } from "#domain/persona";
import { createBulkImportPersonas } from "#domain/persona";
import type { SessionsService } from "#domain/sessions";
import type { WorldInfoService } from "#domain/world-info";
import { createBulkImportLorebook, createLinkCarriedBooks, createWorldInfoService } from "#domain/world-info";
import type { AuditEntry } from "#foundation/observability";
import { createBulkImportChats, requireHost, requireParticipant } from "../../domain/chat";
import { publishUserEvent } from "../../transport/trpc";
import { createHostPrincipalResolver } from "../auth";
import type { ImportWorldInfoPort } from "../import";
import { minter } from "./minter";

/** What the world-info seam needs from the composition root. */
export interface WorldInfoComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly sessions: SessionsService;
  /** chat's bus durable-first emit (`ChatComposeResult.emitBusEvent`) — world-info publishes WI events onto it. */
  readonly emitChatBusEvent: (event: ChatBusEvent) => Promise<void>;
  readonly assets: Pick<AssetsService, "resolveOwnedAssetRefs">;
  /** character's find-or-mint of a room's synthetic `__group__<chatId>` narrator identity — the SAME op
   *  chat's turn verb runs for a live `output:"narrator"` round. The bulk-import write needs it so an
   *  imported narrator slot is authored by the identical row (chat never imports domain/character). */
  readonly character: Pick<CharacterService, "mintSyntheticGroupCharacter">;
}

/** The world-info compose product: the service + the import ports + the bulk importers + the owner resolver. */
export interface WorldInfoComposeResult {
  readonly worldInfo: WorldInfoService;
  readonly importWorldInfo: ImportWorldInfoPort;
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}

export function buildWorldInfo(deps: WorldInfoComposeDeps): WorldInfoComposeResult {
  const { db, now, audit, assets } = deps;

  const worldInfo = createWorldInfoService({
    db,
    now,
    newBookId: minter(ID_PREFIX.worldBook),
    newEntryId: minter(ID_PREFIX.worldEntry),
    audit,
    requireChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined),
    requireChatMember: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    emitWiEvent: deps.emitChatBusEvent,
    emitUserEvent: publishUserEvent,
  });

  // Wired here so the live card-import path actually writes an imported card's embedded character_book.
  const importWorldInfo: ImportWorldInfoPort = {
    importLorebook: createBulkImportLorebook({
      db,
      now,
      newBookId: minter(ID_PREFIX.worldBook),
      newEntryId: minter(ID_PREFIX.worldEntry),
    }),
    // PD-144: re-link a portable card's carried attached-book references (owned-source gated); the
    // persistence-factory twin of the duplicate carry, db + clock only.
    linkCarriedBooks: createLinkCarriedBooks({ db, now }),
  };

  const bulkImportChats = createBulkImportChats({
    db,
    now,
    newChatId: minter(ID_PREFIX.chat),
    newMessageId: minter(ID_PREFIX.message),
    newMessageVariantId: minter(ID_PREFIX.messageVariant),
    newMessageAssetId: minter(ID_PREFIX.messageAsset),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    // The ST `note_prompt` lands as a chat injection (the retired room author's-note twin's surviving door).
    newChatInjectionId: minter(ID_PREFIX.chatInjection),
    // The bundle's assets entity imports first, so a bundled inline attachment exists by the time chats
    // import; this filters an imported message's asset refs to the ones that landed.
    filterExistingAssetIds: async (ownerId, assetIds) => (await assets.resolveOwnedAssetRefs(ownerId, assetIds)).map((r) => r.assetId),
    mintSyntheticGroupCharacter: deps.character.mintSyntheticGroupCharacter,
  });
  const bulkImportPersonas = createBulkImportPersonas({
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona),
  });
  const resolveOwnerPrincipal = createHostPrincipalResolver(deps.sessions);

  return { worldInfo, importWorldInfo, bulkImportChats, bulkImportPersonas, resolveOwnerPrincipal };
}
