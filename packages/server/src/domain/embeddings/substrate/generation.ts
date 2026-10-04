// Immutable encoder generations and the authoritative per-owner migration target.

import { embedDimsOf, embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { connectionFingerprint, generationIdOf, vectorSpaceFingerprint } from "#kit/embedding-generation";
import { EmbedFailedError, SpaceMismatchError } from "../contract/errors.ts";
import type { GenerationTask } from "../contract/generation.ts";
import type { EmbeddingConnectionSnapshot, EmbeddingsContext, PinnedGeneration } from "../contract/service.ts";
import { switchTargetGeneration } from "../persistence/space-state.ts";

type TargetResolveCtx = Pick<EmbeddingsContext, "db" | "now" | "resolveEmbeddingConnection" | "onTargetGenerationMoved">;

export async function resolveTargetGeneration(
  ctx: TargetResolveCtx,
  ownerId: UserId,
  task: GenerationTask,
  via: GenerationTask = task,
): Promise<PinnedGeneration | null> {
  return await resolveTargetGenerationAttempt({ ctx, ownerId, task, via, attempt: 0 });
}

const PROBE_TEXT = "width check";

/** One embed through the new connection: the vector must be as wide as the space it would be written into. */
async function probeWidth(connection: EmbeddingConnectionSnapshot, via: GenerationTask, dims: number): Promise<void> {
  const result = via === "embed" ? await connection.embed(PROBE_TEXT) : await connection.imageEmbed({ kind: "text", input: PROBE_TEXT });
  const vector = result.vectors[0];
  if (vector === null || vector === undefined) {
    throw new EmbedFailedError("width probe", result.model);
  }
  if (vector.length !== dims) {
    throw new SpaceMismatchError(result.model, dims, vector.length);
  }
}

interface ResolveAttempt {
  readonly ctx: TargetResolveCtx;
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
  const dims = embedDimsOf(connection.capability);
  if (dims === undefined) {
    throw new Error(`the ${via} connection for an embedding generation resolved to a ${connection.capability.kind} model`);
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
    await ctx.db.insert(embedGenerationTargets).values({ ownerId, task, generationId: id, epoch: 1 }).onConflictDoNothing();
  } else if (prior.generationId !== id) {
    // A new generation never shares the index with the old one: the switch purges the old vectors with it. So
    // prove the new space can be written first; a width the embedder does not make keeps the old index.
    await probeWidth(connection, via, dims);
    // The switch emptied the old index; whoever moved it owes the owner the sweep that refills it, whatever the
    // caller was (a write, a sweep, a sync after a re-point).
    if (await switchTargetGeneration(ctx.db, { ownerId, task, from: prior, to: id })) {
      ctx.onTargetGenerationMoved(ownerId);
    }
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
  return { id, task, via, epoch: row.epoch, space, connection, dims };
}
