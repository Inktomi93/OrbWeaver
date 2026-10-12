import type { CorpusHit, CorpusParams, DigestSearchEvents, DigestSearchHit, MemoryQueryOptions, RetrievalFallback } from "@orb/contracts/search";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "./context.ts";

/** Search owns refusal classification; chat owns which room host supplies the retrieval space. */

export interface ChatMemorySearchDeps {
  readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
  readonly digests: (params: MemoryQueryOptions, events?: DigestSearchEvents | undefined) => Promise<DigestSearchHit[]>;
  readonly corpus: (params: CorpusParams) => Promise<CorpusHit[]>;
  readonly withRetrievalDegrade: <T>(run: () => Promise<T>, degraded: RetrievalFallback<T>) => Promise<T>;
}
export type ChatMemorySearchOps = Pick<ChatContext, "searchDigests" | "searchCorpus">;
