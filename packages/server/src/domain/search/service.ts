// domain/search — COMPOSITION ROOT. Wires the W2 core verbs over the injected `SearchContext` (db +
// the required `roleClients` bundle). ZERO logic: it only calls the verb factories and assembles the
// `SearchService`. `findCharacters` is `knn` + display enrichment, so it receives the SAME `knn` instance
// wired here (the retrieval ranking has one home; `find-characters` never re-implements or sideways-imports
// it). The memory/discover/image/lexical verbs join here as they land (see `contract/service.ts` ledger).

import type { SearchContext } from "./context.ts";
import type { SearchService } from "./contract/service.ts";
import { createCorpus } from "./verbs/corpus.ts";
import { createDigests } from "./verbs/digests.ts";
import { createDiscover } from "./verbs/discover.ts";
import { createDocuments } from "./verbs/documents.ts";
import { createFields, createSuggest } from "./verbs/fields.ts";
import { createFindCharacters } from "./verbs/find-characters.ts";
import { createImages } from "./verbs/images.ts";
import { createKnn } from "./verbs/knn.ts";
import { createSearch } from "./verbs/search.ts";
import { createSegments } from "./verbs/segments.ts";
import { createSimilarArt } from "./verbs/similar-art.ts";
import { createSimilarCharacters } from "./verbs/similar-characters.ts";

export function createSearchService(ctx: SearchContext): SearchService {
  const knn = createKnn(ctx);
  const findCharacters = createFindCharacters(ctx, knn);
  const digests = createDigests(ctx);
  const segments = createSegments(ctx);
  const corpus = createCorpus(ctx);
  const images = createImages(ctx);
  const discover = createDiscover(ctx);
  const documents = createDocuments(ctx);
  return {
    knn,
    findCharacters,
    digests,
    segments,
    corpus,
    images,
    fields: createFields(ctx),
    suggest: createSuggest(ctx),
    discover,
    documents,
    similarCharacters: createSimilarCharacters(ctx),
    similarArt: createSimilarArt(ctx),
    // The unified dispatch closes over the owner-wide card/corpus/image verbs + segments + documents (digests
    // route through the dispatch's own owner-belted scan, not the un-belted memory `digests` verb).
    search: createSearch(ctx, { knn, findCharacters, discover, corpus, images, segments, documents }),
  };
}
