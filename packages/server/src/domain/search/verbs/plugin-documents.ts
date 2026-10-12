import type { PluginDocumentReads } from "@orb/contracts/plugin";
import { PLUGIN_READ_CONTENT_MAX_CHARS } from "@orb/contracts/plugin";
import type { SearchService } from "../contract/service.ts";

/** Bind retrieval to the installer before reducing its guest-visible result. */

export function createPluginDocumentSearch(documents: SearchService["documents"]): PluginDocumentReads["documents"] {
  return async ({ installerUserId, queryText, limit }) => {
    const hits = await documents({
      scope: { ownerId: installerUserId },
      ownerId: installerUserId,
      queryText,
      ...(limit !== undefined ? { k: limit } : {}),
    });
    return hits.map((hit) => ({
      documentId: hit.documentId,
      documentName: hit.documentName,
      content: hit.content.length > PLUGIN_READ_CONTENT_MAX_CHARS ? hit.content.slice(0, PLUGIN_READ_CONTENT_MAX_CHARS) : hit.content,
      score: hit.score,
    }));
  };
}
