// Durable candidate receipts and atomic generation promotion.

import type { VectorScope } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characters,
  chatDigests,
  chatParticipants,
  chatSegments,
  documentChunks,
  documents,
  embedGenerationTargets,
  embedSpaceState,
  imageEmbeddings,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { GenerationReceipt, GenerationTask } from "../contract/generation.ts";

function taskOf(scope: VectorScope): GenerationTask {
  return scope === "images" ? "imageEmbed" : "embed";
}

function guard(ownerId: UserId, generation: GenerationReceipt): ReturnType<typeof sql> {
  const scopes = VECTOR_SCOPES_BY_TASK[generation.task];
  return sql`exists (
    select 1 from embed_generation_targets t
    where t.owner_id = ${ownerId} and t.task = ${generation.task}
      and t.generation_id = ${generation.id} and t.epoch = ${generation.epoch}
      and (select count(*) from embed_space_state s
        where s.owner_id = ${ownerId} and s.scope in (${sql.join(
          scopes.map((scope) => sql`${scope}`),
          sql`, `,
        )})
          and s.candidate_generation_id = ${generation.id} and s.candidate_epoch = ${generation.epoch}) = ${scopes.length}
  )`;
}

function retiredVectorStatements(db: Db, ownerId: UserId, generation: GenerationReceipt, promotionGuard: ReturnType<typeof sql>): BatchStmt[] {
  if (generation.task === "imageEmbed") {
    const owned = db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, ownerId));
    return [
      batchStmt(
        db.delete(imageEmbeddings).where(and(inArray(imageEmbeddings.assetId, owned), ne(imageEmbeddings.generationId, generation.id), promotionGuard)),
      ),
    ];
  }
  const ownedCharacters = db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId));
  const hostedChats = db
    .select({ id: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, ownerId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)));
  const ownedDocuments = db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, ownerId));
  return [
    batchStmt(
      db
        .delete(characterEmbeddings)
        .where(and(inArray(characterEmbeddings.characterId, ownedCharacters), ne(characterEmbeddings.generationId, generation.id), promotionGuard)),
    ),
    batchStmt(db.delete(chatSegments).where(and(inArray(chatSegments.chatId, hostedChats), ne(chatSegments.generationId, generation.id), promotionGuard))),
    batchStmt(db.delete(chatDigests).where(and(inArray(chatDigests.chatId, hostedChats), ne(chatDigests.generationId, generation.id), promotionGuard))),
    batchStmt(
      db.delete(documentChunks).where(and(inArray(documentChunks.documentId, ownedDocuments), ne(documentChunks.generationId, generation.id), promotionGuard)),
    ),
  ];
}

/** Record one successful scope and atomically promote+purge when every required scope proves this target. */
export async function markGenerationComplete(
  db: Db,
  input: { readonly ownerId: UserId; readonly scope: VectorScope; readonly generation: GenerationReceipt; readonly now: number },
): Promise<boolean> {
  if (taskOf(input.scope) !== input.generation.task) {
    throw new Error(`scope ${input.scope} does not belong to ${input.generation.task}`);
  }
  const target = await db
    .select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch })
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, input.ownerId), eq(embedGenerationTargets.task, input.generation.task)))
    .limit(1);
  const currentTarget = target[0];
  if (currentTarget === undefined || currentTarget.generationId !== input.generation.id || currentTarget.epoch !== input.generation.epoch) {
    return false;
  }

  await db
    .insert(embedSpaceState)
    .select(
      db
        .select({
          ownerId: embedGenerationTargets.ownerId,
          scope: sql<VectorScope>`${input.scope}`.as("scope"),
          activeGenerationId: sql<string | null>`null`.as("active_generation_id"),
          candidateGenerationId: embedGenerationTargets.generationId,
          candidateEpoch: embedGenerationTargets.epoch,
          completedAt: sql<number>`${input.now}`.as("completed_at"),
        })
        .from(embedGenerationTargets)
        .where(
          and(
            eq(embedGenerationTargets.ownerId, input.ownerId),
            eq(embedGenerationTargets.task, input.generation.task),
            eq(embedGenerationTargets.generationId, input.generation.id),
            eq(embedGenerationTargets.epoch, input.generation.epoch),
          ),
        ),
    )
    .onConflictDoUpdate({
      target: [embedSpaceState.ownerId, embedSpaceState.scope],
      set: { candidateGenerationId: input.generation.id, candidateEpoch: input.generation.epoch, completedAt: input.now },
    });

  const rows = await db
    .select({ scope: embedSpaceState.scope, generationId: embedSpaceState.candidateGenerationId, epoch: embedSpaceState.candidateEpoch })
    .from(embedSpaceState)
    .where(eq(embedSpaceState.ownerId, input.ownerId));
  const required = VECTOR_SCOPES_BY_TASK[input.generation.task];
  if (!required.every((scope) => rows.some((row) => row.scope === scope && row.generationId === input.generation.id && row.epoch === input.generation.epoch))) {
    return false;
  }

  const promotionGuard = guard(input.ownerId, input.generation);
  const statements: BatchStmt[] = retiredVectorStatements(db, input.ownerId, input.generation, promotionGuard);
  statements.push(
    batchStmt(
      db
        .update(embedSpaceState)
        .set({ activeGenerationId: input.generation.id, candidateGenerationId: null, candidateEpoch: null, completedAt: input.now })
        .where(and(eq(embedSpaceState.ownerId, input.ownerId), inArray(embedSpaceState.scope, [...required]), promotionGuard)),
    ),
  );
  await db.batch(batchMany(statements));
  return true;
}

/** Every logical row present in an older generation has a replacement in this generation. */
