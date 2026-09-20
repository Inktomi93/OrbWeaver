// verb: listActiveForChat — the documents ACTIVE for a chat's prompts (D85 membership-widened). Gate: the
// INJECTED `ensureChatMember` (D18) — the active documents are ROOM-PUBLIC prompt context every member's turns
// assemble against, so the list is member-readable (not owner-filtered). Resolves the FULL membership union
// (`resolveChatDocumentSources`) plus the host's per-document visibility override (`resolveChatHiddenDocumentIds`),
// then branches on authority: the HOST sees the whole union with per-document `hidden` flags (they own the
// toggle); a MEMBER sees only the VISIBLE subset (a member never learns a host-hidden document's name — the
// name-privacy filter). The retrieval path (`resolveActiveDocumentIds`) applies the hidden filter for prompts;
// this panel read intentionally shows hidden rows to the host so a hidden document can be re-shown. Each row
// also carries its `sources` — WHICH junction credits it (D-2) — because the rack must say why a document is
// active and the host must be able to tell a row they can DETACH (chat-attached) from one they can only hide.
// A read: no audit.
//
// INTENTIONALLY UNPAGINATED: the D85 visibility write has SET semantics (`hidden` REPLACES the whole excluded
// set), and the client derives that set from the rows it rendered — a page of rows would silently write away
// every hidden document not on it. Adding a limit here is a correctness change at the far end, not a tuning knob.

import type { ListActiveForChatParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import type { ActiveChatDocumentView } from "../contract/views.ts";
import { loadMetaByIds, toDocumentView } from "../persistence/queries.ts";
import { resolveChatDocumentSources, resolveChatHiddenDocumentIds, resolveChatHost } from "../persistence/scope.ts";
import { activeSpaceModel } from "../substrate/active-space.ts";

export function createListActiveForChat(ctx: DatabankContext): DatabankService["listActiveForChat"] {
  return async ({ principal, chatId }: ListActiveForChatParams): Promise<ActiveChatDocumentView[]> => {
    await ctx.ensureChatMember(principal, chatId);
    // The SOURCES map, not the flat union: the panel is the one reader that needs to say WHY each document
    // is active (D-2) — the retrieval path takes the id-only twin.
    const [credits, hiddenIds, host] = await Promise.all([
      resolveChatDocumentSources(ctx.db, chatId),
      resolveChatHiddenDocumentIds(ctx.db, chatId),
      resolveChatHost(ctx.db, chatId),
    ]);
    const union = credits.map((credit) => credit.documentId);
    const hiddenSet = new Set(hiddenIds);
    const isHost = host !== undefined && host === principal.userId;
    // A member never receives a host-hidden document's metadata; the host sees the whole union to govern it.
    const visibleIds = isHost ? union : union.filter((id) => !hiddenSet.has(id));
    const [metas, counts] = await Promise.all([
      loadMetaByIds(ctx.db, visibleIds),
      ctx.countChunks({ documentIds: visibleIds, model: await activeSpaceModel(ctx, principal.userId) }),
    ]);
    // The credit lookup cannot miss — a meta is loaded only for an id the union produced — but the fallback
    // is an empty list rather than a non-null assertion (the row would simply carry no provenance chip).
    return metas.map((meta) => ({
      ...toDocumentView(meta, counts.get(meta.id) ?? 0),
      hidden: isHost && hiddenSet.has(meta.id),
      sources: credits.find((credit) => credit.documentId === meta.id)?.sources ?? [],
    }));
  };
}
