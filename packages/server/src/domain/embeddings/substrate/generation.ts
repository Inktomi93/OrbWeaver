// Immutable encoder generations and the authoritative per-owner migration target.

import type { VectorScope } from "@orb/contracts/embeddings";
import { embedDimsOf, embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { VectorWidthMismatch } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import type { EmbedGenerationId, UserConnectionId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { connectionFingerprint, generationIdOf, vectorSpaceFingerprint } from "#kit/embedding-generation";
import { EmbedFailedError, SpaceMismatchError } from "../contract/errors.ts";
import type { GenerationReceipt, GenerationTask } from "../contract/generation.ts";
import type { EmbeddingConnectionSnapshot, EmbeddingsContext, PinnedGeneration } from "../contract/service.ts";
import { markGenerationComplete, switchTargetGeneration } from "../persistence/space-state.ts";

type TargetResolveCtx = Pick<EmbeddingsContext, "db" | "now" | "resolveEmbeddingConnection" | "onTargetGenerationMoved">;

/** Record one scope of `generation` complete for its owner, and announce the promotion when this completion made it. */
export async function completeGenerationScope(
  ctx: Pick<EmbeddingsContext, "db" | "now" | "onTargetPromoted">,
  input: { readonly ownerId: UserId; readonly scope: VectorScope; readonly generation: GenerationReceipt },
): Promise<void> {
  if (await markGenerationComplete(ctx.db, { ...input, now: ctx.now() })) {
    ctx.onTargetPromoted(input.ownerId);
  }
}

/** The owner's target generation for `task`, moving the stored target first when the binding now resolves elsewhere.
 *  A move probes the new width before it purges anything. */
export async function resolveTargetGeneration(
  ctx: TargetResolveCtx,
  ownerId: UserId,
  task: GenerationTask,
  via: GenerationTask = task,
): Promise<PinnedGeneration | null> {
  return await resolveTargetGenerationAttempt({ ctx, ownerId, task, via, proven: undefined, attempt: 0 });
}

/** {@link resolveTargetGeneration} for a move the caller already probed: landing `proven`, the generation that proof
 *  probed, does not probe again. */
export async function landProvenTarget(
  ctx: TargetResolveCtx,
  ownerId: UserId,
  target: { readonly task: GenerationTask; readonly via: GenerationTask },
  proven: EmbedGenerationId,
): Promise<PinnedGeneration | null> {
  return await resolveTargetGenerationAttempt({ ctx, ownerId, ...target, proven, attempt: 0 });
}

/** What the width probe embeds.
 *  @public Test-anchored module surface; the write-path tests answer this probe apart from real embeds. */
export const WIDTH_PROBE_TEXT = "width check";

/** How long a remote embedder has to answer the width probe. A write waits on the probe, so a box that has not
 *  answered in this long is asleep or gone, and the write is refused rather than left hanging.
 *  @public Test-anchored module surface; the bounded-probe tests advance a fake clock past it. */
export const WIDTH_PROBE_TIMEOUT_MS = 10_000;

/** One embed through the new connection: the vector must be as wide as the space it would be written into. One
 *  attempt, bounded by {@link WIDTH_PROBE_TIMEOUT_MS}, except on the in-process encoder: it cannot be unreachable,
 *  and its first load from cold can outlast any network bound while it is only loading. */
export async function probeWidth(connection: EmbeddingConnectionSnapshot, via: GenerationTask, dims: number): Promise<void> {
  const bound = new AbortController();
  const timer = connection.wire === "local-light" ? undefined : setTimeout(() => bound.abort(), WIDTH_PROBE_TIMEOUT_MS);
  const opts = { signal: bound.signal };
  const result = await (via === "embed"
    ? connection.embed(WIDTH_PROBE_TEXT, opts)
    : connection.imageEmbed({ kind: "text", input: WIDTH_PROBE_TEXT }, opts)
  ).finally(() => clearTimeout(timer));
  const vector = result.vectors[0];
  if (vector === null || vector === undefined) {
    throw new EmbedFailedError("width probe", result.model);
  }
  if (vector.length !== dims) {
    throw new SpaceMismatchError(result.model, dims, vector.length);
  }
}

/** The two widths a failed width probe names: a backend's fit refusal, or the probe's own length check. */
export function widthMismatchOf(error: unknown): VectorWidthMismatch | null {
  if (error instanceof SpaceMismatchError) {
    return { stated: error.expectedDim, measured: error.actualDim };
  }
  return error instanceof ProviderError && error.width !== undefined ? error.width : null;
}

interface Candidate {
  readonly id: EmbedGenerationId;
  readonly space: string;
  readonly dims: number;
}

/** The generation a resolved connection would write into. */
function candidateOf(ownerId: UserId, task: GenerationTask, via: GenerationTask, connection: EmbeddingConnectionSnapshot): Candidate {
  const dims = embedDimsOf(connection.capability);
  if (dims === undefined) {
    throw new Error(`the ${via} connection for an embedding generation resolved to a ${connection.capability.kind} model`);
  }
  const space = embedSpaceOf(connection.model, embedDtypeOf(connection.capability));
  return { id: generationIdOf({ ownerId, task, via, connection, space }), space, dims };
}

async function readTarget(
  ctx: Pick<TargetResolveCtx, "db">,
  ownerId: UserId,
  task: GenerationTask,
): Promise<{ readonly generationId: EmbedGenerationId; readonly epoch: number } | undefined> {
  const rows = await ctx.db
    .select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch })
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, ownerId), eq(embedGenerationTargets.task, task)))
    .limit(1);
  return rows[0];
}

