// domain/embeddings — COMPOSITION ROOT: wires the three verbs over the DI bundle (zero logic). The
// `EmbeddingsContext` is assembled at the entry root (db + the bound `roleClients` + the injected clock/id
// determinism seam) and passed in; the indexer is a separate subsystem wired via `createEmbeddingsIndexer`.

import type { EmbeddingsContext, EmbeddingsService } from "./contract/service";
import { createClearTable } from "./verbs/clear-table";
import { createStore } from "./verbs/store";
import { createWriteHubScores } from "./verbs/write-hub-scores";

export function createEmbeddingsService(ctx: EmbeddingsContext): EmbeddingsService {
  return {
    store: createStore(ctx),
    writeHubScores: createWriteHubScores(ctx),
    clearTable: createClearTable(ctx),
  };
}
