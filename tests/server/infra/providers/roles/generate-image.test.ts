// createGenerateImageRole — the `generateImage` role dispatcher (text → image). Hosted-primary: the
// firewall permits ONLY openrouter today; every other source is denied. The full source × route matrix +
// fail-closed paths are table-driven in `_support.ts` (W2a); this mirror supplies the generateImage spec.

import type { ImageGenerateRequest, ResolvedCredential } from "@orb/server/infra/providers";
import { createGenerateImageRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support";

runEmbedShapedRoleTests({
  method: "generateImage",
  create: createGenerateImageRole as never,
  allowedSources: ["openrouter"],
  makeReq: (credential: ResolvedCredential): ImageGenerateRequest =>
    ({ credential, model: "m", prompt: "a cat" }) as ImageGenerateRequest,
});
