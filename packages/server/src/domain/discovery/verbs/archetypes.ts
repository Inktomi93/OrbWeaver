// domain/discovery/verbs/archetypes — character archetypes (owner-scoped read; live compute). Clusters an
// owner's card embeddings (k-means, per embedding-space) to surface the kinds of characters they collect,
// labelled cheaply from the distilled facets (mode genre/tone + top tags — no LLM). Character-side analog
// of `themes`. Content-collapsed before clustering so byte-identical fork/import copies don't bias a centroid.
//
// TWO READS, TWO QUESTIONS (issue #154). A member's NAME + FACE come from `readOwnedCardDisplay` (the
// `characters` row, present from import); the cluster's LABEL comes from `readOwnedCardFacets` (the distill
// pass's output, present only after it runs). They used to be one read rooted at `character_summaries`, so a
// card the distill pass had not reached rendered as "Unknown" with no face inside a cluster it was
// legitimately a member of — the member set comes from the EMBEDDINGS, which cover every indexed card.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context.ts";
import type { ArchetypesOptions } from "../contract/params.ts";
import type { Archetype, ArchetypeMember } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { readOwnedCardDisplay } from "../persistence/card-reads.ts";
import { readOwnedCharacterVectors } from "../persistence/embed-store-reads.ts";
import { readOwnedCardFacets } from "../persistence/summary-reads.ts";
import { collapseByHash } from "../substrate/collapse.ts";
import { kmeans } from "../substrate/kmeans.ts";

/** Bind the archetypes read over the DI bundle (the verb-naming factory the service composes). */
export function createArchetypes(ctx: DiscoveryContext): Pick<DiscoveryService, "archetypes"> {
  return { archetypes: (userId, opts) => archetypes(ctx.db, userId, opts) };
}

const DEFAULT_ARCHETYPE_K = 10;
const ARCHETYPE_SEED = 1;
const TOP_TAGS = 5;
const MAX_MEMBERS = 12;

type CardVector = Awaited<ReturnType<typeof readOwnedCharacterVectors>>[number];
type CardFacet = Awaited<ReturnType<typeof readOwnedCardFacets>>[number];
type CardDisplay = Awaited<ReturnType<typeof readOwnedCardDisplay>>[number];

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

function tallyCard(acc: ClusterAcc, card: CardVector, display: CardDisplay | undefined, facet: CardFacet | undefined): void {
  // Identity comes off the CARD row, so it resolves for every clustered member whether or not the distill
  // pass has reached it. `undefined` here means the card row is gone from under a live embedding (a delete
  // racing this read), which is the only remaining "Unknown".
  acc.members.push({ characterId: card.characterId, name: display?.name ?? "Unknown", avatarHash: display?.avatarHash ?? null });
  if (facet?.genre !== null && facet?.genre !== undefined && facet.genre !== "") {
    bump(acc.genre, facet.genre);
  }
  if (facet?.tone !== null && facet?.tone !== undefined && facet.tone !== "") {
    bump(acc.tone, facet.tone);
  }
  for (const tag of facet?.tags ?? []) {
    bump(acc.tags, tag.toLowerCase());
  }
}

// A group below the k+1 floor yields no archetypes (too few cards to cluster).
function archetypesForGroup(
  group: readonly CardVector[],
  displayById: Map<CharacterId, CardDisplay>,
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
    tallyCard(acc, card, displayById.get(card.characterId), facetById.get(card.characterId));
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
async function archetypes(db: Db, ownerId: UserId, opts: ArchetypesOptions = {}): Promise<Archetype[]> {
  const k = opts.k ?? DEFAULT_ARCHETYPE_K;
  const vectors = await readOwnedCharacterVectors(db, ownerId);
  if (vectors.length === 0) {
    return [];
  }
  const [display, facets] = await Promise.all([readOwnedCardDisplay(db, ownerId), readOwnedCardFacets(db, ownerId)]);
  const displayById = new Map(display.map((d) => [d.characterId, d]));
  const facetById = new Map(facets.map((f) => [f.characterId, f]));
  const out: Archetype[] = [];
  for (const [, group] of groupByModel(vectors)) {
    out.push(...archetypesForGroup(group, displayById, facetById, k));
  }
  return out.sort((a, b) => b.size - a.size);
}
