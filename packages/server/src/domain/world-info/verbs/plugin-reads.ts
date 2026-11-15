// Attachment reads remain member-gated and entry reads remain owner-gated.
// FAIL-CLOSED, leak-free: a gate's refusal (a not-found or a forbidden) answers "not attached" or `[]`, so a guest
// never learns a foreign room's or book's contents. Any other fault in the read is not a refusal and rejects.

import type { PluginWorldInfoReads } from "@orb/contracts/plugin";
import { PLUGIN_READ_CONTENT_MAX_CHARS } from "@orb/contracts/plugin";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { PluginWorldInfoReadDeps } from "../contract/plugin-reads.ts";

/** A membership or ownership gate's refusal: the room or book is not the installer's to read. */
function isGateRefusal(error: unknown): boolean {
  return error instanceof DomainNotFoundError || error instanceof DomainForbiddenError;
}

/** Reduce world-info reads after their owning membership and book gates. */

export function createPluginWorldInfoReads(deps: PluginWorldInfoReadDeps): PluginWorldInfoReads {
  const { worldInfo, resolveOwnerPrincipal } = deps;
  return {
    isBookAttachedToChat: async (ownerId, chatId, bookId): ReturnType<PluginWorldInfoReads["isBookAttachedToChat"]> => {
      // A member kicked between admission and this read is refused, and the refusal reads as "not attached".
      try {
        const attached = await worldInfo.listForChat({ principal: await resolveOwnerPrincipal(ownerId), chatId });
        return attached.some((book) => book.id === bookId);
      } catch (error) {
        if (!isGateRefusal(error)) {
          throw error;
        }
        return false;
      }
    },
    listEntryTitles: async (ownerId, bookId): ReturnType<PluginWorldInfoReads["listEntryTitles"]> => {
      const rows = await worldInfo.listEntryIndex({ principal: await resolveOwnerPrincipal(ownerId), bookId });
      return rows.map((row) => row.title);
    },
    listBooksForChat: async (ownerId, chatId): ReturnType<PluginWorldInfoReads["listBooksForChat"]> => {
      // A refused member never learns the room's book list.
      try {
        const books = await worldInfo.listForChat({ principal: await resolveOwnerPrincipal(ownerId), chatId });
        return books.map((book) => ({ id: book.id, name: book.name }));
      } catch (error) {
        if (!isGateRefusal(error)) {
          throw error;
        }
        return [];
      }
    },
    listEntries: async (ownerId, bookId): ReturnType<PluginWorldInfoReads["listEntries"]> => {
      // A book the installer does not own reads as an empty one.
      try {
        const entries = await worldInfo.listEntries({ principal: await resolveOwnerPrincipal(ownerId), bookId });
        return entries.map((entry) => ({
          id: entry.id,
          keys: entry.keys ?? [],
          content: entry.content.length > PLUGIN_READ_CONTENT_MAX_CHARS ? entry.content.slice(0, PLUGIN_READ_CONTENT_MAX_CHARS) : entry.content,
          enabled: entry.enabled,
        }));
      } catch (error) {
        if (!isGateRefusal(error)) {
          throw error;
        }
        return [];
      }
    },
  };
}
