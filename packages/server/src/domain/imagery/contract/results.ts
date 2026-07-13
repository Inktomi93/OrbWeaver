// domain/imagery/contract/results — the verb result shapes. GeneratedPicture is the orchestrator's
// return: n stored images, the resolved prompt + its source, the mode/model/cost provenance, and warnings.
// Free mode always returns promptSource:"user", reused:false, warnings:[].

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { AssetId, ImageryGenerationId } from "@orb/kit/ids";

/** block is a render-ready convenience for direct consumers; the chat caller persists a message string
 *  with asset: refs instead and never stores this block. */
export interface GeneratedPictureImage {
  readonly assetId: AssetId;
  readonly generationId: ImageryGenerationId;
  readonly block: MessageContentBlock;
}

export interface ImageryWarning {
  readonly code: "image_edit_dropped";
  readonly detail: string;
}

export interface GeneratedPicture {
  readonly images: readonly GeneratedPictureImage[];
  readonly prompt: string;
  readonly promptSource: "extracted" | "captioned" | "user";
  readonly mode: PromptTemplateMode;
  readonly model: string;
  readonly costUsd: number | null;
  readonly reused: boolean;
  readonly warnings: readonly ImageryWarning[];
}
