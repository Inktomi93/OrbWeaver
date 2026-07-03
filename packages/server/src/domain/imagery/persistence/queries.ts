// domain/imagery/persistence/queries — ALL `imagery_generations` db access (the ONE writer). The row is the
// durable per-image provenance (imagery-design/03 §4.1): what each `kind:"generated"` asset IS + the FK the
// assets ref-registry carries so mark-sweep never reaps a live in-chat image. P5 (free mode) populates the
// free-mode columns only; the Phase-7 orchestrator fills `subjectCharacterId`/`identityHash`/`negativePrompt`
// with NO migration (they are nullable / defaulted). Store-THEN-provenance order (verb): a crash between
// leaves a benign unreferenced blob, never a provenance row pointing at nothing.

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { Db } from "@orb/db";
import { imageryGenerations } from "@orb/db";
import type { AssetId, ChatId, ImageryGenerationId, ModelId } from "@orb/kit/ids";

/** The columns one generation row writes (P5 free-mode subset; the reserved columns stay at their defaults).
 *  File-local (the verb passes a structurally-matching literal — no exported feature type outside contract/). */
interface InsertGenerationInput {
  readonly id: ImageryGenerationId;
  readonly assetId: AssetId;
  readonly chatId: ChatId | null;
  readonly mode: PromptTemplateMode;
  readonly prompt: string;
  readonly model: ModelId | string;
  readonly costUsd: number | null;
  readonly edited: boolean;
  readonly createdAt: number;
}

/** INSERT one `imagery_generations` row — the sole write path for the provenance index. */
export async function insertGeneration(db: Db, input: InsertGenerationInput): Promise<void> {
  await db.insert(imageryGenerations).values({
    id: input.id,
    assetId: input.assetId,
    chatId: input.chatId,
    mode: input.mode,
    prompt: input.prompt,
    model: input.model,
    costUsd: input.costUsd,
    edited: input.edited,
    createdAt: input.createdAt,
  });
}
