// domain/discovery/verbs/similarity-graph — the character similarity graph (owner-scoped read; live
// compute). Every pair whose raw card-embedding cosine clears minSimilarity is an edge; nodes are the
// highest-degree characters, capped to maxNodes. All-pairs in-RAM analytics (not top-k retrieval — that's
// search). Grouped by embedding-space model: an N-D cosine is only meaningful within one space, so degrees
// accumulate per character across spaces.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context";
import type { SimilarityGraphOptions } from "../contract/params";
import type { SimilarityGraph, SimilarityGraphEdge } from "../contract/results";
import type { DiscoveryService } from "../contract/service";
import { readOwnedCharacterVectors } from "../persistence/embed-store-reads";
import { readOwnedCardFacets } from "../persistence/summary-reads";
import { pairsAboveThreshold } from "../substrate/pair-cosine";

const DEFAULT_MIN_SIMILARITY = 0.65;
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

export function createSimilarityGraph(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "similarityGraph"> {
  return { similarityGraph: (userId, opts) => similarityGraph(ctx.db, userId, opts) };
}

/** The owner's character similarity graph: nodes are the highest-degree characters, edges filtered to kept nodes. */
export async function similarityGraph(
  db: Db,
  ownerId: UserId,
  opts: SimilarityGraphOptions = {},
): Promise<SimilarityGraph> {
  const minSimilarity = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;

  const vectors = await readOwnedCharacterVectors(db, ownerId);
  // Hubs pass as zeros — threshold gates on raw cosine, so the CSLS rank key is unused here.
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

  // A card not yet distilled has no facet row → name "Unknown", genre null.
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
