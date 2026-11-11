// verb: syncTargetGenerations — move an owner's stored targets to what their vector bindings resolve to now. The
// stored target, not the previous binding, is what a re-point is measured against: re-binding the encoder the
// target already names moves nothing, and a move queues its rebuild through the resolver's own trigger.

import type { EmbeddingTask, EmbedMoveRefusal, PreviewTargetMoveOp } from "@orb/contracts/embeddings";
import type { EmbedTargetRefusal, UserConnection } from "@orb/contracts/inference";
import { ProviderError } from "@orb/inference";
import type { EmbedGenerationId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { isUnresolvableBinding } from "#primitives/embedding-generation";
import { EmbedFailedError } from "../contract/errors.ts";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service.ts";
import { landProvenTarget, pendingTargetMove, probeWidth, widthMismatchOf } from "../substrate/generation.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";

/** One target the sync may move: its task, and the role its vectors are embedded through. */
interface SyncTarget {
  readonly task: EmbeddingTask;
  readonly via: EmbeddingTask;
}

type Proof =
  | { readonly kind: "move"; readonly generationId: EmbedGenerationId }
  | { readonly kind: "skip" | "unresolved" }
  | { readonly kind: "refused"; readonly refusal: EmbedTargetRefusal };

/**
 * Probe one target's move before anything moves. A width the encoder does not make is the refusal the waiting write
 * reports, and so is an embedder that does not answer or refuses the row's key: an unchecked width is never accepted. An unresolvable binding
 * skips the target (its first write after it can resolve moves it).
 */
async function prove(ctx: EmbeddingsContext, ownerId: UserId, target: SyncTarget, previewConnection?: UserConnection): Promise<Proof> {
  let truncatable = false;
  let assumed = false;
  try {
    const move = await pendingTargetMove(ctx, { ownerId, ...target, previewConnection });
    if (!move.moves) {
      return { kind: "skip" };
    }
    const { capability } = move.connection;
    truncatable = capability.kind === "embedding" && capability.embedding.mrl;
    assumed = capability.kind === "embedding" && capability.embedding.dimsEstimated === true;
    await probeWidth(ctx, move.connection, target.via, move.dims);
    return { kind: "move", generationId: move.id };
  } catch (error) {
    const width = widthMismatchOf(error);
    if (width !== null) {
      return { kind: "refused", refusal: { kind: "width", ...width, truncatable, assumed } };
    }
    if (isUnresolvableBinding(error)) {
      return { kind: "unresolved" };
    }
    const refusal = probeRefusal(ctx, error, { ownerId, task: target.task });
    if (refusal === null) {
      throw error;
    }
    return { kind: "refused", refusal };
  }
}

/** The refusal a failed width probe becomes, or `null` for a failure that is not the probe's answer. The provider's
 *  own failure is logged here; the probe's empty answer is already on record (`embedFailure` logged it where it was
 *  thrown). */
function probeRefusal(ctx: EmbeddingsContext, error: unknown, scope: { readonly ownerId: UserId; readonly task: EmbeddingTask }): EmbedTargetRefusal | null {
  if (error instanceof EmbedFailedError) {
    return { kind: "unreachable" };
  }
  if (!(error instanceof ProviderError)) {
    return null;
  }
  if (error.kind === "auth_failed") {
    getLog(ctx.logger).warn({ err: error, ...scope }, "embeddings: a re-point's width probe was refused its key; the write is refused");
    return { kind: "auth" };
  }
  getLog(ctx.logger).warn({ err: error, ...scope }, "embeddings: a re-point's width probe got no answer; the write is refused");
  return { kind: "unreachable" };
}

export function createPreviewTargetMove(ctx: EmbeddingsContext): PreviewTargetMoveOp {
  return async ({ ownerId, task, via, connection }) => await prove(ctx, ownerId, { task, via }, connection);
}

export function createSyncTargetGenerations(ctx: EmbeddingsContext): EmbeddingsService["syncTargetGenerations"] {
  return async (ownerId: UserId): Promise<EmbedMoveRefusal | null> => {
    const image = await resolveImageSpace(ctx, ownerId).catch((error: unknown) => {
      if (isUnresolvableBinding(error)) {
        return null;
      }
      throw error;
    });
    const targets: SyncTarget[] = [{ task: "embed", via: "embed" }, ...(image === null ? [] : [{ task: "imageEmbed" as const, via: image.via }])];
    // Every move is proved before any is made: a switch purges the old index, so a refusal must find both untouched.
    const proofs: { readonly target: SyncTarget; readonly proof: Proof }[] = [];
    for (const target of targets) {
      const proof = await prove(ctx, ownerId, target);
      if (proof.kind === "refused") {
        return { ...proof.refusal, task: target.task };
      }
      proofs.push({ target, proof });
    }
    // Each move lands the generation its proof probed, without probing again.
    for (const { target, proof } of proofs) {
      if (proof.kind === "move") {
        await landProvenTarget(ctx, ownerId, target, proof.generationId);
      }
    }
    return null;
  };
}
