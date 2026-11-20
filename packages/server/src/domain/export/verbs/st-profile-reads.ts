// verbs: the SillyTavern profile export's metadata reads and its per-entry blob read. The plan lists cards, blobs and
// chat attachments from these and reads a body only when the zip writes that one entry, so neither the plan nor its
// dry run holds the library. Every read is the caller's own: the owner predicate sits in each WHERE, and a chat's
// attachments are read only for a chat the caller hosts.

import { portableCharacterHandle } from "@orb/contracts/character";
import { assets, characterDocuments, characters, characterTags, chatDocuments, chatParticipants, documents, globalDocuments, tags } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { isMissingFile } from "#primitives/errno";
import type { ListStCardsParams, ListStDocumentsParams, OwnedBlobParams, OwnedBlobsParams, StDocumentTextParams } from "../contract/params.ts";
import type { StCardRef, StDocumentRef } from "../contract/results.ts";
import type { ExportContext, ExportService } from "../contract/service.ts";
import { ACCEPTED_TAG_STATUS } from "../substrate/card-tags.ts";

export function createListStCards(ctx: ExportContext): ExportService["listStCards"] {
  return async ({ principal }: ListStCardsParams): Promise<readonly StCardRef[]> => {
    const ownerId = principal.userId;
    // A synthetic group character carries no card; its room exports as a SillyTavern group instead.
    const rows = await ctx.db
      .select({ characterId: characters.id, handle: characters.handle })
      .from(characters)
      .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false)))
      .orderBy(asc(characters.createdAt), asc(characters.id));
    const tagRows = await ctx.db
      .select({ characterId: characterTags.characterId, name: tags.name })
      .from(characterTags)
      .innerJoin(tags, and(eq(characterTags.tagId, tags.id), eq(tags.ownerId, ownerId)))
      .where(
        and(
          inArray(
            characterTags.characterId,
            rows.map((row) => row.characterId),
          ),
          eq(characterTags.status, ACCEPTED_TAG_STATUS),
        ),
      );
    return rows.map((row) => ({ ...row, tags: tagRows.filter((tag) => tag.characterId === row.characterId).map((tag) => tag.name) }));
  };
}

export function createOwnedBlobMimes(ctx: ExportContext): ExportService["ownedBlobMimes"] {
  return async ({ principal, hashes }: OwnedBlobsParams): Promise<ReadonlyMap<string, string>> => {
    if (hashes.length === 0) {
      return new Map();
    }
    const rows = await ctx.db
      .select({ hash: assets.hash, mime: assets.mime })
      .from(assets)
      .where(and(eq(assets.ownerId, principal.userId), inArray(assets.hash, [...hashes])));
    return new Map(rows.map((row) => [row.hash, row.mime]));
  };
}

/** One owned blob's bytes; null when the owner no longer holds it or the store lost the file. Any other read
 *  failure propagates: a damaged store is not a missing blob. */
export function createReadOwnedBlob(ctx: ExportContext): ExportService["readOwnedBlob"] {
  return async ({ principal, hash }: OwnedBlobParams): Promise<Uint8Array | null> => {
    const [held] = await ctx.db
      .select({ hash: assets.hash })
      .from(assets)
      .where(and(eq(assets.ownerId, principal.userId), eq(assets.hash, hash)))
      .limit(1);
    if (held === undefined) {
      return null;
    }
    try {
      return await ctx.cas.read(principal.userId, held.hash);
    } catch (err) {
      if (isMissingFile(err)) {
        return null;
      }
      throw err;
    }
  };
}

const hostSeat = chatParticipants;

/** The import hash of each of the caller's own Data Bank documents attached to each chat the caller hosts. */
export function createListChatDocumentHashes(ctx: ExportContext): ExportService["listChatDocumentHashes"] {
  return async ({ principal }): Promise<ReadonlyMap<ChatId, readonly string[]>> => {
    const rows = await ctx.db
      .select({ chatId: chatDocuments.chatId, importHash: documents.importHash })
      .from(chatDocuments)
      .innerJoin(documents, and(eq(documents.id, chatDocuments.documentId), eq(documents.ownerId, principal.userId)))
      .innerJoin(
        hostSeat,
        and(eq(hostSeat.chatId, chatDocuments.chatId), eq(hostSeat.role, "host"), eq(hostSeat.userId, principal.userId), isNull(hostSeat.leftSeq)),
      );
    const out = new Map<ChatId, string[]>();
    for (const row of rows) {
      out.set(row.chatId, [...(out.get(row.chatId) ?? []), row.importHash]);
    }
    return out;
  };
}

/** The caller's documents with their scopes: the global bank and the non-synthetic cards each is attached to. No
 *  extracted text is read, so a dry run never loads a document's body. */
export function createListStDocuments(ctx: ExportContext): ExportService["listStDocuments"] {
  return async ({ principal }: ListStDocumentsParams): Promise<readonly StDocumentRef[]> => {
    const ownerId = principal.userId;
    const rows = await ctx.db
      .select({ documentId: documents.id, name: documents.name, importHash: documents.importHash, createdAt: documents.createdAt })
      .from(documents)
      .where(eq(documents.ownerId, ownerId))
      .orderBy(asc(documents.createdAt), asc(documents.id));
    const globalRows = await ctx.db.select({ documentId: globalDocuments.documentId }).from(globalDocuments).where(eq(globalDocuments.ownerId, ownerId));
    const cardRows = await ctx.db
      .select({ documentId: characterDocuments.documentId, handle: characters.handle })
      .from(characterDocuments)
      .innerJoin(characters, and(eq(characters.id, characterDocuments.characterId), eq(characters.ownerId, ownerId), eq(characters.synthetic, false)));
    const global = new Set(globalRows.map((row) => row.documentId));
    return rows.map((row) => ({
      ...row,
      global: global.has(row.documentId),
      characterHandles: cardRows.filter((card) => card.documentId === row.documentId).map((card) => portableCharacterHandle(card.handle)),
    }));
  };
}

/** One of the caller's documents' extracted text; null when the caller holds it no more. */
export function createReadStDocumentText(ctx: ExportContext): ExportService["readStDocumentText"] {
  return async ({ principal, documentId }: StDocumentTextParams): Promise<string | null> => {
    const [row] = await ctx.db
      .select({ text: documents.extractedText })
      .from(documents)
      .where(and(eq(documents.ownerId, principal.userId), eq(documents.id, documentId)))
      .limit(1);
    return row?.text ?? null;
  };
}
