// domain/imagery/contract/results — the verb result shapes. GeneratedPicture is the orchestrator's
// return: n stored images, the resolved prompt + its source, the mode/model/cost provenance, and warnings.
// Free mode always returns promptSource:"user", reused:false, warnings:[].

import type { Principal } from "@orb/contracts/identity";
import type { GeneratedPictureImage, ImageryWarning, PromptTemplateMode } from "@orb/contracts/imagery";
import type { AssetId, CharacterId, ChatId, ImageryGenerationId, ModelId } from "@orb/kit/ids";

/** One reuse-candidate row the B2 hit path rebuilds a picture from (doc 03 §4.4) — the persistence lookup's
 *  projection, consumed by the generate-picture orchestrator. */
export interface ReuseRow {
  readonly generationId: ImageryGenerationId;
  readonly assetId: AssetId;
  readonly prompt: string;
  readonly model: ModelId;
}

/** The provenance fields the caller stamps on every row of one generation (one `imagery_generations` row per
 *  stored image), consumed by the shared generation tail (`substrate/generate-core`). `generatePicture` fills
 *  subject/identityHash on the portrait path; `editImage` sets `mode:"free"`, `edited:true`, nulls both. */
export interface GenerationProvenanceInput {
  readonly caller: Principal;
  readonly chatId: ChatId | null;
  readonly mode: PromptTemplateMode;
  readonly subjectCharacterId: CharacterId | null;
  readonly identityHash: string | null;
  readonly prompt: string;
  readonly negativePrompt: string | null;
  readonly edited: boolean;
}

/** The shared generation tail's return: the stored images + the model + the GENERATION-only cost (the caller
 *  sums in any extraction/caption spend) + the runner's edit-strip belt warnings surfaced onto the result. */
export interface GenerationOutcome {
  readonly images: readonly GeneratedPictureImage[];
  readonly model: ModelId;
  readonly costUsd: number | null;
  readonly warnings: readonly ImageryWarning[];
}

export type { ExtractedPrompt, GeneratedPicture, GeneratedPictureImage, GenerationProvenance, ImageryWarning } from "@orb/contracts/imagery";
