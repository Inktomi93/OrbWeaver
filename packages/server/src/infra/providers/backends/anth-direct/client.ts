// infra/providers/backends/anth-direct/client — the `@anthropic-ai/sdk` client wrapper + THE EXTENDED
// SECURITY BELT + the structural port the runner depends on. The SDK egress rides the GLOBAL undici
// dispatcher (the SSRF firewall is wired by infra/network at boot) — this file just constructs the SDK;
// it never touches infra/network, and it NEVER injects a private undici `Agent`/custom fetch (that would
// bypass the global dispatcher + firewall, part 02 §4).
//
// THE PORT (`AnthClient`): the runner takes this narrow structural slice (just `messages.create`) so a
// test injects a plain fake. A real `Anthropic` is assignable (method params are bivariant; the runner
// builds the SDK's TYPED `MessageCreateParams`, so a wire-field typo is a compile error, and reads the
// SDK's typed streaming/non-streaming result).
//
// ── THE EXTENDED SECURITY BELT (part 02 §4, D67 §D — LOAD-BEARING) ─────────────────────────────────
// The `@anthropic-ai/sdk` auto-resolves credentials from a WIDER surface than three env vars: with none
// of apiKey/authToken/credentials/config/profile set, the constructor stores a LAZY resolution that mints
// a token from config files / the host `claude login` OAuth on the first request (client.js:145-166,
// client.d.ts:47-52). On the OWNER's box that live `claude login` OAuth is exactly the free Max sub —
// sending it to a paid HTTP endpoint is the st-claude-proxy ban shape §3d exists to prevent. So we PIN
// every ambient knob: pass the resolved credential as `authToken` (OR path) or `apiKey` (first-party) AND
// set every UNUSED arm to `null`. An explicit `null` suppresses each field's env/config fallback
// (client.js:74-78 read env only when the arg is `undefined`; a `null` skips it), so no config-file /
// profile / ambient path can fire. Passing a real `authToken` alone already gates the ambient block off
// (client.js:145 requires BOTH apiKey and authToken null to resolve ambiently) — the `null` pins are
// defense-in-depth that hold even if a resolved credential were ever empty. This is the SDK equivalent of
// the agent-sdk firewall's "every knob set EXPLICITLY."
//
// WHY AN LRU: one `Anthropic` per credential key (a key = a user's credential), reused across that user's
// turns so connection pools/auth are not rebuilt every call; capped so a churn of one-off keys can't grow
// unbounded. Mirrors `backends/openrouter/client.ts`.

import Anthropic from "@anthropic-ai/sdk";
import type { Stream } from "@anthropic-ai/sdk/core/streaming";
import type {
  MessageCreateParams,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";

/** Max distinct clients kept warm; the least-recently-used is evicted past this. */
const ANTH_CLIENT_CACHE_MAX = 64;

/** The base URL of the v1 PRIMARY path — the OpenRouter Anthropic-Messages skin (the `authToken` Bearer
 *  path, part 02 §4). A wire literal, named so the belt states which host it pinned. */
export const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";

/**
 * The narrow structural slice of the SDK the anth-direct runner calls — `messages.create` with
 * `stream:true`, whose signature is the SDK's own (the streaming overload), so the real `Anthropic` is
 * trivially assignable and a test fake is a plain arrow returning the SDK's `Stream<RawMessageStreamEvent>`.
 * Exported as an infra DI port (the `no-inline-types` gate permits infra port interfaces).
 */
export interface AnthClient {
  readonly messages: {
    readonly create: (
      params: MessageCreateParams & { readonly stream: true },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<Stream<RawMessageStreamEvent>>;
  };
}

/** The two ambient-suppression pins shared by BOTH construction arms — set every UNUSED credential knob
 *  to `null` so no env/config/profile fallback can fire (part 02 §4). Spread into the `Anthropic` opts. */
const AMBIENT_CREDENTIALS_PINNED = {
  credentials: null,
  config: null,
  profile: null,
} as const;

/**
 * Build a fresh `@anthropic-ai/sdk` client for the v1 PRIMARY OpenRouter path: the resolved OR key as
 * `authToken` (sends `Authorization: Bearer`, which OR wants — NOT `apiKey`, which sends Anthropic's
 * `x-api-key`, client.d.ts:39-40) + the OR base URL + the full ambient belt (`apiKey:null` kills the env
 * default, credentials/config/profile pinned). No custom `fetch`/`Agent` — the global egress-firewalled
 * dispatcher applies automatically (part 02 §4).
 */
export function createOpenRouterAnthClient(orKey: string): AnthClient {
  return new Anthropic({
    baseURL: OPENROUTER_ANTHROPIC_BASE_URL,
    authToken: orKey,
    apiKey: null,
    ...AMBIENT_CREDENTIALS_PINNED,
  });
}

/**
 * Build a per-key LRU `getClient` resolver. The cache is CLOSURE state (owned by the one backend instance
 * the composition root builds at boot) — a warm client per key, reused across that user's turns, the
 * least-recently-used evicted past {@link ANTH_CLIENT_CACHE_MAX}. Touched on hit (delete+set ⇒
 * most-recent at the tail). Mirrors `backends/openrouter/client.ts`.
 */
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
