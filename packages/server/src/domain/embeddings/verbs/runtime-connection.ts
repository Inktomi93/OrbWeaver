// The embeddings domain's connection resolve: the owner's bound encoder, frozen into the credential-free snapshot
// a generation is minted from and embeds through. Kept apart from the keystone so the embeddings suites run this
// exact resolve instead of copies.

import type { Principal } from "@orb/contracts/identity";
import { ENCODER_IDENTITY_NO_API } from "@orb/contracts/inference";
import type { EmbedResult } from "@orb/contracts/providers";
import type { ImageEmbedInput } from "@orb/contracts/role-clients";
import type { Resolved } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { EmbeddingRuntime } from "../contract/runtime-connection.ts";
import type { EmbeddingConnectionSnapshot, ResolveEmbeddingConnection } from "../contract/service.ts";

function isResolvedTask<T extends Resolved["task"]>(candidate: Resolved, task: T): candidate is Resolved<T> {
  return candidate.task === task;
}

/**
 * An EXPLICIT `connectionId` that no longer resolves answers `null` (the generation's own connection is gone); an
 * implicit resolve rethrows, because "no binding" is the caller's typed refusal to surface, never a silent null.
 */
export function createResolveEmbeddingConnection(runtime: EmbeddingRuntime, principalOf: (userId: UserId) => Promise<Principal>): ResolveEmbeddingConnection {
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
  // A stated instruction replaces the wire's cookbook default, so the capability gate has to run on this path too.
  const honouredImageInput = (input: ImageEmbedInput, connection: Resolved): ImageEmbedInput =>
    input.instruction === undefined || connection.capability.kind !== "embedding"
      ? input
      : { ...input, instruction: runtime.funnel.embed({ instruction: input.instruction }, connection.capability.embedding).instruction };
  const snapshotOf = (generationConnection: Resolved): EmbeddingConnectionSnapshot => ({
    connectionId: generationConnection.connectionId,
    providerId: generationConnection.providerId,
    model: generationConnection.model,
    capability: generationConnection.capability,
    api: generationConnection.api ?? ENCODER_IDENTITY_NO_API,
    wire: generationConnection.wire,
    baseUrl: generationConnection.baseUrl,
    features: generationConnection.features,
    extras: generationConnection.extras,
    transport: generationConnection.transport,
    execution: runtime.embeddingExecution(generationConnection),
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
      return runtime.executor.imageEmbed({
        connection: generationConnection,
        input: honouredImageInput(input, generationConnection),
        ...(opts?.signal === undefined ? {} : { signal: opts.signal }),
      });
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
        ...(opts?.previewConnection === undefined ? {} : { previewConnection: opts.previewConnection }),
        ...(opts?.cachedFacts === true ? { cachedFacts: true } : {}),
      });
    } catch (error) {
      if (connectionId === undefined || opts?.previewConnection !== undefined) {
        throw error;
      }
      return null;
    }
    return snapshotOf(outcome.resolved);
  };
}
