// createRerankRole — the `rerank` role dispatcher. Switches on `credential.source`; the firewall permits
// openrouter (the openrouter rerank BACKEND itself throws not-supported — the backend's concern, not the
// dispatcher's) plus local vLLM / local-light; max-pro-sub/custom_openai denied. The full source × route
// matrix + fail-closed paths are table-driven in `_support.ts` (W2a); this mirror supplies the rerank spec.

import type { RerankRequest, ResolvedCredential } from "@orb/server/infra/providers";
import { createRerankRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support";

runEmbedShapedRoleTests({
  method: "rerank",
  create: createRerankRole as never,
  allowedSources: ["openrouter", "vllm", "local-light"],
  // A minimal request stub — the dispatcher reads only `credential.source`; the full RerankQuery/document
  // shape is irrelevant to the source-routing this suite asserts.
  makeReq: (credential: ResolvedCredential): RerankRequest =>
    // FABRICATION-OK: minimal request stub (see above).
    ({ credential, model: "m", query: "q", documents: [] }) as unknown as RerankRequest,
});
