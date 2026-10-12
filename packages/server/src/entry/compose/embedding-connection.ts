// The embeddings domain's connection resolve: the owner's bound encoder, frozen into the credential-free snapshot
// a generation is minted from and embeds through. Kept apart from the keystone so the embeddings suites run this
// exact resolve instead of copies.

import type { Principal } from "@orb/contracts/identity";
import type { EmbedResult } from "@orb/contracts/providers";
import type { InferenceRuntime, Resolved } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { EmbeddingConnectionSnapshot, ResolveEmbeddingConnection } from "#domain/embeddings";

function isResolvedTask<T extends Resolved["task"]>(candidate: Resolved, task: T): candidate is Resolved<T> {
  return candidate.task === task;
}

/**
 * An EXPLICIT `connectionId` that no longer resolves answers `null` (the generation's own connection is gone); an
 * implicit resolve rethrows, because "no binding" is the caller's typed refusal to surface, never a silent null.
 */
export function createResolveEmbeddingConnection(
  runtime: Pick<InferenceRuntime, "resolve" | "funnel" | "executor">,
  principalOf: (userId: UserId) => Promise<Principal>,
): ResolveEmbeddingConnection {
  // The funnel turns the caller's knobs into the wire's: dimensions, input type and instruction.
  const executeEmbed = (
    encoderConnection: Resolved<"embed">,
    input: string | readonly string[],
    opts?: Parameters<EmbeddingConnectionSnapshot["embed"]>[1],
  ): Promise<EmbedResult> => {
    if (encoderConnection.capability.kind !== "embedding") {
      throw new Error("text embed connection has a non-embedding capability");
    }
    const knobs = runtime.funnel.embed(opts ?? {}, encoderConnection.capability.embedding);
    return runtime.executor.embed({
      connection: encoderConnection,
      input,
      ...(knobs.dimensions === undefined ? {} : { dimensions: knobs.dimensions }),
      ...(knobs.inputType === undefined ? {} : { inputType: knobs.inputType }),
      ...(knobs.instruction === undefined ? {} : { instruction: knobs.instruction }),
      ...(opts?.signal === undefined ? {} : { signal: opts.signal }),
    });
  };
  const snapshotOf = (generationConnection: Resolved): EmbeddingConnectionSnapshot => ({
    connectionId: generationConnection.connectionId,
    providerId: generationConnection.providerId,
    model: generationConnection.model,
    capability: generationConnection.capability,
    api: generationConnection.api ?? "none",
    wire: generationConnection.wire,
    baseUrl: generationConnection.baseUrl,
    features: generationConnection.features,
    extras: generationConnection.extras,
    transport: generationConnection.transport,
    embed: (input, opts): ReturnType<EmbeddingConnectionSnapshot["embed"]> => {
      if (!isResolvedTask(generationConnection, "embed") || generationConnection.capability.kind !== "embedding") {
        throw new Error("generation is not a text embed connection");
      }
      return executeEmbed(generationConnection, input, opts);
    },
    imageEmbed: (input, opts): ReturnType<EmbeddingConnectionSnapshot["imageEmbed"]> => {
      if (!isResolvedTask(generationConnection, "imageEmbed")) {
        throw new Error("generation is not an image embed connection");
      }
      return runtime.executor.imageEmbed({ connection: generationConnection, input, ...(opts?.signal === undefined ? {} : { signal: opts.signal }) });
    },
  });
  return async (ownerId, task, connectionId, opts) => {
    const principal = await principalOf(ownerId);
    let outcome: Awaited<ReturnType<typeof runtime.resolve>>;
    try {
      outcome = await runtime.resolve({
        task,
        principal,
        ...(connectionId === undefined ? {} : { connectionId }),
        ...(opts?.cachedFacts === true ? { cachedFacts: true } : {}),
      });
    } catch (error) {
      if (connectionId === undefined) {
        throw error;
      }
      return null;
    }
    return snapshotOf(outcome.resolved);
  };
}
