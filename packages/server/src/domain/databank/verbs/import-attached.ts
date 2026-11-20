// verb: importAttached — one document a profile import carries. The upload runs first, so the `(ownerId, importHash)`
// dedup and the extraction are the upload's own; each scope the document carried then attaches through its attach
// verb, so every junction keeps its ownership gate, audit and room fan. A re-run writes no second document and
// re-asserts the scopes, each idempotent.

import type { ImportAttachedDocument } from "@orb/contracts/databank";
import type { DatabankService } from "../contract/service.ts";

/** The service's own upload and attach verbs, injected at the domain's composition root. */
export function createImportAttached(
  verbs: Pick<DatabankService, "upload" | "attachGlobal" | "attachToCharacter" | "attachToChat">,
): ImportAttachedDocument<AbortSignal> {
  return async ({ principal, bytes, mime, name, scopes, signal }) => {
    const { document, outcome } = await verbs.upload({ principal, bytes, mime, name, signal });
    const documentId = document.id;
    if (scopes.global) {
      await verbs.attachGlobal({ principal, documentId });
    }
    for (const characterId of scopes.characterIds) {
      await verbs.attachToCharacter({ principal, documentId, characterId });
    }
    for (const chatId of scopes.chatIds) {
      await verbs.attachToChat({ principal, documentId, chatId });
    }
    return { created: outcome === "created" };
  };
}
