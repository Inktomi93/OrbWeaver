// Scope retrieval to the room's present host before ranking; a hostless room exposes no owner's corpus.
import type { ChatMemorySearchDeps, ChatMemorySearchOps } from "../contract/memory-search.ts";
/** Retain score-only digest projection and the narrow, observable space-refusal degrade. */
export function createChatMemorySearchOps(deps: ChatMemorySearchDeps): ChatMemorySearchOps {
  return {
    // The scored projection: identity + BOTH ranking numbers, and deliberately NOT the hit's `text` (memory
    // resolves its own digest bodies from the pool it already loaded — the seam carries what recall must
    // EXPLAIN, never a second copy of the content).
    // The digest SPACE is the host's (their `embed`/`rerank` bindings wrote it — vector tasks are owner-scoped,
    // inference program §7.5); `MemoryQueryOptions` carries no owner by D20, so the host is resolved from the
    // chat FK here, exactly as `searchCorpus` below does. Hostless room ⇒ nothing to recall (leak-free).
    // The SPACE refusals degrade here rather than faulting the turn (#2510 — `retrieval-degrade.ts` states
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
    // The owner-wide corpus lens. MemoryQueryOptions deliberately carries no owner, so the owner is
    // resolved FROM CONTEXT here: the chat's present host (D19 — the room authority). The memory bridge
    // keeps stored digest identities; standalone transcript sources remain search evidence. Hostless/stale room ⇒ empty
    // (leak-free unknown-owner, the resolvePromptVariables posture); an empty queryText propagates the
    // corpus verb's own SEARCH_EMPTY_QUERY refusal (flag-don't-fake).
    searchCorpus: async (query): ReturnType<ChatMemorySearchOps["searchCorpus"]> => {
      const hostUserId = await deps.resolveHostUserId(query.scope.chat);
      if (hostUserId === null) {
        return [];
      }
      const hits = await deps.corpus({
        ownerId: hostUserId,
        queryText: query.queryText ?? "",
        mode: query.mode,
        minScore: query.minScore,
      });
      return hits.flatMap((h) => h.blockKeys);
    },
  };
}
