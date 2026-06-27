// infra/providers/roles/summarize — the `summarize` role dispatcher. A request-shaper over the chat
// role: it runs a summarize prompt on the user's hosted/local chat backend, so it switches on
// `credential.source` (firewall: openrouter | vllm — never the metered sub). Batch-shaped; the backend
// decides parallelism per family.

import type { SummarizeResult } from "@orb/contracts/providers";
import type { ProviderDeps, SummarizeRequest } from "../contract";
import { backendForSource, requireBackend, requireRoleImpl } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "summarize";

/** Bind the summarize dispatcher to the wired backend registry. */
export function createSummarizeRole(
  deps: ProviderDeps,
): (req: SummarizeRequest) => Promise<SummarizeResult> {
  return async (req) => {
    assertCredentialAllowed({ role: ROLE, source: req.credential.source });
    const backend = requireBackend(deps.backends, backendForSource(req.credential.source), ROLE);
    return await requireRoleImpl(backend, backend.summarize, ROLE)(req);
  };
}
