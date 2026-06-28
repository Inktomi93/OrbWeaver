// domain/search — COMPOSITION ROOT. Wires the W2 core verbs over the injected `SearchContext` (db +
// the required `roleClients` bundle). ZERO logic: it only calls the verb factories and assembles the
// `SearchService`. `findCharacters` is `knn` + display enrichment, so it receives the SAME `knn` instance
// wired here (the retrieval ranking has one home; `find-characters` never re-implements or sideways-imports
// it). The memory/discover/image/lexical verbs join here as they land (see `contract/service.ts` ledger).

import type { SearchContext, SearchService } from "./contract/service";
import { createFindCharacters } from "./verbs/find-characters";
import { createKnn } from "./verbs/knn";

export function createSearchService(ctx: SearchContext): SearchService {
  const knn = createKnn(ctx);
  return {
    knn,
    findCharacters: createFindCharacters(ctx, knn),
  };
}
