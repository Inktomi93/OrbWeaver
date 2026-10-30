import type { RetrievalFallback, SearchCorpusHitsOp, SearchDigestHitsOp } from "@orb/contracts/search";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "./context.ts";

/** Search owns refusal classification; chat owns which room host supplies the retrieval space. */

export interface ChatMemorySearchDeps {
  readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
  readonly digests: SearchDigestHitsOp;
  readonly corpus: SearchCorpusHitsOp;
  readonly withRetrievalDegrade: <T>(run: () => Promise<T>, degraded: RetrievalFallback<T>) => Promise<T>;
}
export type ChatMemorySearchOps = Pick<ChatContext, "searchDigests" | "searchCorpus">;
