// verb: syncTargetGenerations — move an owner's stored targets to what their vector bindings resolve to now. The
// stored target, not the previous binding, is what a re-point is measured against: re-binding the encoder the
// target already names moves nothing, and a move queues its rebuild through the resolver's own trigger.

import { NoConnectionError, ProviderError } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { EmbedGenerationId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { EmbeddingsContext } from "../context.ts";
import { EmbedFailedError } from "../contract/errors.ts";
import type { EmbedMoveRefusal, GenerationTask } from "../contract/generation.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { landProvenTarget, pendingTargetMove, probeWidth, widthMismatchOf } from "../substrate/generation.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";

/** A binding that cannot resolve yet: a revoked or missing key, or no usable connection. Its first write after it
 *  can resolve moves the target and owns the failure, so the sync leaves it alone. */
function bindingUnresolvable(error: unknown): boolean {
  return error instanceof DomainNoCredentialError || error instanceof NoConnectionError;
}

/** One target the sync may move: its task, and the role its vectors are embedded through. */
interface SyncTarget {
  readonly task: GenerationTask;
  readonly via: GenerationTask;
}

type Proof =
  | { readonly kind: "move"; readonly generationId: EmbedGenerationId }
  | { readonly kind: "skip" }
  | { readonly kind: "refused"; readonly refusal: EmbedMoveRefusal };

/**
 * Probe one target's move before anything moves. A width the encoder does not make is the refusal the waiting write
 * reports, and so is an embedder that does not answer or refuses the row's key: an unchecked width is never accepted. An unresolvable binding
 * skips the target (its first write after it can resolve moves it).
 */
async function prove(ctx: EmbeddingsContext, ownerId: UserId, target: SyncTarget): Promise<Proof> {
  let truncatable = false;
  let assumed = false;
  try {
    const move = await pendingTargetMove(ctx, { ownerId, task: target.task, via: target.via });
    if (move?.moves !== true) {
      return { kind: "skip" };
    }
    const { capability } = move.connection;
    truncatable = capability.kind === "embedding" && capability.embedding.mrl;
    assumed = capability.kind === "embedding" && capability.embedding.dimsEstimated === true;
    await probeWidth(move.connection, target.via, move.dims);
    return { kind: "move", generationId: move.id };
  } catch (error) {
    const width = widthMismatchOf(error);
    if (width !== null) {
      return { kind: "refused", refusal: { kind: "width", task: target.task, ...width, truncatable, assumed } };
    }
    if (bindingUnresolvable(error)) {
      return { kind: "skip" };
    }
    if (error instanceof ProviderError && error.kind === "auth_failed") {
      getLog().warn({ err: error, ownerId, task: target.task }, "embeddings: a re-point's width probe was refused its key; the write is refused");
      return { kind: "refused", refusal: { kind: "auth", task: target.task } };
    }
    if (error instanceof ProviderError || error instanceof EmbedFailedError) {
      getLog().warn({ err: error, ownerId, task: target.task }, "embeddings: a re-point's width probe got no answer; the write is refused");
      return { kind: "refused", refusal: { kind: "unreachable", task: target.task } };
    }
    throw error;
  }
}

export function createSyncTargetGenerations(ctx: EmbeddingsContext): EmbeddingsService["syncTargetGenerations"] {
  return async (ownerId: UserId): Promise<EmbedMoveRefusal | null> => {
    const image = await resolveImageSpace(ctx, ownerId).catch((error: unknown) => {
      if (bindingUnresolvable(error)) {
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
        return proof.refusal;
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
