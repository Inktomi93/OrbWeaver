// Only vendor response bytes vary; room policy, persistence and assembly belong to the real graph.
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";

/** Supply a finite physical reply plan without substituting a domain operation. */
export async function textRoom(replies: readonly string[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<ChatRoot> {
  let next = 0;
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => {
      const text = replies[next++];
      if (text === undefined) {
        throw new Error("the scenario physical reply plan is exhausted");
      }
      return { text, toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } };
    },
  });
  return await createChatRoot({ memoryEnabled: false, ...options, providerFetch: provider.execute });
}
