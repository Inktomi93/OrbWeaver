import type { ChatId, UserId } from "@orb/kit/ids";
import type { SearchService, withRetrievalDegrade } from "#domain/search";
import type { ChatContext } from "./context.ts";
/** Search owns refusal classification; chat owns which room host supplies the retrieval space. */
export interface ChatMemorySearchDeps {
  readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
  readonly digests: SearchService["digests"];
  readonly corpus: SearchService["corpus"];
  readonly withRetrievalDegrade: typeof withRetrievalDegrade;
}
export type ChatMemorySearchOps = Pick<ChatContext, "searchDigests" | "searchCorpus">;
