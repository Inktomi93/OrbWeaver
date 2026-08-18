// domain/discovery/image-analytics/facets — cross-modal alignment + VL-breakdown analytics (owner-scoped
// reads): portraitAlignment (paired in-RAM cosine of card-text vs avatar vector), imageFacets (caption_meta
// facet distributions), charactersByImageFacet (drill a facet to its avatars).
//
// Alignment computes cosineSim in-RAM — never vector_distance_cos SQL (that's search-only).
//
// EVERY FACET NAME COMES FROM `@orb/contracts/embeddings`, NOT FROM A LIST HERE. The tally iterates
// `IMAGE_FACET_NATURE_BY_KEY` and the drill resolves its json path through `IMAGE_FACET_DRILL_KEY`, so the
// producer's vocabulary and this reader's cannot drift. They HAD drifted: this file declared fourteen facet
// paths against a writer that only ever stored `{model}`, and the drift was invisible because an empty
// distribution and an unproduced facet render identically (issue #164).
//
// `total` COUNTS ROWS THAT ACTUALLY CARRY A BREAKDOWN, not rows that carry a caption. Counting captions gave
// the Visuals tab a confident "79 images" above fourteen empty bar-lists — the wall-of-nothing this surface's
// empty states exist to prevent. A row analysed before the breakdown landed contributes to `captioned`, which
// is what makes "captioned, not yet analysed" a statable coverage state rather than a silent zero.

import type { ImageFacetMetaKey, ImageFacetNature } from "@orb/contracts/embeddings";
import { IMAGE_FACET_NATURE_BY_KEY } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { DiscoveryContext } from "../context.ts";
import type { ImageFacetKey } from "../contract/params.ts";
import { IMAGE_FACET_DRILL_KEY } from "../contract/params.ts";
import type { FacetCount, ImageFacetMember, ImageFacets, PortraitAlignment, PortraitAlignmentReport } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { readCaptionRowsByFacet, readOwnedCaptionRows, readOwnedPortraitPairs } from "../persistence/embed-store-reads.ts";

const TOP_TAGS_LIMIT = 40;

/** The stored `caption_meta` property a drill name pivots on — the inverse of the ONE authored map. Resolved
 *  by scan rather than a module-scope lookup table: sixteen entries once per drill call is free, and a
 *  module-scope `Map` is per-process state the `assumes-single-replica` gate correctly refuses. */
function metaKeyOf(facet: ImageFacetKey): ImageFacetMetaKey | undefined {
  const entries = Object.entries(IMAGE_FACET_DRILL_KEY) as [ImageFacetMetaKey, ImageFacetKey][];
  return entries.find(([, drill]) => drill === facet)?.[0];
}

export function createImageAnalyticsFacets(ctx: DiscoveryContext): Pick<DiscoveryService, "portraitAlignment" | "imageFacets" | "charactersByImageFacet"> {
  return {
    portraitAlignment: (userId) => portraitAlignment(ctx.db, userId),
    imageFacets: (userId) => imageFacets(ctx.db, userId),
    charactersByImageFacet: (userId, facet, value) => charactersByImageFacet(ctx.db, userId, facet, value),
  };
}

const metaStr = (m: Record<string, unknown> | null, key: string): string | null => (m !== null && typeof m[key] === "string" ? (m[key] as string) : null);

/** Ascending — worst-matched art first (the curation signal). */
async function portraitAlignment(db: Db, ownerId: UserId): Promise<PortraitAlignmentReport> {
  const [pairs, captions] = await Promise.all([readOwnedPortraitPairs(db, ownerId), readOwnedCaptionRows(db, ownerId)]);
  const metaById = new Map(captions.map((c) => [c.characterId, c.captionMeta]));
  const characters: PortraitAlignment[] = pairs
    .map((p) => ({
      characterId: p.characterId,
      name: p.name,
      avatarHash: p.avatarHash,
      alignment: cosineSim(p.cardVec, p.imageVec),
      rating: metaStr(metaById.get(p.characterId) ?? null, "rating"),
      artStyle: metaStr(metaById.get(p.characterId) ?? null, "artStyle"),
    }))
    .sort((a, b) => a.alignment - b.alignment);
  const n = characters.length;
  if (n === 0) {
    return { count: 0, mean: 0, median: 0, characters: [] };
  }
  const vals = characters.map((c) => c.alignment);
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? (vals[mid] ?? 0) : ((vals[mid - 1] ?? 0) + (vals[mid] ?? 0)) / 2;
  return { count: n, mean, median, characters };
}

