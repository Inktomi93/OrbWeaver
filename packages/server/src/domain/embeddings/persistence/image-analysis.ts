// Utility annotations are asset-owned canon, not vector-generation output. The write guard proves
// immutable bytes, the expected owner, and its live generation target in the same statement as the upsert.

import type { ImageCaptionMeta } from "@orb/contracts/embeddings";
import { imageCaptionMetaSchema } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { assets, embedGenerations, imageAnalyses, imageEmbeddings } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { AssetId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { StoredImageAnalysis } from "../contract/results.ts";

interface ImageAnalysisWrite {
  readonly ownerId: UserId;
  readonly assetId: AssetId;
  readonly generationId: EmbedGenerationId;
  readonly contentHash: string;
  readonly caption: string;
  readonly captionMeta: unknown;
  readonly now: number;
}

function imageAnalysisStatement(db: Db, input: ImageAnalysisWrite): AwaitableBatchStmt<Pick<typeof imageAnalyses.$inferSelect, "revision">[]> {
  const captionMeta = imageCaptionMetaSchema.parse(input.captionMeta);
  return db
    .insert(imageAnalyses)
    .select(
      db
        .select({
          assetId: assets.id,
          contentHash: sql<string>`${input.contentHash}`.as("content_hash"),
          caption: sql<string>`${input.caption}`.as("caption"),
          revision: sql<number>`1`.as("revision"),
          captionMeta: sql<ImageCaptionMeta>`${JSON.stringify(captionMeta)}`.as("caption_meta"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(assets)
        .innerJoin(embedGenerations, and(eq(embedGenerations.id, input.generationId), eq(embedGenerations.ownerId, assets.ownerId)))
        .where(
          and(
            eq(assets.id, input.assetId),
            eq(assets.ownerId, input.ownerId),
            eq(assets.hash, input.contentHash),
            sql`length(trim(${input.caption})) > 0`,
            sql`exists (select 1 from embed_generation_targets t where t.generation_id = ${input.generationId})`,
          ),
        ),
    )
    .onConflictDoUpdate({
      target: imageAnalyses.assetId,
      set: { contentHash: input.contentHash, caption: input.caption, captionMeta, revision: sql`${imageAnalyses.revision} + 1` },
    })
    .returning({ revision: imageAnalyses.revision });
}

/** A new Utility result invalidates captioned vectors even if the following encoder call fails. */
export async function saveImageAnalysis(db: Db, input: ImageAnalysisWrite): Promise<number | undefined> {
  const annotation = imageAnalysisStatement(db, input);
  const invalidate = db.delete(imageEmbeddings).where(
    and(
      eq(imageEmbeddings.assetId, input.assetId),
      eq(imageEmbeddings.lens, "image-captioned"),
      sql`length(trim(${input.caption})) > 0`,
      sql`exists (select 1 from assets a join embed_generations g on g.owner_id = a.owner_id
      join embed_generation_targets t on t.generation_id = g.id
      where a.id = ${input.assetId} and a.owner_id = ${input.ownerId} and a.hash = ${input.contentHash} and g.id = ${input.generationId})`,
    ),
  );
  const [, accepted] = await db.batch([invalidate, annotation]);
  return accepted[0]?.revision;
}

/** Foreign assets, changed bytes, malformed metadata and provenance-only skips are not reusable. */
export async function readImageAnalysis(db: Db, ownerId: UserId, assetId: AssetId, hash: string): Promise<StoredImageAnalysis | undefined> {
  const [row] = await db
    .select({ caption: imageAnalyses.caption, captionMeta: imageAnalyses.captionMeta, revision: imageAnalyses.revision })
    .from(imageAnalyses)
    .innerJoin(assets, eq(assets.id, imageAnalyses.assetId))
    .where(and(eq(assets.ownerId, ownerId), eq(assets.id, assetId), eq(assets.hash, hash), eq(imageAnalyses.contentHash, hash)))
    .limit(1);
  if (row === undefined || row.caption.trim().length === 0) {
    return;
  }
  const parsed = imageCaptionMetaSchema.safeParse(row.captionMeta);
  if (!(parsed.success && Object.keys(parsed.data).some((key) => key !== "model"))) {
    return;
  }
  return { caption: row.caption, captionMeta: parsed.data, revision: row.revision };
}
