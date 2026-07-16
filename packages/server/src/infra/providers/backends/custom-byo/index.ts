// biome-ignore-all lint/performance/noBarrelFile: the custom-byo FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the inspector (the credentials "Test endpoint" diagnostic path), and
// the surface the family's tests import (deep imports into `backends/custom-byo/<file>` are RED for everyone
// else by the `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.
//
// infra/providers/backends/custom-byo — THE RAW-FETCH BYO CHAT BACKEND: a stateless proxy to a user-wired
// OpenAI-compatible endpoint whose ENTIRE behaviour is the user's config (§1a — nothing baked: the model
// profile is read from the capability descriptor, the response shape is reshaped by a declared map). Sealed:
// no other backend imports it; it imports only the shared `backends/kit` wire helpers DOWN. Chat-only — the
// credential firewall forbids `custom_openai` for every non-chat role, so this backend implements only
// `runChatTurn`.

import type { ChatRequest, ChatResult, EndpointInspection, InspectRequest, ProviderBackend } from "../../contract";
import { ProviderError } from "../../contract";
import { inspectCustomByoEndpoint } from "./inspect";
import type { CustomByoRunnerDeps } from "./runners/chat";
import { runChatTurn } from "./runners/chat";

// ── Family-internal surface (entry wiring + the family's OWN tests). NOT domain-reachable. ──────────────
export { inspectCustomByoEndpoint } from "./inspect";
export { reshapeChunk } from "./runners/chat";

const CUSTOM_OPENAI_SOURCE = "custom_openai";

/**
 * Build the sealed custom-byo {@link ProviderBackend}. `now` is REQUIRED — the composition root owns the
 * clock (the `no-raw-clock` determinism seam); `random` is optional (tests inject a seeded RNG for the
 * pre-commit retry's backoff jitter). `runChatTurn` narrows the {@link ChatRequest} to its
 * `api:"chat-completions"` arm and fail-closes on a wrong api/source. `inspect` is the "Test endpoint"
 * diagnostic: it reads the endpoint (base URL / key / headers) off the resolved credential — fail-closed on
 * a wrong source (the diagnostic dispatcher already routes `custom_openai` here; this re-asserts at the door).
 */
export function createCustomByoBackend(deps: CustomByoRunnerDeps): ProviderBackend {
  return {
    key: "custom-openai",
    runChatTurn: (req: ChatRequest): Promise<ChatResult> => runChatTurn(req, deps),
    // async so the synchronous source guard surfaces as a rejected promise (contract methods are awaitable).
    inspect: async (req: InspectRequest): Promise<EndpointInspection> => {
      const credential = req.credential;
      if (credential.source !== CUSTOM_OPENAI_SOURCE) {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message: `custom-byo inspect requires a "${CUSTOM_OPENAI_SOURCE}" credential, got "${credential.source}"`,
        });
      }
      return await inspectCustomByoEndpoint({
        baseUrl: credential.baseUrl,
        apiKey: credential.apiKey,
        headers: credential.headers,
        model: req.model,
        includeBody: credential.includeBody,
        excludeBody: credential.excludeBody,
        ...(req.signal !== undefined ? { signal: req.signal } : {}),
      });
    },
  };
}