function bump(m: Map<string, number>, v: unknown): void {
  if (typeof v === "string" && v.length > 0) {
    m.set(v, (m.get(v) ?? 0) + 1);
  }
}

function bumpArr(m: Map<string, number>, v: unknown): void {
  if (Array.isArray(v)) {
    for (const x of v) {
      bump(m, x);
    }
  }
}

const toFacetCounts = (m: Map<string, number>): FacetCount[] => [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

/** Tally one row into the per-facet counters; `true` when the row carried ANY facet (i.e. it is analysed). */
function tallyRow(counters: Map<ImageFacetMetaKey, Map<string, number>>, meta: Record<string, unknown>): boolean {
  let carried = false;
  for (const [key, nature] of Object.entries(IMAGE_FACET_NATURE_BY_KEY) as [ImageFacetMetaKey, ImageFacetNature][]) {
    const value = meta[key];
    if (value === undefined || value === null) {
      continue;
    }
    const counter = counters.get(key);
    if (counter === undefined) {
      continue;
    }
    carried = true;
    if (nature === "list") {
      bumpArr(counter, value);
    } else {
      bump(counter, value);
    }
  }
  return carried;
}

const emptyCounts = (): Map<ImageFacetMetaKey, Map<string, number>> =>
  new Map((Object.keys(IMAGE_FACET_NATURE_BY_KEY) as ImageFacetMetaKey[]).map((key) => [key, new Map<string, number>()]));

async function imageFacets(db: Db, ownerId: UserId): Promise<ImageFacets> {
  const rows = await readOwnedCaptionRows(db, ownerId);
  const counters = emptyCounts();
  const counts = (key: ImageFacetMetaKey): FacetCount[] => toFacetCounts(counters.get(key) ?? new Map());
  let analysed = 0;
  for (const row of rows) {
    if (row.captionMeta !== null && tallyRow(counters, row.captionMeta)) {
      analysed += 1;
    }
  }
  return {
    total: analysed,
    captioned: rows.length,
    artStyles: counts("artStyle"),
    palettes: counts("palette"),
    moods: counts("mood"),
    ratings: counts("rating"),
    shotTypes: counts("shotType"),
    cameraAngles: counts("cameraAngle"),
    genders: counts("gender"),
    coverage: counts("coverage"),
    bodyTypes: counts("bodyType"),
    chestSizes: counts("chestSize"),
    skinTones: counts("skinTone"),
    outfitTypes: counts("outfitType"),
    clothingStates: counts("clothingState"),
    nudityLevels: counts("nudityLevel"),
    exposedParts: counts("exposedParts"),
    topTags: counts("tags").slice(0, TOP_TAGS_LIMIT),
  };
}

async function charactersByImageFacet(db: Db, ownerId: UserId, facet: ImageFacetKey, value: string): Promise<ImageFacetMember[]> {
  // The json path is DERIVED from the shared vocabulary, never caller-derived — the drill name is already
  // narrowed to the enum at transport, and this map is the only thing that turns it into SQL.
  const metaKey = metaKeyOf(facet);
  if (metaKey === undefined) {
    return [];
  }
  const rows = await readCaptionRowsByFacet(db, ownerId, {
    path: `$.${metaKey}`,
    isList: IMAGE_FACET_NATURE_BY_KEY[metaKey] === "list",
    value,
  });
  return rows.map((r) => ({
    characterId: r.characterId,
    name: r.name,
    avatarHash: r.avatarHash,
    rating: metaStr(r.captionMeta, "rating"),
    artStyle: metaStr(r.captionMeta, "artStyle"),
    caption: r.caption,
  }));
}
