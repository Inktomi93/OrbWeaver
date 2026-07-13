// The `@anthropic-ai/sdk` client wrapper. Never injects a private undici Agent/custom fetch — that would
// bypass the global egress-firewalled dispatcher.
//
// SECURITY: without every credential knob set explicitly, the SDK constructor lazily mints a token from
// the host `claude login` OAuth on first request — on the owner's box that's the free Max sub, and
// sending it to a paid HTTP endpoint is a bannable shape. Every unused arm (credentials/config/profile) is
// pinned to `null` so no ambient/env/config fallback can fire.

import Anthropic from "@anthropic-ai/sdk";
import type { Stream } from "@anthropic-ai/sdk/core/streaming";
import type {
  MessageCreateParams,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";

const ANTH_CLIENT_CACHE_MAX = 64;

export const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";

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

export function createAnthClientCache(): (orKey: string) => AnthClient {
  const clients = new Map<string, AnthClient>();
  return (orKey: string): AnthClient => {
    const warm = clients.get(orKey);
    if (warm !== undefined) {
      clients.delete(orKey);
      clients.set(orKey, warm);
      return warm;
    }
    const client = createOpenRouterAnthClient(orKey);
    clients.set(orKey, client);
    if (clients.size > ANTH_CLIENT_CACHE_MAX) {
      const oldest = clients.keys().next().value;
      if (oldest !== undefined) {
        clients.delete(oldest);
      }
    }
    return client;
  };
}
