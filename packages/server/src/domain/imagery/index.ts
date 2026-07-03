// domain/imagery — FRONT DOOR (the only legal external import). Re-exports the public surface:
//   • createImageryService (the factory the entry root wires) + the ImageryContext DI-bundle type
//   • the ImageryService contract + the param/result types (transport + tests name them off the front door)
//   • the structural executor-op types the composition root binds infra/providers onto
//   • the typed domain errors (mapped to tRPC codes at the transport boundary)
// A sibling domain NEVER runtime-imports imagery's internals sideways (domain-no-cross-feature): consumers
// (chat, automation, expressions, rpg) receive an injected `generatePicture` op at the composition root.

// The DI bundle the entry root assembles + hands to the factory.
export type { ImageryContext } from "./context";
// The typed domain errors.
export { GenerationFailedError, ImageryNotConfiguredError } from "./contract/errors";
// The verb params.
export type { GeneratePictureParams } from "./contract/params";
// The verb results.
export type {
  GeneratedPicture,
  GeneratedPictureImage,
  ImageryWarning,
} from "./contract/results";
// The structural executor-op port types (compose binds infra/providers.generateImage onto these).
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
