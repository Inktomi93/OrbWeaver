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
  embedGenerations,
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

/** Deletes for every vector of the owner's `task` scopes that is not in generation `keep`, each behind `onlyIf`. */
interface RetireScope {
  readonly ownerId: UserId;
  readonly task: GenerationTask;
  readonly keep: GenerationReceipt["id"];
  readonly onlyIf: ReturnType<typeof sql>;
}

function retiredVectorStatements(db: Db, { ownerId, task, keep, onlyIf }: RetireScope): BatchStmt[] {
  if (task === "imageEmbed") {
    const owned = db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, ownerId));
    return [batchStmt(db.delete(imageEmbeddings).where(and(inArray(imageEmbeddings.assetId, owned), ne(imageEmbeddings.generationId, keep), onlyIf)))];
  }
  const ownedCharacters = db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId));
  const hostedChats = db
    .select({ id: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, ownerId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)));
  const ownedDocuments = db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, ownerId));
  return [
    batchStmt(
      db.delete(characterEmbeddings).where(and(inArray(characterEmbeddings.characterId, ownedCharacters), ne(characterEmbeddings.generationId, keep), onlyIf)),
    ),
    batchStmt(db.delete(chatSegments).where(and(inArray(chatSegments.chatId, hostedChats), ne(chatSegments.generationId, keep), onlyIf))),
    batchStmt(db.delete(chatDigests).where(and(inArray(chatDigests.chatId, hostedChats), ne(chatDigests.generationId, keep), onlyIf))),
    batchStmt(db.delete(documentChunks).where(and(inArray(documentChunks.documentId, ownedDocuments), ne(documentChunks.generationId, keep), onlyIf))),
  ];
}

/** Every owner's stored target per task, with the connection role it embeds through. */
export async function readGenerationTargets(
  db: Db,
): Promise<{ readonly ownerId: UserId; readonly task: GenerationTask; readonly via: GenerationTask; readonly generationId: GenerationReceipt["id"] }[]> {
  return await db
    .select({
      ownerId: embedGenerationTargets.ownerId,
      task: embedGenerationTargets.task,
      via: embedGenerations.via,
      generationId: embedGenerationTargets.generationId,
    })
    .from(embedGenerationTargets)
    .innerJoin(embedGenerations, eq(embedGenerations.id, embedGenerationTargets.generationId));
}

/**
 * Move an owner's target to a new generation and delete every vector of the old ones in the same batch, so
 * no index ever holds two generations. The scope rows lose their active generation too: reads refuse as
 * "re-indexing" until the sweeps promote the new one, rather than reading an emptied space. Every statement is
 * guarded on the switch having landed, so a racing writer that moved the target first deletes nothing here.
 */
export async function switchTargetGeneration(
  db: Db,
  input: {
    readonly ownerId: UserId;
    readonly task: GenerationTask;
    readonly from: { readonly generationId: GenerationReceipt["id"]; readonly epoch: number };
    readonly to: GenerationReceipt["id"];
  },
): Promise<void> {
  const { ownerId, task, from, to } = input;
  const epoch = from.epoch + 1;
  const switched = sql`exists (
    select 1 from embed_generation_targets t
    where t.owner_id = ${ownerId} and t.task = ${task} and t.generation_id = ${to} and t.epoch = ${epoch}
  )`;
  await db.batch(
    batchMany([
      batchStmt(
        db
          .update(embedGenerationTargets)
          .set({ generationId: to, epoch })
          .where(
            and(
              eq(embedGenerationTargets.ownerId, ownerId),
              eq(embedGenerationTargets.task, task),
              eq(embedGenerationTargets.generationId, from.generationId),
              eq(embedGenerationTargets.epoch, from.epoch),
            ),
          ),
      ),
      ...retiredVectorStatements(db, { ownerId, task, keep: to, onlyIf: switched }),
      batchStmt(
        db
          .update(embedSpaceState)
          .set({ activeGenerationId: null, candidateGenerationId: null, candidateEpoch: null })
          .where(and(eq(embedSpaceState.ownerId, ownerId), inArray(embedSpaceState.scope, [...VECTOR_SCOPES_BY_TASK[task]]), switched)),
      ),
    ]),
  );
}

/** Record one successful scope and atomically promote when every required scope proves this target. The
 *  promotion also deletes any old-generation row a write already in flight at the switch landed afterwards. */
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
  const statements: BatchStmt[] = retiredVectorStatements(db, {
    ownerId: input.ownerId,
    task: input.generation.task,
    keep: input.generation.id,
    onlyIf: promotionGuard,
  });
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
