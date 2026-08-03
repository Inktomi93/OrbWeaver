// createSummarizeRole — the `summarize` role dispatcher (a request-shaper over the chat role). Switches on
// `credential.source`; the firewall permits openrouter | vllm only — NEVER the metered sub, and NEVER the
// chat-less local-light tier (no chat surface to shape). The full source × route matrix + fail-closed paths
// are table-driven in `_support.ts` (W2a); this mirror supplies the summarize spec.

import type { ResolvedCredential, SummarizeRequest } from "@orb/server/infra/providers";
import { createSummarizeRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support.ts";

runEmbedShapedRoleTests({
  method: "summarize",
  create: createSummarizeRole as never,
  allowedSources: ["openrouter", "vllm"],
  // A minimal request stub — the dispatcher reads only `credential.source`; the full SummarizeRequest
  // sampling shape is irrelevant to the source-routing this suite asserts.
  makeReq: (credential: ResolvedCredential): SummarizeRequest =>
    // FABRICATION-OK: minimal request stub (see above).
    ({
      credential,
      model: "m",
      inputs: [{ systemPrompt: "", userPrompt: "x" }],
    }) as unknown as SummarizeRequest,
});
