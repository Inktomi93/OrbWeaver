// domain/search — COMPOSITION ROOT. Wires the W2 core verbs over the injected `SearchContext` (db +
// the required `roleClients` bundle). ZERO logic: it only calls the verb factories and assembles the
// `SearchService`. `findCharacters` is `knn` + display enrichment, so it receives the SAME `knn` instance
// wired here (the retrieval ranking has one home; `find-characters` never re-implements or sideways-imports
// it). The memory/discover/image/lexical verbs join here as they land (see `contract/service.ts` ledger).

import type { SearchContext, SearchService } from "./contract/service";
import { createCorpus } from "./verbs/corpus";
import { createDigests } from "./verbs/digests";
import { createDiscover } from "./verbs/discover";
import { createFields, createSuggest } from "./verbs/fields";
import { createFindCharacters } from "./verbs/find-characters";
import { createImages } from "./verbs/images";
import { createKnn } from "./verbs/knn";
import { createSegments } from "./verbs/segments";
import { createSimilarArt } from "./verbs/similar-art";
import { createSimilarCharacters } from "./verbs/similar-characters";

export function createSearchService(ctx: SearchContext): SearchService {
  const knn = createKnn(ctx);
  return {
    knn,
    findCharacters: createFindCharacters(ctx, knn),
    digests: createDigests(ctx),
    segments: createSegments(ctx),
    corpus: createCorpus(ctx),
    images: createImages(ctx),
    fields: createFields(ctx),
    suggest: createSuggest(ctx),
    discover: createDiscover(ctx),
    similarCharacters: createSimilarCharacters(ctx),
    similarArt: createSimilarArt(ctx),
  };
}
