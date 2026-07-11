// domain/discovery/verbs/similarity-graph — the character SIMILARITY GRAPH (owner-scoped read; live compute).
// Every character pair whose RAW card-embedding cosine clears `minSimilarity` is an edge; nodes are the
// highest-DEGREE characters (the dense core), capped to `maxNodes`. A force-directed "who reads like whom"
// map, colored client-side by distilled genre. Was neo-tavern `corpus/verbs/similarity.ts` (graph arm).
//
// DISCOVERY-NATIVE, ZERO SEARCH: this is ALL-PAIRS in-RAM ANALYTICS over discovery's OWN substrate
// (`substrate/pair-cosine.pairsAboveThreshold`) — NOT top-k retrieval (that is `search`, via
// `vector_distance_cos`; the two-cosine-access-patterns rule, Knowledge-Cluster inv 2). It composes the SAME
// reads the near-dup/projection verbs do (`readOwnedCharacterVectors` + `readOwnedCardFacets`) and calls no
// injected op. Per (owner, embedding-space): grouped by `model` (like `imageDuplicates`) — an N-D cosine is
// only meaningful within ONE space; discovery has no active-embedder handle, so every space contributes its
// own edges and degrees accumulate per character across spaces.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { SimilarityGraphOptions } from "../contract/params";
import type { SimilarityGraph, SimilarityGraphEdge } from "../contract/results";
import type { DiscoveryContext, DiscoveryService } from "../contract/service";
import { readOwnedCharacterVectors } from "../persistence/embed-store-reads";
import { readOwnedCardFacets } from "../persistence/summary-reads";
import { pairsAboveThreshold } from "../substrate/pair-cosine";

/** The raw card-cosine floor a character pair must clear to be recorded as an edge. */
const DEFAULT_MIN_SIMILARITY = 0.65;
/** The default node cap — the highest-degree characters (the dense core) are kept. */
const DEFAULT_MAX_NODES = 120;

type CardVector = Awaited<ReturnType<typeof readOwnedCharacterVectors>>[number];

function groupByModel(rows: readonly CardVector[]): Map<string, CardVector[]> {
  const groups = new Map<string, CardVector[]>();
  for (const row of rows) {
    const bucket = groups.get(row.model);
    if (bucket === undefined) {
      groups.set(row.model, [row]);
    } else {
      bucket.push(row);
    }
  }
  return groups;
}

/** Bind the similarity-graph read over the DI bundle (the verb-naming factory the service composes). */
export function createSimilarityGraph(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "similarityGraph"> {
  return { similarityGraph: (userId, opts) => similarityGraph(ctx.db, userId, opts) };
}

/**
 * The owner's character similarity graph — every within-space card pair with cosine over `minSimilarity`
 * (default {@link DEFAULT_MIN_SIMILARITY}) is an edge; nodes are the `maxNodes` (default
 * {@link DEFAULT_MAX_NODES}) highest-degree characters, edges filtered to kept nodes. Synthetic (per-room
 * group) characters are excluded at the read. Standalone `(db, ownerId, opts?)` so the service factory + tests
 * call it directly. No card vectors ⇒ an empty graph.
 */
export async function similarityGraph(
  db: Db,
  ownerId: UserId,
  opts: SimilarityGraphOptions = {},
): Promise<SimilarityGraph> {
  const minSimilarity = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;

  const vectors = await readOwnedCharacterVectors(db, ownerId);
  // All-pairs edges per embedding space (an N-D cosine is meaningless across spaces). Hubs pass as zeros —
  // the THRESHOLD gates on raw cosine and the graph ranks nodes by degree, so the CSLS rank key is unused
  // here (mirroring `imageDuplicates`).
  const edges: SimilarityGraphEdge[] = [];
  for (const [, group] of groupByModel(vectors)) {
    if (group.length < 2) {
      continue;
    }
    const hubs = new Array<number>(group.length).fill(0);
    for (const pair of pairsAboveThreshold(
      group.map((r) => r.embedding),
      hubs,
      minSimilarity,
    )) {
      const a = group[pair.i];
      const b = group[pair.j];
      if (a === undefined || b === undefined) {
        continue;
      }
      edges.push({ source: a.characterId, target: b.characterId, similarity: pair.similarity });
    }
  }

  // Degree per character (across all spaces), then keep the top-`maxNodes` by degree.
  const degree = new Map<CharacterId, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const kept = new Set(
    [...degree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxNodes)
      .map(([id]) => id),
  );
  const keptEdges = edges.filter((e) => kept.has(e.source) && kept.has(e.target));

  // Name + distilled genre per kept node (from the discovery-native summary read) — the client colors the
  // graph by genre. A card not yet distilled has no facet row → name "Unknown", genre null (the projection
  // precedent).
  const facets = await readOwnedCardFacets(db, ownerId);
  const nameById = new Map(facets.map((f) => [f.characterId, f.name]));
  const genreById = new Map(facets.map((f) => [f.characterId, f.genre]));
  const nodes = [...kept].map((id) => ({
    characterId: id,
    name: nameById.get(id) ?? "Unknown",
    degree: degree.get(id) ?? 0,
    genre: genreById.get(id) ?? null,
  }));
  return { nodes, edges: keptEdges };
}
