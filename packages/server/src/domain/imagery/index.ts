// domain/imagery — FRONT DOOR, the only legal external import (domain-no-cross-feature): siblings (chat,
// automation, expressions, rpg) receive an injected `generatePicture` op at the composition root, never a
// sideways runtime import of this domain's internals.

export type { ImageryContext } from "./context";
export { GenerationFailedError, ImageryNotConfiguredError } from "./contract/errors";
export type { GeneratePictureParams } from "./contract/params";
export type {
  GeneratedPicture,
  GeneratedPictureImage,
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
// Factory.
export { createImageryService } from "./service";
