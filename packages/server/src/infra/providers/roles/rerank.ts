// infra/providers/roles/rerank — the `rerank` role dispatcher. Switches on `credential.source`. The
// hosted (openrouter) arm is permitted at the firewall, but OpenRouter has no generic rerank endpoint —
// the openrouter rerank backend itself throws a typed not-supported `ProviderError` (rerank-hosted is a
// flagged gap, not a silent fallback — providers.md). Local (vLLM / ONNX cross-encoder) is the path.

import type { RerankResult } from "@orb/contracts/providers";
import type { ProviderDeps, RerankRequest } from "../contract";
import { backendForSource, requireBackend, requireRoleImpl } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "rerank";

/** Bind the rerank dispatcher to the wired backend registry. */
export function createRerankRole(
  deps: ProviderDeps,
): (req: RerankRequest) => Promise<RerankResult> {
  return async (req) => {
    assertCredentialAllowed({ role: ROLE, source: req.credential.source });
    const backend = requireBackend(deps.backends, backendForSource(req.credential.source), ROLE);
    return await requireRoleImpl(backend, backend.rerank, ROLE)(req);
  };
}
