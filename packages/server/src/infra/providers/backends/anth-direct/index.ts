// biome-ignore-all lint/performance/noBarrelFile: the anth-direct FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory, and the surface the family's tests import (deep imports into
// `backends/anth-direct/<file>` are RED for everyone else by the `providers-public-surface-only` cruiser
// rule). Load-bearing for the encapsulation invariant.
//
// infra/providers/backends/anth-direct — THE DIRECT ANTHROPIC-MESSAGES CHAT BACKEND (D67): the official
// `@anthropic-ai/sdk` behind a narrow structural port, PAID-KEY-ONLY, tool-less, stateless. Sealed: no
// other backend imports it; it imports only the shared `backends/kit` wire helpers DOWN + the SDK. NO
// agent/embed/rerank/image roles (chat only — the agent role structurally cannot route here, part 02 §3b).
//
// THE EXTENDED SECURITY BELT (part 02 §4) lives in `client.ts` — the SDK's ambient credential surface
// (apiKey/authToken/baseURL/credentials/config/profile) is pinned so the host `claude login` OAuth can
// never be lazily minted and sent to the paid endpoint (the sub-exclusion §3d, tier-1 belt half).

import type { ChatRequest, ChatResult, ProviderBackend } from "../../contract";
import { ProviderError } from "../../contract";
import type { AnthClient } from "./client";
import { createAnthClientCache } from "./client";
import { requireAnthDirectKey } from "./credential-guard";
import type { AnthDirectChatDeps } from "./runner";
import { runAnthDirectTurn } from "./runner";

// ── Family-internal surface (entry wiring + the family's OWN tests). NOT a domain-reachable surface —
//    `providers-public-surface-only` keeps domains on the providers root barrel; this family barrel is
//    reachable only by `entry/` + the anth-direct tests (whose import resolution can only hit an index.ts). ──
export type { AnthClient } from "./client";
export {
  createAnthClientCache,
  createOpenRouterAnthClient,
  OPENROUTER_ANTHROPIC_BASE_URL,
} from "./client";
export { requireAnthDirectKey } from "./credential-guard";
export { anthDirectError } from "./errors";
export type { AnthDirectTurnLog } from "./log";
export { logAnthDirectError, logAnthDirectTurn } from "./log";
export type { AnthReducedTurn } from "./reducer";
export { reduceAnthStream } from "./reducer";
export { anthHistoryCacheOffsets, buildAnthMessageParams } from "./request";
export type { AnthDirectChatDeps } from "./runner";
export { runAnthDirectTurn } from "./runner";

/**
 * The deps `entry/` injects to build the backend. `now` is REQUIRED — the composition root owns the clock
 * (the `no-raw-clock` determinism seam). `getClient` defaults to the real belted per-key LRU; tests override
 * it with a fake `AnthClient`.
 */
export interface AnthDirectBackendDeps {
  readonly now: () => number;
  readonly getClient?: ((orKey: string) => AnthClient) | undefined;
}

/**
 * Build the sealed anth-direct {@link ProviderBackend}. It serves ONLY `runChatTurn`, and ONLY the
 * `anthropic-messages` api — any other api reaching it is an operator wiring error (the dispatcher guarantees
 * the pairing), so it throws `kind:"invalid"`. The credential is converted to the OR key through the
 * fail-closed guard (the sub-exclusion tier-1 door), then a warm belted client is obtained per key. Async so
 * a synchronous guard throw surfaces as a rejected promise (the contract method must always be awaitable).
 */
export function createAnthDirectBackend(deps: AnthDirectBackendDeps): ProviderBackend {
  const getClient = deps.getClient ?? createAnthClientCache();
  const chatDeps: AnthDirectChatDeps = { now: deps.now };
  return {
    key: "anth-direct",
    runChatTurn: async (req: ChatRequest): Promise<ChatResult> => {
      if (req.api !== "anthropic-messages") {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message: `anth-direct backend does not serve the "${req.api}" api`,
        });
      }
      // The credential guard fail-closes on a non-`openrouter` source (the sub-exclusion at the runner door);
      // the resolved OR key is passed as the belted client's Bearer `authToken` — never logged.
      const client = getClient(requireAnthDirectKey(req.credential));
      return await runAnthDirectTurn(client, req, chatDeps);
    },
  };
}
