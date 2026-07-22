// `@openrouter/sdk` client wrapper + the structural port (`OrClient`) the family's runners depend on. SDK
// egress rides the global undici dispatcher (SSRF firewall wired by infra/network at boot) — this file
// never touches infra/network. Port is loose-`Record` bodies IN (SDK re-serializes anyway), typed SDK
// responses OUT. An LRU keeps one `OpenRouter` per API key warm across a user's turns, capped so key churn
// can't grow unbounded.

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
import { APP_NAME, APP_URL } from "#foundation/config";

/** Max distinct API-key clients kept warm; the least-recently-used is evicted past this. */
const OR_CLIENT_CACHE_MAX = 64;

/** Narrow structural slice of the SDK the family calls; a real `OpenRouter` is trivially assignable, a
 *  test fake is a plain arrow returning the SDK's response type. */
export interface OrClient {
  readonly chat: {
    readonly send: (request: SendChatCompletionRequestRequest, options?: RequestOptions) => Promise<SendChatCompletionRequestResponse>;
  };
  readonly beta: {
    readonly responses: {
      readonly send: (request: CreateResponsesRequest, options?: RequestOptions) => Promise<CreateResponsesResponse>;
    };
  };
  readonly embeddings: {
    readonly generate: (request: CreateEmbeddingsRequest, options?: RequestOptions) => Promise<CreateEmbeddingsResponse>;
  };
  readonly rerank: {
    readonly rerank: (request: CreateRerankRequest, options?: RequestOptions) => Promise<CreateRerankResponse>;
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

// App attribution (OpenRouter's `HTTP-Referer` / `X-Title`) rides EVERY OR operation — it appears on
// OpenRouter's leaderboard and lets OR attribute/scope our traffic. The SDK forwards `httpReferer`/
// `appTitle` as those headers on all supported operations. Identity is a static build constant (foundation).
export function createOpenRouterClient(apiKey: string): OrClient {
  return new OpenRouter({ apiKey, httpReferer: APP_URL, appTitle: APP_NAME });
}

/** Per-API-key LRU `getClient` resolver; closure state owned by the one backend instance the
 *  composition root builds at boot. */
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
