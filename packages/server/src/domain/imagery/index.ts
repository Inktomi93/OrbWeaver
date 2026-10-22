// domain/imagery — FRONT DOOR, the only legal external import (domain-no-cross-feature): siblings (chat,
// automation, rpg) receive an injected `generatePicture` op at the composition root, never a
// sideways runtime import of this domain's internals.

export type { CaptionImageDeps, ImageProviderDeps } from "./contract/generation-ops.ts";

export type { ImageryPortabilityService } from "./contract/portability.ts";

export type { ImageryService } from "./contract/service.ts";
export { createImageryPortability, createImageryService } from "./service.ts";
// The pure I3 reuse-hash primitive — exposed so the composition root can bind it into a
// non-character consumer's injected op (docs/plans/rpg/design.md: rpg's NPC-portrait reuse consumes imagery's OWN hash
// machinery, never a fork).
export { identityHashFor } from "./substrate/identity-hash.ts";
export { imageryToolDefinitions } from "./tool/index.ts";
export { createCaptionImage } from "./verbs/caption-image.ts";
export { createImageProviderOps } from "./verbs/image-provider-ops.ts";
export { createImageryInstructions } from "./verbs/imagery-instructions.ts";
