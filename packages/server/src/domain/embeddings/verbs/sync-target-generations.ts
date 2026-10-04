// verb: syncTargetGenerations — move an owner's stored targets to what their vector bindings resolve to now. The
// stored target, not the previous binding, is what a re-point is measured against: re-binding the encoder the
// target already names moves nothing, and a move queues its rebuild through the resolver's own trigger.

import { NoConnectionError, ProviderError } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedWidthRefusal, GenerationTask } from "../contract/generation.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { pendingTargetMove, probeWidth, resolveTargetGeneration, widthMismatchOf } from "../substrate/generation.ts";
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

type Proof = { readonly kind: "move" } | { readonly kind: "skip" } | { readonly kind: "refused"; readonly refusal: EmbedWidthRefusal };

/**
 * Probe one target's move before anything moves. A width the encoder does not make is the refusal the waiting write
 * reports. An unresolvable binding skips the target (its first write after it can resolve moves it). An embedder that
 * does not answer also skips it: the next write that embeds through the binding re-runs the move and owns that failure.
 */
async function prove(ctx: EmbeddingsContext, ownerId: UserId, target: SyncTarget): Promise<Proof> {
  try {
    const move = await pendingTargetMove(ctx, { ownerId, task: target.task, via: target.via });
    if (move?.moves !== true) {
      return { kind: "skip" };
    }
    await probeWidth(move.connection, target.via, move.dims);
    return { kind: "move" };
  } catch (error) {
    const width = widthMismatchOf(error);
    if (width !== null) {
      return { kind: "refused", refusal: { task: target.task, ...width } };
    }
    if (bindingUnresolvable(error)) {
      return { kind: "skip" };
    }
    if (error instanceof ProviderError) {
      getLog().warn({ err: error, ownerId, task: target.task }, "embeddings: a re-point's width probe failed; the next write retries the move");
      return { kind: "skip" };
    }
    throw error;
  }
}

export function createSyncTargetGenerations(ctx: EmbeddingsContext): EmbeddingsService["syncTargetGenerations"] {
  return async (ownerId: UserId): Promise<EmbedWidthRefusal | null> => {
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
    for (const { target, proof } of proofs) {
      if (proof.kind === "move") {
        await resolveTargetGeneration(ctx, ownerId, target.task, target.via);
      }
    }
    return null;
  };
}
