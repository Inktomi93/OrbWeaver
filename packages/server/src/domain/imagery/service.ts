// domain/imagery — COMPOSITION ROOT. Wires the verbs over the injected `ImageryContext`. ZERO logic: it only
// calls the verb factories and assembles the `ImageryService` (typed return → a missing/renamed verb fails
// `tsc`). The `ImageryContext` (db + the injected clock/id seams + the connection/executor/assets/stats ops)
// is built at the entry composition root and passed in — imagery sideways-imports nothing.

import type { ImageryContext, ImageryService } from "./contract/service";
import { createGeneratePicture } from "./verbs/generate-picture";

export function createImageryService(ctx: ImageryContext): ImageryService {
  return {
    generatePicture: createGeneratePicture(ctx),
  };
}
