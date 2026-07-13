// infra/providers/roles/rerank — the `rerank` role dispatcher. Switches on `credential.source`. The
// hosted (openrouter) arm is wired (PD-11) — `@openrouter/sdk`'s `client.rerank.rerank` gives hosted
// rerank. Local (vLLM / ONNX cross-encoder) stays the default keyless path.

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
