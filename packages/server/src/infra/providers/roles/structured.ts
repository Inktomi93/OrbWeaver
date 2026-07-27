// infra/providers/roles/structured — the `structured` role dispatcher: one-shot SCHEMA-CONSTRAINED
// generation (owner ruling 2026-07-27, split from `summarize`). Firewall-checks, derives the sealed backend
// from `credential.source` (openrouter|vllm — never the metered sub, which reaches structured output only
// through the chat outputFormat path), and runs it. Batch-shaped like summarize; `responseFormat` required.

import type { SummarizeResult } from "@orb/contracts/providers";
import type { ProviderDeps, StructuredRequest } from "../contract";
import { backendForSource, requireBackend, requireRoleImpl } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "structured";

/** Bind the structured dispatcher to the wired backend registry. */
export function createStructuredRole(deps: ProviderDeps): (req: StructuredRequest) => Promise<SummarizeResult> {
  return async (req) => {
    assertCredentialAllowed({ role: ROLE, source: req.credential.source });
    const backend = requireBackend(deps.backends, backendForSource(req.credential.source), ROLE);
    return await requireRoleImpl(backend, backend.structured, ROLE)(req);
  };
}
