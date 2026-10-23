// Explicit native finish frames distinguish capped responses from clean stops before the real auto-behavior loop.
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { TerminalFrameOptions } from "@orb/testkit/node/helpers";
import { terminalSseLine } from "@orb/testkit/node/helpers";

export interface PhysicalReply extends Pick<TerminalFrameOptions, "finishReason"> {
  readonly text: string;
}

/** Supply only vendor response bytes, leaving continuation, reroll and terminal classification to production. */
export async function followupRoom(replies: readonly PhysicalReply[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<ChatRoot> {
  let next = 0;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused explicit-terminal supplier reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return await createChatRoot({
    memoryEnabled: false,
    ...options,
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
        return await corpus.execute(request);
      }
      const reply = replies[next++];
      if (reply === undefined) {
        return Response.json({ error: { message: "the finite explicit-terminal supplier is exhausted", type: "invalid_request_error" } }, { status: 400 });
      }
      return new Response(
        `${terminalSseLine({
          ...(reply.finishReason === undefined ? {} : { finishReason: reply.finishReason }),
          delta: { content: reply.text },
          usage: { promptTokens: 4, completionTokens: 2 },
        })}\n\ndata: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
}
