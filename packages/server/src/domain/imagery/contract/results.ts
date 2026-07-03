// domain/imagery/contract/results — the verb RESULT shapes (§7.4 / types-in-contract — one home).
// `GeneratedPicture` is the orchestrator's return (imagery-design/01 §3.3): the n stored images (each a
// render-ready D44 media block for DIRECT consumers — the caller PARSES its own message string, D51), the
// resolved prompt + its source, the mode/model/cost provenance, and the warnings bus-free on the result.
// P5 (free mode) always returns `promptSource:"user"`, `reused:false`, `warnings:[]` — the extraction/reuse/
// edit arms that populate the other values are Phase 7.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { AssetId, ImageryGenerationId } from "@orb/kit/ids";

/** One generated image: the stored asset, its provenance row, and a render-ready D44 media block (a
 *  convenience for DIRECT consumers — the composer preview, workload posters; the chat caller persists a
 *  message STRING with `asset:` refs and never stores this block — imagery-design/04 §2.1). */
export interface GeneratedPictureImage {
  readonly assetId: AssetId;
  readonly generationId: ImageryGenerationId;
  readonly block: MessageContentBlock;
}

/** A non-fatal degradation on the RESULT (imagery-design/01 §3.3) — a union, not a bare string. P5 free mode
 *  never emits one; the edit/reference arms (Phase 7) push `image_edit_dropped`. */
export interface ImageryWarning {
  readonly code: "image_edit_dropped";
  readonly detail: string;
}

/** The orchestrator's return: n images in ONE logical generation + the resolved provenance. */
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
