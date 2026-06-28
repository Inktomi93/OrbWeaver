// infra/providers/backends/openrouter/client — the `@openrouter/sdk` client wrapper + the structural port
// the family's runners depend on. The SDK egress rides the GLOBAL undici dispatcher (the SSRF firewall is
// wired by infra/network at boot) — this file just constructs the SDK; it never touches infra/network.
//
// THE PORT (`OrClient`): the runners take this narrow structural slice — loose `Record` request bodies in,
// the SDK's already-validated typed shapes out. Two reasons:
//   • Loose IN: the SDK request types are deep, strict zod-derived unions; assembling them field-by-field
//     (messages-with-cache-blocks, camelCase provider prefs, the plugins union, the customParameters
//     escape hatch) is enormous, fragile bridging for a body the SDK re-serializes anyway. We build the
//     plain wire object (the same shape neo + the custom-byo sibling build) and let the SDK serialize it.
//   • Typed OUT: the SDK validates responses internally, so we read its typed result directly (and reshape
//     chat/responses into the kit's lenient view at the runner boundary).
// A real `OpenRouter` is assignable to this port (method params are bivariant; `ChatRequest` ⊂
// `Record<string,unknown>`, and `EventStream<T>` ⊂ `AsyncIterable<T>`), so production wires the concrete
// client with no cast, and a test injects a hand-built fake.
//
// WHY AN LRU: one `OpenRouter` per API key (a key = a user's credential), reused across that user's turns
// so connection pools/auth are not rebuilt every call; capped so a churn of one-off keys can't grow
// unbounded. Module-level is fine here (infra, not a persistence query layer).

import { OpenRouter } from "@openrouter/sdk";
import type { RequestOptions } from "@openrouter/sdk/lib/sdks";
import type { GenerationResponse, ModelsListResponse } from "@openrouter/sdk/models";
import type {
  CreateEmbeddingsRequest,
  CreateEmbeddingsResponse,
  CreateRerankRequest,
  CreateRerankResponse,
  CreateResponsesRequest,
  CreateResponsesResponse,
  GetCreditsResponse,
  SendChatCompletionRequestRequest,
  SendChatCompletionRequestResponse,
} from "@openrouter/sdk/models/operations";

/** Max distinct API-key clients kept warm; the least-recently-used is evicted past this. */
const OR_CLIENT_CACHE_MAX = 64;

/** The narrow structural slice of the SDK the openrouter family calls — each method's signature is the
 *  SDK's own (the implementation overload), so the real `OpenRouter` is trivially assignable and a test
 *  fake is a plain arrow returning the SDK's response type. The runners build the SDK's TYPED request
 *  shapes (a wire-field typo is a compile error) and read its validated typed responses (reshaped into the
 *  kit's lenient view at the runner boundary; the streaming `send` returns an `EventStream`, an
 *  `AsyncIterable`, which the reducer drains). Exported as an infra DI port (the `no-inline-types` gate
 *  permits infra port interfaces). */
export interface OrClient {
  readonly chat: {
    readonly send: (
      request: SendChatCompletionRequestRequest,
      options?: RequestOptions,
    ) => Promise<SendChatCompletionRequestResponse>;
  };
  readonly beta: {
    readonly responses: {
      readonly send: (
        request: CreateResponsesRequest,
        options?: RequestOptions,
      ) => Promise<CreateResponsesResponse>;
    };
  };
  readonly embeddings: {
    readonly generate: (
      request: CreateEmbeddingsRequest,
      options?: RequestOptions,
    ) => Promise<CreateEmbeddingsResponse>;
  };
  readonly rerank: {
    readonly rerank: (
      request: CreateRerankRequest,
      options?: RequestOptions,
    ) => Promise<CreateRerankResponse>;
  };
  readonly models: {
    readonly list: () => Promise<ModelsListResponse>;
  };
  readonly credits: {
    readonly getCredits: () => Promise<GetCreditsResponse>;
  };
  readonly generations: {
    readonly getGeneration: (request: { readonly id: string }) => Promise<GenerationResponse>;
  };
}

/**
 * Build a fresh OpenRouter client for an API key. The SDK constructor takes ONLY `{ apiKey }` — no
 * `baseURL`, no referer/title headers (the production default; a marketplace-ranking referer would be a
 * deliberate net-new opt-in, not assumed here).
 */
export function createOpenRouterClient(apiKey: string): OrClient {
  return new OpenRouter({ apiKey });
}

/**
 * Build a per-API-key LRU `getClient` resolver. The cache is CLOSURE state (not module-scope), so it is
 * owned by the one backend instance the composition root builds at boot — a warm client per key, reused
 * across that user's turns, the least-recently-used evicted past {@link OR_CLIENT_CACHE_MAX}. Touched on
 * hit (delete+set ⇒ most-recent at the tail).
 */
export function createClientCache(): (apiKey: string) => OrClient {
  const clients = new Map<string, OrClient>();
  return (apiKey: string): OrClient => {
    const warm = clients.get(apiKey);
    if (warm !== undefined) {
      clients.delete(apiKey);
      clients.set(apiKey, warm);
      return warm;
    }
    const client = createOpenRouterClient(apiKey);
    clients.set(apiKey, client);
    if (clients.size > OR_CLIENT_CACHE_MAX) {
      const oldest = clients.keys().next().value;
      if (oldest !== undefined) {
        clients.delete(oldest);
      }
    }
    return client;
  };
}
