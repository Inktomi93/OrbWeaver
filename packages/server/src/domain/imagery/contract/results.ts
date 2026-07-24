// domain/imagery/contract/results — the verb result shapes. GeneratedPicture is the orchestrator's
// return: n stored images, the resolved prompt + its source, the mode/model/cost provenance, and warnings.
// Free mode always returns promptSource:"user", reused:false, warnings:[].

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { AssetId, CharacterId, ChatId, ImageryGenerationId } from "@orb/kit/ids";

/** block is a render-ready convenience for direct consumers; the chat caller persists a message string
 *  with asset: refs instead and never stores this block. */
export interface GeneratedPictureImage {
  readonly assetId: AssetId;
  readonly generationId: ImageryGenerationId;
  readonly block: MessageContentBlock;
}

/** The imagery drop codes surfaced to a caller (imagery-design/03 §2): `image_edit_dropped` = the whole edit/
 *  avatar reference dropped for a non-edit model.
 *  Structural subset of the infra `WARNING_CODES` image members (imagery never imports `#infra`; mapped at compose). */
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

/** One reuse-candidate row the B2 hit path rebuilds a picture from (doc 03 §4.4) — the persistence lookup's
 *  projection, consumed by the generate-picture orchestrator. */
export interface ReuseRow {
  readonly generationId: ImageryGenerationId;
  readonly assetId: AssetId;
  readonly prompt: string;
  readonly model: string;
}

/** The durable provenance of one generated image (`readProvenance`, doc 04 §3) — the gallery's
 *  prompt/model/cost detail + the regenerate affordance's source prompt. Ownership is proven by the join
 *  through `assets.ownerId` (the row carries no ownerId; D20). */
export interface GenerationProvenance {
  readonly generationId: ImageryGenerationId;
  readonly assetId: AssetId;
  readonly mode: PromptTemplateMode;
  readonly prompt: string;
  readonly negativePrompt: string | null;
  readonly model: string;
  readonly costUsd: number | null;
  readonly subjectCharacterId: CharacterId | null;
  /** The reuse hash stored on this generation (rpg-design/08 §2): the portrait-mode subject hash, an external
   *  free-mode consumer's precomputed hash, or `null`. Exposed so a non-character consumer's own reuse gate can
   *  read it back + compare (rpg's NPC-portrait short-circuit) — the internal imagery gate matches by query, not
   *  through this read. */
  readonly identityHash: string | null;
  readonly edited: boolean;
  readonly createdAt: number;
}

/** `extractPrompt`'s result — the post-processReply keyword prompt + its source + the side-LLM spend. The
 *  caller reviews it, then calls `generatePicture` with it as `prompt` (which bypasses re-extraction). */
export interface ExtractedPrompt {
  readonly prompt: string;
  readonly mode: PromptTemplateMode;
  readonly source: "extracted" | "captioned";
  readonly costUsd: number | null;
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
  readonly model: string;
  readonly costUsd: number | null;
  readonly warnings: readonly ImageryWarning[];
}
