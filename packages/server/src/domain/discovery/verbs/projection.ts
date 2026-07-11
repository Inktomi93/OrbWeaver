// domain/discovery/verbs/projection — the "corpus galaxy" (owner-scoped read; live compute). A 2D PCA
// projection of every card embedding in the owner's PRIMARY space, so the whole library plots as one semantic
// map (cards that read alike land near each other; colored client-side by distilled genre). Live compute
// (~hundreds of 1024-dim vectors → sub-ms power iteration; no precompute table). Was neo-tavern
// `corpus/verbs/projection.ts`.
//
// LOAD-BEARING: a PCA basis only makes sense WITHIN one embedding space (projecting a mix of embedder bases is
// meaningless). Orb has no "active model" on the discovery context, so the projection runs over the owner's
// MOST-POPULOUS (owner, model) group — the primary space; cards in a stray secondary space (a mid-migration
// artefact) are omitted from THIS map (they can't share the basis). Owner-scoped via the card-vector read's
// `characters.ownerId` derivation (audit #1: no caller owner). NO content-collapse — every card is a plotted
// point (identical cards simply overlap).

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { CorpusPoint } from "../contract/results";
import type { DiscoveryContext, DiscoveryService } from "../contract/service";
import { readOwnedCharacterVectors } from "../persistence/embed-store-reads";
import { readOwnedCardFacets } from "../persistence/summary-reads";
import { pca2d } from "../substrate/pca";

type CardVector = Awaited<ReturnType<typeof readOwnedCharacterVectors>>[number];

/** Bind the corpus-projection read over the DI bundle (the verb-naming factory the service composes). */
export function createProjection(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "corpusProjection"> {
  return { corpusProjection: (userId) => corpusProjection(ctx.db, userId) };
}

// PCA needs at least a few points to mean anything (a 2-point cloud is a line).
const MIN_PROJECTION_POINTS = 3;

// The owner's most-populous (model) group — the primary embedding space to project over.
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

/**
 * The owner's corpus galaxy — every card in their primary space projected to 2D (PCA), labelled with the card
 * name + distilled genre. Standalone `(db, ownerId)` so the service factory + tests call it directly. Fewer
 * than {@link MIN_PROJECTION_POINTS} cards ⇒ `[]` (nothing to plot).
 */
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
