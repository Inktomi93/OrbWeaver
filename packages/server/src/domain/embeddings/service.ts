// domain/embeddings — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The
// `EmbeddingsContext` is assembled at the entry root (db + the bound `roleClients` + the injected clock/id
// determinism seam + the PD-53 enumeration/canon re-read ops + the declared space dims) and passed in; the
// indexer is a separate subsystem wired via `createEmbeddingsIndexer`. The PD-53 bulk passes receive the
// bound `store` verb + the indexer's caption generator as EXPLICIT deps here (domain-no-cross-verb /
// domain-substrate-mediates-subsystems — the composition point is this file, never a verb-to-verb import).

import type { EmbeddingsContext } from "./context";
import type { EmbeddingsService } from "./contract/service";
import { generateAvatarCaption } from "./indexer/caption";
import { createClearTable } from "./verbs/clear-table";
import { createEmbedAssets } from "./verbs/embed-assets";
import { createEmbedCorpus } from "./verbs/embed-corpus";
import { createStore } from "./verbs/store";
import { createWriteHubScores } from "./verbs/write-hub-scores";

export function createEmbeddingsService(ctx: EmbeddingsContext): EmbeddingsService {
  const store = createStore(ctx);
  return {
    store,
    writeHubScores: createWriteHubScores(ctx),
    clearTable: createClearTable(ctx),
    embedCorpus: createEmbedCorpus(ctx, { store }),
    embedAssets: createEmbedAssets(ctx, {
      store,
      caption: (bytes): Promise<string> => generateAvatarCaption(ctx.roleClients, bytes),
    }),
  };
}
