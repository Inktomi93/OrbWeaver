// domain/imagery — FRONT DOOR, the only legal external import (domain-no-cross-feature): siblings (chat,
// automation, expressions, rpg) receive an injected `generatePicture` op at the composition root, never a
// sideways runtime import of this domain's internals.

export type { ImageryContext } from "./context.ts";
export { GenerationFailedError, ImageEditUnsupportedError, ImageryNotConfiguredError, PromptExtractionFailedError } from "./contract/errors.ts";
export type { EditImageParams, EditImageSource, ExtractPromptParams, GeneratePictureParams, ReadProvenanceParams, ReusePolicy } from "./contract/params.ts";
export type {
  ExtractedPrompt,
  GeneratedPicture,
  GeneratedPictureImage,
  GenerationProvenance,
  ImageryWarning,
} from "./contract/results.ts";
export type {
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageGenerateUsage,
  ImageryService,
  ResolvedGenerateImage,
} from "./contract/service.ts";
export { createImageryService } from "./service.ts";
// The pure I3 reuse-hash primitive — exposed so the composition root can bind it into a
// non-character consumer's injected op (docs/plans/rpg/design.md: rpg's NPC-portrait reuse consumes imagery's OWN hash
// machinery, never a fork).
export { identityHashFor } from "./substrate/identity-hash.ts";
export { imageryToolDefinitions } from "./tool/index.ts";
