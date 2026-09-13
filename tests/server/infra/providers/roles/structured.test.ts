// createStructuredRole — the `structured` role dispatcher (the one-shot schema-constrained generation
// PRIMITIVE, split from `summarize` — owner ruling 2026-07-27). Switches on `credential.source`; the firewall
// permits openrouter | vllm only — NEVER the metered sub (its structured channel is the chat outputFormat
// path), and NEVER the chat-less local-light tier. Same source × route matrix as summarize (the table-driven
// `_support.ts` harness); this mirror supplies the structured spec.

import type { ResolvedCredential, StructuredRequest } from "@orb/server/infra/providers";
import { createStructuredRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support.ts";

runEmbedShapedRoleTests({
  method: "structured",
  create: createStructuredRole as never,
  allowedSources: ["openrouter", "vllm"],
  // A minimal request stub — the dispatcher reads only `credential.source`; the schema/sampling shape is
  // irrelevant to the source-routing this suite asserts.
  makeReq: (credential: ResolvedCredential): StructuredRequest =>
    // @orb-waive no-test-fabrication(unknown): minimal request stub (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      credential,
      model: "m",
      inputs: [{ systemPrompt: "", userPrompt: "x" }],
      responseFormat: { name: "x", schema: { type: "object" } },
    }) as unknown as StructuredRequest,
});
