// verb: listActiveForChat — the documents ACTIVE for a chat's prompts (D85 membership-widened). Gate: the
// INJECTED `ensureChatMember` (D18) — the active documents are ROOM-PUBLIC prompt context every member's turns
// assemble against, so the list is member-readable (not owner-filtered). Resolves the FULL membership union
// (`resolveChatDocumentUnion`) plus the host's per-document visibility override (`resolveChatHiddenDocumentIds`),
// then branches on authority: the HOST sees the whole union with per-document `hidden` flags (they own the
// toggle); a MEMBER sees only the VISIBLE subset (a member never learns a host-hidden document's name — the
// name-privacy filter). The retrieval path (`resolveActiveDocumentIds`) applies the hidden filter for prompts;
// this panel read intentionally shows hidden rows to the host so a hidden document can be re-shown. A read: no audit.

import type { ListActiveForChatParams } from "../contract/params";
import type { DatabankContext, DatabankService } from "../contract/service";
import type { ActiveChatDocumentView } from "../contract/views";
import { loadMetaByIds, toDocumentView } from "../persistence/queries";
import { resolveChatDocumentUnion, resolveChatHiddenDocumentIds, resolveChatHost } from "../persistence/scope";

export function createListActiveForChat(ctx: DatabankContext): DatabankService["listActiveForChat"] {
  return async ({ principal, chatId }: ListActiveForChatParams): Promise<ActiveChatDocumentView[]> => {
    await ctx.ensureChatMember(principal, chatId);
    const [union, hiddenIds, host] = await Promise.all([
      resolveChatDocumentUnion(ctx.db, chatId),
      resolveChatHiddenDocumentIds(ctx.db, chatId),
      resolveChatHost(ctx.db, chatId),
    ]);
    const hiddenSet = new Set(hiddenIds);
    const isHost = host !== undefined && host === principal.userId;
    // A member never receives a host-hidden document's metadata; the host sees the whole union to govern it.
    const visibleIds = isHost ? union : union.filter((id) => !hiddenSet.has(id));
    const [metas, counts] = await Promise.all([
      loadMetaByIds(ctx.db, visibleIds),
      ctx.countChunks({ documentIds: visibleIds, model: ctx.getActiveEmbedSpace().model }),
    ]);
    return metas.map((meta) => ({ ...toDocumentView(meta, counts.get(meta.id) ?? 0), hidden: isHost && hiddenSet.has(meta.id) }));
  };
}