/** THE move rule: a stored target that names another generation moves. No target yet is a creation, which purges
 *  nothing; the same generation again is no move at all. */
function movesTarget(prior: { readonly generationId: string } | undefined, id: EmbedGenerationId): boolean {
  return prior !== undefined && prior.generationId !== id;
}

/** A target move a resolve would make now, without making it. */
interface PendingTargetMove {
  readonly id: EmbedGenerationId;
  readonly moves: boolean;
  readonly connection: EmbeddingConnectionSnapshot;
  readonly dims: number;
}

/**
 * Would the owner's stored target move to what `via` resolves to now, or through `connectionId` as if it were bound?
 * Read-only. `null` when nothing resolves.
 */
export async function pendingTargetMove(
  ctx: Pick<TargetResolveCtx, "db" | "resolveEmbeddingConnection">,
  args: { readonly ownerId: UserId; readonly task: GenerationTask; readonly via: GenerationTask; readonly connectionId?: UserConnectionId | undefined },
): Promise<PendingTargetMove | null> {
  const { ownerId, task, via, connectionId } = args;
  const connection = await ctx.resolveEmbeddingConnection(ownerId, via, connectionId);
  if (connection === null) {
    return null;
  }
  const candidate = candidateOf(ownerId, task, via, connection);
  return { id: candidate.id, moves: movesTarget(await readTarget(ctx, ownerId, task), candidate.id), connection, dims: candidate.dims };
}

interface ResolveAttempt {
  readonly ctx: TargetResolveCtx;
  readonly ownerId: UserId;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly proven: EmbedGenerationId | undefined;
  readonly attempt: number;
}

/** What `via` resolves to now. Resolution can span provider/catalog work, so it is read twice and the later answer
 *  wins: an older slow resolver cannot land after a newer binding and reset the target backwards. */
async function resolveCurrentConnection(ctx: TargetResolveCtx, ownerId: UserId, via: GenerationTask): Promise<EmbeddingConnectionSnapshot | null> {
  const first = await ctx.resolveEmbeddingConnection(ownerId, via);
  if (first === null) {
    return null;
  }
  const current = await ctx.resolveEmbeddingConnection(ownerId, via);
  if (current === null) {
    return null;
  }
  return first.connectionId === current.connectionId && connectionFingerprint(first) === connectionFingerprint(current) ? first : current;
}

async function resolveTargetGenerationAttempt({ ctx, ownerId, task, via, proven, attempt }: ResolveAttempt): Promise<PinnedGeneration | null> {
  const prior = await readTarget(ctx, ownerId, task);
  const connection = await resolveCurrentConnection(ctx, ownerId, via);
  if (connection === null) {
    return null;
  }
  const { id, space, dims } = candidateOf(ownerId, task, via, connection);
  const moves = movesTarget(prior, id);
  const fingerprint = vectorSpaceFingerprint(connection);
  const now = ctx.now();
  await ctx.db
    .insert(embedGenerations)
    .values({ id, ownerId, task, via, connectionId: connection.connectionId, connectionRef: connection.connectionId, fingerprint, space, createdAt: now })
    .onConflictDoNothing();
  if (prior === undefined) {
    await ctx.db.insert(embedGenerationTargets).values({ ownerId, task, generationId: id, epoch: 1 }).onConflictDoNothing();
  } else if (moves) {
    // A new generation never shares the index with the old one: the switch purges the old vectors with it. So
    // prove the new space can be written first; a width the embedder does not make keeps the old index.
    // The owner's writes are serialized, so this resolve lands what the proof probed. Anything else (an endpoint's
    // facts re-read in between) is probed here: no purge happens on an unprobed width.
    if (proven !== id) {
      await probeWidth(connection, via, dims);
    }
    // The switch emptied the old index; whoever moved it owes the owner the sweep that refills it, whatever the
    // caller was (a write, a sweep, a sync after a re-point).
    if (await switchTargetGeneration(ctx.db, { ownerId, task, from: prior, to: id })) {
      ctx.onTargetGenerationMoved(ownerId);
    }
  }
  const row = await readTarget(ctx, ownerId, task);
  if (row === undefined || row.generationId !== id) {
    if (attempt === 0) {
      return await resolveTargetGenerationAttempt({ ctx, ownerId, task, via, proven, attempt: 1 });
    }
    throw new Error("embedding generation target kept changing while the sweep was starting");
  }
  return { id, task, via, epoch: row.epoch, space, connection, dims };
}
