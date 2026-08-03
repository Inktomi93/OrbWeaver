// createImageEmbedRole — the `imageEmbed` role dispatcher (joint image+text → one shared vector space).
// Switches on `credential.source`; the firewall rejects max-pro-sub/custom_openai (mirrors embed). The full
// source × route matrix + fail-closed paths are table-driven in `_support.ts` (W2a); this mirror supplies
// the imageEmbed spec.

import type { ImageEmbedRequest, ResolvedCredential } from "@orb/server/infra/providers";
import { createImageEmbedRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support.ts";

runEmbedShapedRoleTests({
  method: "imageEmbed",
  create: createImageEmbedRole as never,
  allowedSources: ["openrouter", "vllm", "local-light"],
  // A minimal request stub — the dispatcher reads only `credential.source`; the full ImageEmbedInput shape
  // is irrelevant to the source-routing this suite asserts.
  makeReq: (credential: ResolvedCredential): ImageEmbedRequest =>
    // FABRICATION-OK: minimal request stub (see above).
    ({
      credential,
      model: "m",
      input: { kind: "text", text: "x" },
    }) as unknown as ImageEmbedRequest,
});
