// domain/imagery — FRONT DOOR, the only legal external import (domain-no-cross-feature): siblings (chat,
// automation, expressions, rpg) receive an injected `generatePicture` op at the composition root, never a
// sideways runtime import of this domain's internals.

export type { ImageryContext } from "./context";
export { GenerationFailedError, ImageEditUnsupportedError, ImageryNotConfiguredError, PromptExtractionFailedError } from "./contract/errors";
export type { EditImageParams, EditImageSource, ExtractPromptParams, GeneratePictureParams, ReadProvenanceParams, ReusePolicy } from "./contract/params";
export type {
  ExtractedPrompt,
  GeneratedPicture,
  GeneratedPictureImage,
  GenerationProvenance,
  ImageryWarning,
} from "./contract/results";
export type {
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageGenerateUsage,
  ImageryService,
  ResolvedGenerateImage,
} from "./contract/service";
export { createImageryService } from "./service";
// The pure I3 reuse-hash primitive (imagery-design/03 §4.3) — exposed so the composition root can bind it into a
// non-character consumer's injected op (rpg-design/08 §2: rpg's NPC-portrait reuse consumes imagery's OWN hash
// machinery, never a fork).
export { identityHashFor } from "./substrate/identity-hash";
export { imageryToolDefinitions } from "./tool";
