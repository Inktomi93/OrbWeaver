// The `@anthropic-ai/sdk` client wrapper. Never injects a private undici Agent/custom fetch — that would
// bypass the global egress-firewalled dispatcher.
//
// SECURITY: without every credential knob set explicitly, the SDK constructor lazily mints a token from
// the host `claude login` OAuth on first request — on the owner's box that's the free Max sub, and
// sending it to a paid HTTP endpoint is a bannable shape. Every unused arm (credentials/config/profile) is
// pinned to `null` so no ambient/env/config fallback can fire.

import Anthropic from "@anthropic-ai/sdk";
import type { Stream } from "@anthropic-ai/sdk/core/streaming";
import type { MessageCreateParams, RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { AnthDirectCredential } from "./credential-guard";

const ANTH_CLIENT_CACHE_MAX = 64;

export const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
/** The first-party Anthropic base (W11). PINNED explicitly (never the SDK default) so an ambient
 *  `ANTHROPIC_BASE_URL` env var can't redirect a paid `x-api-key` to an attacker endpoint — part of the belt. */
export const ANTHROPIC_FIRST_PARTY_BASE_URL = "https://api.anthropic.com";

/** The two paid-key sources anth-direct serves — derived from the guard's one-home union, never re-spelled. */
type AnthDirectSource = AnthDirectCredential["source"];

export interface AnthClient {
  readonly messages: {
    readonly create: (
      params: MessageCreateParams & { readonly stream: true },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<Stream<RawMessageStreamEvent>>;
  };
}

const AMBIENT_CREDENTIALS_PINNED = {
  credentials: null,
  config: null,
  profile: null,
} as const;

// `authToken` sends `Authorization: Bearer` (which OR wants), NOT `apiKey` (Anthropic's `x-api-key`).
export function createOpenRouterAnthClient(orKey: string): AnthClient {
  return new Anthropic({
    baseURL: OPENROUTER_ANTHROPIC_BASE_URL,
    authToken: orKey,
    apiKey: null,
    ...AMBIENT_CREDENTIALS_PINNED,
  });
}

// First-party (W11): `apiKey` sends Anthropic's `x-api-key`; `authToken: null` kills the env fallback; the
// base is pinned explicitly (the belt). Same ambient pins as the OR path — no config/profile/OAuth minting.
export function createFirstPartyAnthClient(apiKey: string): AnthClient {
  return new Anthropic({
    baseURL: ANTHROPIC_FIRST_PARTY_BASE_URL,
    apiKey,
    authToken: null,
    ...AMBIENT_CREDENTIALS_PINNED,
  });
}

function createAnthClientForSource(source: AnthDirectSource, key: string): AnthClient {
  return source === "anthropic" ? createFirstPartyAnthClient(key) : createOpenRouterAnthClient(key);
}

export function createAnthClientCache(): (source: AnthDirectSource, key: string) => AnthClient {
  const clients = new Map<string, AnthClient>();
  // Cache key includes the source so an OR key and a first-party key with the same string can't collide onto
  // the wrong-base client (the source is a closed enum). LRU by re-insertion order.
  return (source: AnthDirectSource, key: string): AnthClient => {
    const cacheKey = `${source}:${key}`;
    const warm = clients.get(cacheKey);
    if (warm !== undefined) {
      clients.delete(cacheKey);
      clients.set(cacheKey, warm);
      return warm;
    }
    const client = createAnthClientForSource(source, key);
    clients.set(cacheKey, client);
    if (clients.size > ANTH_CLIENT_CACHE_MAX) {
      const oldest = clients.keys().next().value;
      if (oldest !== undefined) {
        clients.delete(oldest);
      }
    }
    return client;
  };
}
