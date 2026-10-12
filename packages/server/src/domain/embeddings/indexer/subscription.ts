// The subscription reads live config so an admin can toggle indexing without rebuilding the graph.

import type { EmbeddingsIndexerSubscription, EmbeddingsIndexerSubscriptionDeps } from "../contract/service.ts";

function assertNeverEvent(event: never): never {
  throw new Error(`unhandled domain event: ${JSON.stringify(event)}`);
}

/** Route only embeddable canon events, preserving exhaustive handling of the closed event union. */
export function createEmbeddingsIndexerSubscription(deps: EmbeddingsIndexerSubscriptionDeps): EmbeddingsIndexerSubscription {
  return (event) => {
    if (deps.getEffectiveConfig().corpusAutoindex !== true) {
      return Promise.resolve();
    }
    switch (event.type) {
      case "character.updated":
        return deps.indexer.onCharacterUpdated(event);
      case "asset.created":
        return deps.indexer.onAssetCreated(event);
      case "persona.updated":
      case "world-info.updated":
        return Promise.resolve();
      default:
        return assertNeverEvent(event);
    }
  };
}
