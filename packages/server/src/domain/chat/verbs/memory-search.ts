// Scope retrieval to the room's present host before ranking; a hostless room exposes no owner's corpus.
// The query embeds on that host's encoder, so its only callers, a turn and a preview, refuse a disabled host first.
import type { ChatMemorySearchDeps, ChatMemorySearchOps } from "../contract/memory-search.ts";
/** Retain score-only digest projection and the narrow, observable space-refusal degrade. */
export function createChatMemorySearchOps(deps: ChatMemorySearchDeps): ChatMemorySearchOps {
  return {
    // The scored projection: identity + BOTH ranking numbers, and deliberately NOT the hit's `text` (memory
    // resolves its own digest bodies from the pool it already loaded — the seam carries what recall must
    // EXPLAIN, never a second copy of the content).
    // The digest SPACE is the host's (their `embed`/`rerank` bindings wrote it — vector tasks are owner-scoped,
    // inference program §7.5); `MemoryQueryOptions` carries no owner by D20, so the host is resolved from the
    // chat FK here. Hostless room ⇒ nothing to recall (leak-free).
    // The SPACE refusals degrade here rather than faulting the turn (`retrieval-degrade.ts` states
    // the whole boundary): a mid-move or unbound vector space is an ordinary owner state, and the user hears
    // about it through the episode this reports into. Every other search failure still propagates.
    searchDigests: async (query, events): ReturnType<ChatMemorySearchOps["searchDigests"]> => {
      const hostUserId = await deps.resolveHostUserId(query.scope.chat);
      if (hostUserId === null) {
        return [];
      }
      const onRerankUnavailable = events?.onRerankUnavailable;
      const hits = await deps.withRetrievalDegrade(
        async () => await deps.digests({ ...query, ownerId: hostUserId }, onRerankUnavailable === undefined ? undefined : { onRerankUnavailable }),
        { empty: [], onIndexUnavailable: events?.onIndexUnavailable },
      );
      return hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }));
    },
  };
}
