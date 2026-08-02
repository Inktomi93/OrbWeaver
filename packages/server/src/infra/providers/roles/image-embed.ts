// infra/providers/roles/image-embed — the `imageEmbed` role dispatcher (joint image+text → one shared
// vector space). Switches on `credential.source`; firewall rejects `max-pro-sub`/`custom_openai`. A
// backend that can't fuse modalities (a CLIP two-tower) rejects the `multimodal` kind typed at its own
// boundary.

import type { ImageEmbedResult } from "@orb/contracts/providers";
import type { ImageEmbedRequest, ProviderDeps } from "../contract";
import { backendForSource, requireBackend, runRole } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "imageEmbed";

/** Bind the imageEmbed dispatcher to the wired backend registry. */
export function createImageEmbedRole(deps: ProviderDeps): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
  return async (req) => {
    assertCredentialAllowed({ role: ROLE, source: req.credential.source });
    const backend = requireBackend(deps.backends, backendForSource(req.credential.source), ROLE);
    return await runRole({
      backend,
      impl: backend.imageEmbed,
      role: ROLE,
      req,
      attrs: { "provider.source": req.credential.source, "provider.model": req.model },
    });
  };
}
