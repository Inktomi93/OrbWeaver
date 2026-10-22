// domain/imagery — FRONT DOOR, the only legal external import (domain-no-cross-feature): siblings (chat,
// automation, rpg) receive an injected `generatePicture` op at the composition root, never a
// sideways runtime import of this domain's internals.

export type { ImageryPortabilityService } from "./contract/portability.ts";

export type { ImageryService } from "./contract/service.ts";
export { createImageryPortability, createImageryService } from "./service.ts";

export { imageryToolDefinitions } from "./tool/index.ts";
export { createCaptionImage } from "./verbs/caption-image.ts";
export { createImageProviderOps } from "./verbs/image-provider-ops.ts";
export { createImageryInstructions } from "./verbs/imagery-instructions.ts";
