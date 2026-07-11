// domain/discovery/verbs/archetypes — character ARCHETYPES (owner-scoped read; live compute). Clusters an
// owner's card EMBEDDINGS (k-means over the unified card space) to surface the KINDS of characters they
// collect ("the broken healer", "the dominant queen"), then labels each cluster CHEAPLY from the distilled
// facets (mode genre/tone + top tags — NO LLM). The character-side analog of `themes`. Was neo-tavern
// `corpus/verbs/archetypes.ts`.
//
// LOAD-BEARING (matches the built themes pass):
//   • per (owner, embedding-space) — k-means over a MIX of spaces is meaningless (different bases). Groups by
//     `model`; an owner's archetypes concat across their spaces (one space in practice — schema/discovery.ts).
//   • content-collapse before clustering (esoteric #3): byte-identical fork/import copies collapse to one rep
//     so they don't bias a centroid; every card is then assigned to its rep's cluster and tallied (full size).
//   • owner-scoped via the card-vector read's `characters.ownerId` derivation (audit #1: no caller owner).
//   • DETERMINISM: the fixed k-means++ seed (no ambient randomness).

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ArchetypesOptions } from "../contract/params";
import type { Archetype, ArchetypeMember } from "../contract/results";
import type { DiscoveryContext, DiscoveryService } from "../contract/service";
import { readOwnedCharacterVectors } from "../persistence/embed-store-reads";
import { readOwnedCardFacets } from "../persistence/summary-reads";
import { collapseByHash } from "../substrate/collapse";
import { kmeans } from "../substrate/kmeans";

/** Bind the archetypes read over the DI bundle (the verb-naming factory the service composes). */
export function createArchetypes(ctx: DiscoveryContext): Pick<DiscoveryService, "archetypes"> {
  return { archetypes: (userId, opts) => archetypes(ctx.db, userId, opts) };
}

// The default cluster count per embedding space (overridable via opts.k).
const DEFAULT_ARCHETYPE_K = 10;
// The k-means++ seed — a fixed value pins the clustering run-to-run (determinism).
const ARCHETYPE_SEED = 1;
// How many top tags label a cluster + how many members are returned (a bounded display slice).
const TOP_TAGS = 5;
const MAX_MEMBERS = 12;

type CardVector = Awaited<ReturnType<typeof readOwnedCharacterVectors>>[number];
type CardFacet = Awaited<ReturnType<typeof readOwnedCardFacets>>[number];

// One accumulating cluster (members + per-facet tallies) before it becomes an Archetype.
interface ClusterAcc {
  readonly members: ArchetypeMember[];
  readonly genre: Map<string, number>;
  readonly tone: Map<string, number>;
  readonly tags: Map<string, number>;
}

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

function bump(m: Map<string, number>, key: string): void {
  m.set(key, (m.get(key) ?? 0) + 1);
}

function mode(m: Map<string, number>): string | null {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

function topN(m: Map<string, number>, n: number): string[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([k]) => k);
}

// Tally ONE card into its cluster accumulator (member + the per-facet counts).
function tallyCard(acc: ClusterAcc, card: CardVector, facet: CardFacet | undefined): void {
  acc.members.push({ characterId: card.characterId, name: facet?.name ?? "Unknown" });
  if (facet?.genre) {
    bump(acc.genre, facet.genre);
  }
  if (facet?.tone) {
    bump(acc.tone, facet.tone);
  }
  for (const tag of facet?.tags ?? []) {
    bump(acc.tags, tag.toLowerCase());
  }
}

// Cluster ONE (owner, space) group into archetypes: collapse → k-means over reps → assign every card to its
// rep's cluster, tallying facets. A group below the k+1 floor yields no archetypes (too few cards to cluster).
function archetypesForGroup(
  group: readonly CardVector[],
  facetById: Map<CharacterId, CardFacet>,
  k: number,
): Archetype[] {
  const { reps, repOf } = collapseByHash(
    group,
    (r) => r.contentHash,
    (r) => r.characterId,
  );
  if (reps.length < k + 1) {
    return [];
  }
  const { assignments } = kmeans(
    reps.map((r) => r.embedding),
    k,
    ARCHETYPE_SEED,
  );
  const clusters = new Map<number, ClusterAcc>();
  for (let i = 0; i < group.length; i += 1) {
    const card = group[i];
    const repIdx = repOf[i];
    if (card === undefined || repIdx === undefined) {
      continue;
    }
    const c = assignments[repIdx] ?? 0;
    let acc = clusters.get(c);
    if (acc === undefined) {
      acc = { members: [], genre: new Map(), tone: new Map(), tags: new Map() };
      clusters.set(c, acc);
    }
    tallyCard(acc, card, facetById.get(card.characterId));
  }
  const model = group[0]?.model ?? "";
  return [...clusters.values()].map((acc) => {
    const genre = mode(acc.genre);
    const tone = mode(acc.tone);
    return {
      label: [tone, genre].filter((x) => x !== null).join(" ") || "mixed",
      genre,
      tone,
      topTags: topN(acc.tags, TOP_TAGS),
      size: acc.members.length,
      members: acc.members.slice(0, MAX_MEMBERS),
      model,
    };
  });
}

/**
 * The owner's character archetypes — k-means clusters of their card embeddings, labelled from distilled
 * facets, largest first. Standalone `(db, ownerId, opts?)` so the service factory + tests call it directly.
 */
export async function archetypes(
  db: Db,
  ownerId: UserId,
  opts: ArchetypesOptions = {},
): Promise<Archetype[]> {
  const k = opts.k ?? DEFAULT_ARCHETYPE_K;
  const vectors = await readOwnedCharacterVectors(db, ownerId);
  if (vectors.length === 0) {
    return [];
  }
  const facets = await readOwnedCardFacets(db, ownerId);
  const facetById = new Map(facets.map((f) => [f.characterId, f]));
  const out: Archetype[] = [];
  for (const [, group] of groupByModel(vectors)) {
    out.push(...archetypesForGroup(group, facetById, k));
  }
  return out.sort((a, b) => b.size - a.size);
}
