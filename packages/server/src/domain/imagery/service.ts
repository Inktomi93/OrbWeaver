// domain/imagery — COMPOSITION ROOT. Wires the verbs over the injected `ImageryContext`. ZERO logic: it only
// calls the verb factories and assembles the `ImageryService` (typed return → a missing/renamed verb fails
// `tsc`). The `ImageryContext` (db + the injected clock/id seams + the connection/executor/assets/stats ops)
// is built at the entry composition root and passed in — imagery sideways-imports nothing.

import type { ImageryContext, ImageryService } from "./contract/service";
import { createCaptionAvatar } from "./verbs/caption-avatar";
import { createEditImage } from "./verbs/edit-image";
import { createExtractPrompt, createResolvePrompt } from "./verbs/extract-prompt";
import { createGeneratePicture } from "./verbs/generate-picture";
import { createReadProvenance } from "./verbs/read-provenance";

export function createImageryService(ctx: ImageryContext): ImageryService {
  // Verb-to-verb deps are wired HERE (domain-no-cross-verb): captionAvatar → resolvePrompt → the two
  // prompt-consuming verbs. One resolvePrompt instance so extractPrompt + generatePicture share the dispatch.
  const captionAvatar = createCaptionAvatar(ctx);
  const resolvePrompt = createResolvePrompt(ctx, { captionAvatar });
  return {
    generatePicture: createGeneratePicture(ctx, { resolvePrompt }),
    extractPrompt: createExtractPrompt(ctx, { resolvePrompt }),
    readProvenance: createReadProvenance(ctx),
    editImage: createEditImage(ctx),
  };
}
