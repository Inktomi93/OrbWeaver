// infra/providers/roles/embed — the `embed` role dispatcher. Switches on `credential.source` (NOT
// vLLM-hard-pinned: a hosted key and the local engine are both eligible). The firewall rejects
// `max-pro-sub`/`custom_openai` (those endpoints don't authenticate text embeddings).

import type { EmbedResult } from "@orb/contracts/providers";
import type { EmbedRequest, ProviderDeps } from "../contract";
import { backendForSource, requireBackend, runRole } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "embed";

/** Bind the embed dispatcher to the wired backend registry. */
export function createEmbedRole(deps: ProviderDeps): (req: EmbedRequest) => Promise<EmbedResult> {
  return async (req) => {
    assertCredentialAllowed({ role: ROLE, source: req.credential.source });
    const backend = requireBackend(deps.backends, backendForSource(req.credential.source), ROLE);
    return await runRole({
      backend,
      impl: backend.embed,
      role: ROLE,
      req,
      attrs: { "provider.source": req.credential.source, "provider.model": req.model },
    });
  };
}
