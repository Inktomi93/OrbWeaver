// verbs: the SillyTavern profile export's metadata reads and its per-entry blob read. The plan lists cards, blobs and
// chat attachments from these and reads a body only when the zip writes that one entry, so neither the plan nor its
// dry run holds the library. Every read is the caller's own: the owner predicate sits in each WHERE, and a chat's
// attachments are read only for a chat the caller hosts.

import { assets, characters, characterTags, chatDocuments, chatParticipants, documents, tags } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { isMissingFile } from "#primitives/errno";
import type { ListStCardsParams, OwnedBlobParams, OwnedBlobsParams } from "../contract/params.ts";
import type { StCardRef } from "../contract/results.ts";
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
