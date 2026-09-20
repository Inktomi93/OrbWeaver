// Immutable encoder generations and the authoritative per-owner migration target.

import type { VectorScope } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { connectionFingerprint, generationIdOf, vectorSpaceFingerprint } from "#kit/embedding-generation";
import type { GenerationTask } from "../contract/generation.ts";
import type { EmbeddingsContext, PinnedGeneration } from "../contract/service.ts";

export async function resolveTargetGeneration(
  ctx: Pick<EmbeddingsContext, "db" | "now" | "resolveEmbeddingConnection">,
  ownerId: UserId,
  task: GenerationTask,
  via: GenerationTask = task,
): Promise<PinnedGeneration | null> {
  return await resolveTargetGenerationAttempt({ ctx, ownerId, task, via, attempt: 0 });
}

interface ResolveAttempt {
  readonly ctx: Pick<EmbeddingsContext, "db" | "now" | "resolveEmbeddingConnection">;
  readonly ownerId: UserId;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly attempt: number;
}

async function resolveTargetGenerationAttempt({ ctx, ownerId, task, via, attempt }: ResolveAttempt): Promise<PinnedGeneration | null> {
  const observed = await ctx.db
    .select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch })
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, ownerId), eq(embedGenerationTargets.task, task)))
    .limit(1);
  let connection = await ctx.resolveEmbeddingConnection(ownerId, via);
  if (connection === null) {
    return null;
  }
  // Resolution can span provider/catalog work. Re-read once before authorizing a target transition so an
  // older slow resolver cannot land after a newer binding and reset the target backwards.
  const current = await ctx.resolveEmbeddingConnection(ownerId, via);
  if (current === null) {
    return null;
  }
  if (connection.connectionId !== current.connectionId || connectionFingerprint(connection) !== connectionFingerprint(current)) {
    connection = current;
  }
  const fingerprint = vectorSpaceFingerprint(connection);
  const space = embedSpaceOf(connection.model, embedDtypeOf(connection.capability));
  const id = generationIdOf({ ownerId, task, via, connection, space });
  const now = ctx.now();
  await ctx.db
    .insert(embedGenerations)
    .values({ id, ownerId, task, via, connectionId: connection.connectionId, connectionRef: connection.connectionId, fingerprint, space, createdAt: now })
    .onConflictDoNothing();
  const prior = observed[0];
  if (prior === undefined) {
    await ctx.db.insert(embedGenerationTargets).values({ ownerId, task, generationId: id, epoch: 1, updatedAt: now }).onConflictDoNothing();
  } else {
    await ctx.db
      .update(embedGenerationTargets)
      .set({
        generationId: id,
        epoch: prior.generationId === id ? prior.epoch : prior.epoch + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(embedGenerationTargets.ownerId, ownerId),
          eq(embedGenerationTargets.task, task),
          eq(embedGenerationTargets.generationId, prior.generationId),
          eq(embedGenerationTargets.epoch, prior.epoch),
        ),
      );
  }
  const rows = await ctx.db
    .select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch })
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, ownerId), eq(embedGenerationTargets.task, task)))
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.generationId !== id) {
    if (attempt === 0) {
      return await resolveTargetGenerationAttempt({ ctx, ownerId, task, via, attempt: 1 });
    }
    throw new Error("embedding generation target kept changing while the sweep was starting");
  }
  return { id, task, via, epoch: row.epoch, space, connection };
}

export function scopesFor(task: GenerationTask): readonly VectorScope[] {
  return VECTOR_SCOPES_BY_TASK[task];
}
