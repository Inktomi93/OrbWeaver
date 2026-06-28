// domain/embeddings/indexer — the NAMED SUBSYSTEM front door: the factory that binds the event handlers over
// the injected indexer bundle. Wired at `entry/` onto the in-process domain-event bus (`character.updated` →
// onCharacterUpdated, `asset.created` → onAssetCreated). Exports only the factory (a function) — the
// `EmbeddingsIndexer` / `EmbeddingsIndexerContext` TYPES live in `contract/` (no-inline-types).

import type { EmbeddingsIndexer, EmbeddingsIndexerContext } from "../contract/service";
import { onAssetCreated, onCharacterUpdated } from "./handlers";

export function createEmbeddingsIndexer(ctx: EmbeddingsIndexerContext): EmbeddingsIndexer {
  return {
    onCharacterUpdated: (event) => onCharacterUpdated(ctx, event),
    onAssetCreated: (event) => onAssetCreated(ctx, event),
  };
}
