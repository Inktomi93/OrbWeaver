// domain/imagery/persistence/queries — all imagery_generations db access. Store-then-provenance order
// (verb): a crash between leaves a benign unreferenced blob, never a provenance row pointing at nothing.
// Ownership is NOT a column on this table (D20) — it DERIVES via `asset_id → assets.ownerId`; the reuse
// lookup + the provenance read both JOIN `assets` and gate on `ownerId` (no cross-owner leak, no ownerId dup).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { Db } from "@orb/db";
import { assets, imageryGenerations } from "@orb/db";
import type { AssetId, CharacterId, ChatId, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import { and, desc, eq } from "drizzle-orm";
import type { GenerationProvenance, ReuseRow } from "../contract/results";

interface InsertGenerationInput {
  readonly id: ImageryGenerationId;
  readonly assetId: AssetId;
  readonly chatId: ChatId | null;
  readonly mode: PromptTemplateMode;
  readonly subjectCharacterId: CharacterId | null;
  readonly identityHash: string | null;
  readonly prompt: string;
  readonly negativePrompt: string | null;
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
    subjectCharacterId: input.subjectCharacterId,
    identityHash: input.identityHash,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: input.model,
    costUsd: input.costUsd,
    edited: input.edited,
    createdAt: input.createdAt,
  });
}

interface ReuseLookupInput {
  readonly ownerId: UserId;
  readonly subjectCharacterId: CharacterId;
  readonly mode: PromptTemplateMode;
  readonly identityHash: string;
}

/** B2 reuse lookup (doc 03 §4.4): the images of the NEWEST generation matching the owner + subject + mode +
 *  identityHash tuple. Returns EVERY row of that generation (an n=4 call → 4 rows) so a fanned-out prior
 *  generation replays all its images; an empty array on no match. Owner-scoped through the `assets` join. */
export async function findReusableGeneration(db: Db, input: ReuseLookupInput): Promise<ReuseRow[]> {
  const rows = await db
    .select({
      generationId: imageryGenerations.id,
      assetId: imageryGenerations.assetId,
      prompt: imageryGenerations.prompt,
      model: imageryGenerations.model,
      createdAt: imageryGenerations.createdAt,
    })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .where(
      and(
        eq(assets.ownerId, input.ownerId),
        eq(imageryGenerations.subjectCharacterId, input.subjectCharacterId),
        eq(imageryGenerations.mode, input.mode),
        eq(imageryGenerations.identityHash, input.identityHash),
      ),
    )
    .orderBy(desc(imageryGenerations.createdAt));
  const newest = rows[0];
  if (newest === undefined) {
    return [];
  }
  // A generation writes all its images under ONE `createdAt` (the verb captures the clock once) — the leading
  // equal-`createdAt` run is exactly that generation's image set; newer generations sort ahead.
  return rows
    .filter((row) => row.createdAt === newest.createdAt)
    .map((row) => ({ generationId: row.generationId, assetId: row.assetId, prompt: row.prompt, model: row.model }));
}

/** Read one generated image's provenance by asset, owner-scoped through the `assets` join (doc 04 §3).
 *  `null` when the asset has no provenance row or isn't the caller's (no foreign-existence leak). */
export async function readProvenanceByAsset(db: Db, ownerId: UserId, assetId: AssetId): Promise<GenerationProvenance | null> {
  const rows = await db
    .select({
      generationId: imageryGenerations.id,
      assetId: imageryGenerations.assetId,
      mode: imageryGenerations.mode,
      prompt: imageryGenerations.prompt,
      negativePrompt: imageryGenerations.negativePrompt,
      model: imageryGenerations.model,
      costUsd: imageryGenerations.costUsd,
      subjectCharacterId: imageryGenerations.subjectCharacterId,
      identityHash: imageryGenerations.identityHash,
      edited: imageryGenerations.edited,
      createdAt: imageryGenerations.createdAt,
    })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .where(and(eq(imageryGenerations.assetId, assetId), eq(assets.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}
