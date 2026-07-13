// domain/imagery/persistence/queries — all imagery_generations db access. Store-then-provenance order
// (verb): a crash between leaves a benign unreferenced blob, never a provenance row pointing at nothing.

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { Db } from "@orb/db";
import { imageryGenerations } from "@orb/db";
import type { AssetId, ChatId, ImageryGenerationId, ModelId } from "@orb/kit/ids";

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
