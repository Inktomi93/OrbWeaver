// createGenerateImageRole — the `generateImage` role dispatcher (text → image). The firewall permits
// openrouter + venice (MA-1) + comfyui (MA-8, the local engine); every other source is denied. The full
// source × route matrix + fail-closed paths are table-driven in `_support.ts` (W2a); this mirror supplies
// the generateImage spec.

import type { ImageGenerateRequest, ResolvedCredential } from "@orb/server/infra/providers";
import { createGenerateImageRole } from "@orb/server/infra/providers";
import { runEmbedShapedRoleTests } from "./_support";

runEmbedShapedRoleTests({
  method: "generateImage",
  create: createGenerateImageRole as never,
  allowedSources: ["openrouter", "venice", "comfyui"],
  makeReq: (credential: ResolvedCredential): ImageGenerateRequest => ({ credential, model: "m", prompt: "a cat" }) as ImageGenerateRequest,
});
