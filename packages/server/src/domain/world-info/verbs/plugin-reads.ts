// Attachment reads remain member-gated and entry reads remain owner-gated.

import { PLUGIN_READ_CONTENT_MAX_CHARS } from "@orb/contracts/plugin";
import type { PluginWorldInfoReadDeps, PluginWorldInfoReads } from "../contract/plugin-reads.ts";

/** Reduce world-info reads after their owning membership and book gates. */

export function createPluginWorldInfoReads(deps: PluginWorldInfoReadDeps): PluginWorldInfoReads {
  const { worldInfo, resolveOwnerPrincipal } = deps;
  return {
    isBookAttachedToChat: async (ownerId, chatId, bookId): ReturnType<PluginWorldInfoReads["isBookAttachedToChat"]> => {
      // FAIL-CLOSED — documented above: a refusal
      // (kicked between admission and write) resolves to "not attached", never a leak. Ends if this needs
      // to tell a raced-kick apart from an infra failure.
      try {
        const attached = await worldInfo.listForChat({ principal: await resolveOwnerPrincipal(ownerId), chatId });
        return attached.some((book) => book.id === bookId);
      } catch {
        return false;
      }
    },
    listEntryTitles: async (ownerId, bookId): ReturnType<PluginWorldInfoReads["listEntryTitles"]> => {
      const rows = await worldInfo.listEntryIndex({ principal: await resolveOwnerPrincipal(ownerId), bookId });
      return rows.map((row) => row.title);
    },
    listBooksForChat: async (ownerId, chatId): ReturnType<PluginWorldInfoReads["listBooksForChat"]> => {
      // FAIL-CLOSED — documented above: a
      // refusal (kicked between admission and read) resolves to `[]`, so a non-member never learns the
      // room's book list. Ends if this needs to tell a raced-kick apart from an infra failure.
      try {
        const books = await worldInfo.listForChat({ principal: await resolveOwnerPrincipal(ownerId), chatId });
        return books.map((book) => ({ id: book.id, name: book.name }));
      } catch {
        return [];
      }
    },
    listEntries: async (ownerId, bookId): ReturnType<PluginWorldInfoReads["listEntries"]> => {
      // FAIL-CLOSED — documented above: `[]` if
      // the installer does not own the book — leak-free, indistinguishable from an empty one. Ends if this
      // needs to tell a not-owned book apart from an infra failure.
      try {
        const entries = await worldInfo.listEntries({ principal: await resolveOwnerPrincipal(ownerId), bookId });
        return entries.map((entry) => ({
          id: entry.id,
          keys: entry.keys ?? [],
          content: entry.content.length > PLUGIN_READ_CONTENT_MAX_CHARS ? entry.content.slice(0, PLUGIN_READ_CONTENT_MAX_CHARS) : entry.content,
          enabled: entry.enabled,
        }));
      } catch {
        return [];
      }
    },
  };
}
