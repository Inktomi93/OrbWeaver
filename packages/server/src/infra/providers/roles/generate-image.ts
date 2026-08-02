// infra/providers/roles/generate-image — the `generateImage` role dispatcher (text → image).
// Hosted-primary: the firewall permits only `openrouter` today (OpenRouter image models). Switches on
// `credential.source` for forward-compat with future in-process image families.

import type { ImageGenerateRequest, ImageGenerateResult, ProviderDeps } from "../contract";
import { backendForSource, requireBackend, runRole } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "generateImage";

/** Bind the generateImage dispatcher to the wired backend registry. */
export function createGenerateImageRole(deps: ProviderDeps): (req: ImageGenerateRequest) => Promise<ImageGenerateResult> {
  return async (req) => {
    assertCredentialAllowed({ role: ROLE, source: req.credential.source });
    const backend = requireBackend(deps.backends, backendForSource(req.credential.source), ROLE);
    return await runRole({
      backend,
      impl: backend.generateImage,
      role: ROLE,
      req,
      attrs: { "provider.source": req.credential.source, "provider.model": req.model },
    });
  };
}
