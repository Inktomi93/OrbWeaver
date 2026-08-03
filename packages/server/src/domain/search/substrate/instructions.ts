// domain/search/substrate/instructions — per-scope query + rerank instruction strings for an
// instruction-aware embedder/reranker (E5/BGE-style "Instruct:" prefixes, Qwen3-reranker <Instruct>).
// Pure data, no I/O. Consumed by the unified search() dispatch: the query string is passed as
// `embed(..., { instruction })` and the rerank string as `rerank(..., { instruction })`, so a
// task-tuned family sharpens retrieval per target; symmetric/text-only families drop it (no-op knob
// doctrine — `@orb/contracts/role-clients`). The keying is exhaustive over `SearchTarget`: a new target
// without an entry fails `tsc` (the `satisfies Record<SearchTarget, …>` pin).

import type { SearchTarget } from "../contract/params.ts";

interface ScopeInstructions {
  /** The asymmetric-retrieval task hint folded into the embedded query. */
  readonly query: string;
  /** The cross-encoder `<Instruct>` describing what a relevant document looks like. */
  readonly rerank: string;
}

export const SCOPE_INSTRUCTIONS = {
  entities: {
    query: "Retrieve the roleplay character or conversation moment that best matches the request.",
    rerank: "Given a query, retrieve the roleplay character or conversation moment most relevant to it.",
  },
  characters: {
    query: "Retrieve the roleplay character card that best matches the described persona.",
    rerank: "Given a description, retrieve the roleplay character card that best matches it.",
  },
  discover: {
    query: "Retrieve the lived roleplay scene whose character has experienced moments like this.",
    rerank: "Given a query, retrieve the roleplay conversation moment whose character best fits the request.",
  },
  segments: {
    query: "Retrieve the verbatim roleplay conversation moment that best matches the request.",
    rerank: "Given a query, retrieve the verbatim roleplay excerpt most relevant to it.",
  },
  digests: {
    query: "Retrieve the roleplay scene or story-arc summary that best matches the request.",
    rerank: "Given a query, retrieve the roleplay scene or arc summary most relevant to it.",
  },
  corpus: {
    query: "Retrieve the roleplay scene or conversation moment that best matches the request.",
    rerank: "Given a query, retrieve the roleplay scene or conversation excerpt most relevant to it.",
  },
  images: {
    query: "Retrieve the character art that best matches the described appearance.",
    rerank: "Given a description, retrieve the character portrait image that best matches it.",
  },
  documents: {
    query: "Retrieve the source-document passage that best answers the request.",
    rerank: "Given a query, retrieve the reference-document passage most relevant to it.",
  },
} as const satisfies Record<SearchTarget, ScopeInstructions>;
