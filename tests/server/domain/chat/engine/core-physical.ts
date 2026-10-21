// Finite raw HTTP replies feed the production graph; no fixture builds engine contexts or outcomes.
import "@orb/testkit/node/composed-real.ts";
import type { JsonValue } from "@orb/kit/json";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/chat/composed.ts";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";

export type CoreWireReply = (request: Request) => Response | Promise<Response>;
const coreIds = createSeededIds();

/** Each physical foreground request consumes one reply; discovery and vector bytes retain the canonical supplier. */
export async function coreHttpRoom(replies: readonly CoreWireReply[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<ChatRoot> {
  let next = 0;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "No unplanned foreground reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return await createChatRoot({
    memoryEnabled: false,
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    ...options,
    server: { ids: coreIds, ...options.server },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
        return await corpus.execute(request);
      }
      request.signal.throwIfAborted();
      const reply = replies[next++];
      if (reply === undefined) {
        throw new Error("the finite core HTTP reply plan is exhausted");
      }
      return await reply(request);
    },
  });
}

/** Encode only external protocol bytes; production owns parsing, reduction and accounting. */
export function coreFrame(value: JsonValue): string {
  return `data: ${JSON.stringify(value)}`;
}

/** Terminate a finite native SSE response without replacing its parser or model result. */
export function coreSse(frames: readonly string[]): Response {
  return new Response(`${[...frames, "data: [DONE]"].join("\n\n")}\n\n`, { headers: { "content-type": "text/event-stream" } });
}
/** Pause only external HTTP admission; actual cancellation releases and joins this physical edge. */
export function coreHeldReply(): {
  readonly reached: Promise<AbortSignal>;
  readonly release: () => void;
  readonly respond: (request: Request) => Promise<Response>;
} {
  const reached = Promise.withResolvers<AbortSignal>();
  const released = Promise.withResolvers<void>();
  return {
    reached: reached.promise,
    release: () => released.resolve(),
    respond: async (request): Promise<Response> => {
      const interrupted = Promise.withResolvers<never>();
      const abort = (): void => interrupted.reject(request.signal.reason);
      request.signal.addEventListener("abort", abort, { once: true });
      try {
        request.signal.throwIfAborted();
        reached.resolve(request.signal);
        await Promise.race([released.promise, interrupted.promise]);
        return coreSse([
          coreFrame({ choices: [{ delta: { content: "The held reply finishes." } }] }),
          terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
        ]);
      } finally {
        request.signal.removeEventListener("abort", abort);
      }
    },
  };
}
