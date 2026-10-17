// domain/imagery — COMPOSITION ROOT. Wires the verbs over the injected `ImageryContext`. ZERO logic: it only
// calls the verb factories and assembles the `ImageryService` (typed return → a missing/renamed verb fails
// `tsc`). The `ImageryContext` (db + the injected clock/id seams + the connection/executor/assets/stats ops)
// is built at the entry composition root and passed in — imagery sideways-imports nothing.

import { batchHandle, databaseForOwner, databaseHandle } from "@orb/db/wiring-owner";
import type { ImageryPortabilityAssemblyContext, ImageryPortabilityContext, ImageryPortabilityService } from "./contract/portability.ts";
import type { ImageryAssemblyInput, ImageryContext, ImageryService } from "./contract/service.ts";
import { createCaptionAvatar } from "./verbs/caption-avatar.ts";
import { createEditImage } from "./verbs/edit-image.ts";
import { createExportProvenance } from "./verbs/export-provenance.ts";
import { createExtractPrompt, createResolvePrompt } from "./verbs/extract-prompt.ts";
import { createGeneratePicture } from "./verbs/generate-picture.ts";
import { createImportProvenance } from "./verbs/import-provenance.ts";
import { createReadProvenance } from "./verbs/read-provenance.ts";

export function createImageryService(input: ImageryAssemblyInput): ImageryService {
  const ctx: ImageryContext = {
    ...input,
    db: databaseForOwner(input.db),
    applyStatsDelta: (batch, db, delta) => input.applyStatsDelta(batchHandle(batch), databaseHandle(db), delta),
  };
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

export function createImageryPortability(input: ImageryPortabilityAssemblyContext): ImageryPortabilityService {
  const ctx: ImageryPortabilityContext = {
    ...input,
    db: databaseForOwner(input.db),
    bumpStatsCanonVersion: (batch, db, ownerId) => input.bumpStatsCanonVersion(batchHandle(batch), databaseHandle(db), ownerId),
  };
  return { exportAll: createExportProvenance(ctx), importFile: createImportProvenance(ctx) };
}
