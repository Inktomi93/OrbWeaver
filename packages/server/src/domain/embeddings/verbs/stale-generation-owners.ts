// verb: staleGenerationOwners — the owners whose stored target generation is no longer the one their binding
// resolves to now. A user's own embedder change raises the re-index trigger at the write; this read catches the
// change no user made, such as a release that moves generation identity, so boot can re-index those owners.

import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";
import { generationIdOf } from "#kit/embedding-generation";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbeddingConnectionSnapshot, EmbeddingsService } from "../contract/service.ts";
import { readGenerationTargets } from "../persistence/space-state.ts";

async function currentConnection(ctx: EmbeddingsContext, ownerId: UserId, via: "embed" | "imageEmbed"): Promise<EmbeddingConnectionSnapshot | null> {
  // @orb-waive caught-failure-ownership(catch): an owner whose binding cannot resolve at boot has nothing a re-index could embed with; their next store or sweep raises the same failure where it is owned. Ends if this read ever gates a write.
  try {
    return await ctx.resolveEmbeddingConnection(ownerId, via);
  } catch {
    return null;
  }
}

export function createStaleGenerationOwners(ctx: EmbeddingsContext): EmbeddingsService["staleGenerationOwners"] {
  return async (): Promise<readonly UserId[]> => {
    const stale: UserId[] = [];
    for (const target of await readGenerationTargets(ctx.db)) {
      if (stale.includes(target.ownerId)) {
        continue;
      }
      const connection = await currentConnection(ctx, target.ownerId, target.via);
      if (connection === null) {
        continue;
      }
      const space = embedSpaceOf(connection.model, embedDtypeOf(connection.capability));
      if (generationIdOf({ ownerId: target.ownerId, task: target.task, via: target.via, connection, space }) !== target.generationId) {
        stale.push(target.ownerId);
      }
    }
    return stale;
  };
}
