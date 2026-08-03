// createEmbedRole — the `embed` role dispatcher. Switches on `credential.source` (NOT vLLM-hard-pinned: a
// hosted key and both local engines are eligible). The firewall rejects max-pro-sub/custom_openai. The
// full source × route matrix + every fail-closed path is table-driven in `_support.ts` (W2a); this mirror
// supplies the embed spec (kept 1:1 for the test-presence gate).

import type { EmbedRequest, ResolvedCredential } from "@orb/server/infra/providers";
import { createEmbedRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support.ts";

runEmbedShapedRoleTests({
  method: "embed",
  create: createEmbedRole as never,
  allowedSources: ["openrouter", "vllm", "local-light"],
  makeReq: (credential: ResolvedCredential): EmbedRequest => ({ credential, model: "m", input: "x" }) as EmbedRequest,
});
