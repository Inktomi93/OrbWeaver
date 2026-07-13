// domain/discovery/verbs/projection — the "corpus galaxy": a 2D PCA projection of every card embedding in
// the owner's primary space (owner-scoped, live compute), colored client-side by distilled genre.
//
// A PCA basis only makes sense within one embedding space, so this runs over the owner's most-populous
// (owner, model) group; cards in a stray secondary space are omitted (they can't share the basis).

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context";
import type { CorpusPoint } from "../contract/results";
import type { DiscoveryService } from "../contract/service";
import { readOwnedCharacterVectors } from "../persistence/embed-store-reads";
import { readOwnedCardFacets } from "../persistence/summary-reads";
import { pca2d } from "../substrate/pca";

type CardVector = Awaited<ReturnType<typeof readOwnedCharacterVectors>>[number];

export function createProjection(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "corpusProjection"> {
  return { corpusProjection: (userId) => corpusProjection(ctx.db, userId) };
}

const MIN_PROJECTION_POINTS = 3;

function primarySpace(vectors: readonly CardVector[]): CardVector[] {
  const groups = new Map<string, CardVector[]>();
  for (const row of vectors) {
    const bucket = groups.get(row.model);
    if (bucket === undefined) {
      groups.set(row.model, [row]);
    } else {
      bucket.push(row);
    }
  }
  let best: CardVector[] = [];
  for (const group of groups.values()) {
    if (group.length > best.length) {
      best = group;
    }
  }
  return best;
}

/** Fewer than MIN_PROJECTION_POINTS cards → [] (nothing to plot). */
export async function corpusProjection(db: Db, ownerId: UserId): Promise<CorpusPoint[]> {
  const vectors = await readOwnedCharacterVectors(db, ownerId);
  const space = primarySpace(vectors);
  if (space.length < MIN_PROJECTION_POINTS) {
    return [];
  }
  const coords = pca2d(space.map((r) => r.embedding));
  const facets = await readOwnedCardFacets(db, ownerId);
  const nameById = new Map(facets.map((f) => [f.characterId, f.name]));
  const genreById = new Map(facets.map((f) => [f.characterId, f.genre]));
  return space.map((r, i) => ({
    characterId: r.characterId,
    name: nameById.get(r.characterId) ?? "Unknown",
    genre: genreById.get(r.characterId) ?? null,
    x: coords[i]?.x ?? 0,
    y: coords[i]?.y ?? 0,
  }));
}
