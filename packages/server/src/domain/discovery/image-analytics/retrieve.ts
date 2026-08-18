// domain/discovery/image-analytics/retrieve — image-side embedding analytics (owner-scoped, in-RAM):
// imageDuplicates (cards sharing near-identical art) + visualArchetypes (visual families, k-means over
// avatar vectors, named from the VL breakdown). All-pairs analytics, not vector_distance_cos SQL (that's
// search's). CLUSTERED per embedding space (a cosine between two spaces is meaningless); LABELLED against the
// whole owner corpus (a family is "more X than YOUR LIBRARY is", and which model embedded it is not part of
// that question).
//
// THE PIPELINE, END TO END, so nobody re-derives it (issue #164's audit deliverable):
//   1. `domain/embeddings/indexer/caption.ts` — ONE vision call per avatar returns a caption AND a
//      grammar-enforced facet breakdown (`imageBreakdownSchema`, `@orb/contracts/embeddings`).
//   2. `verbs/store.ts` writes both to `image_embeddings` (`caption`, `caption_meta`) for the
//      `image-captioned` lens; `image-raw` is the pure-pixel vector beside it.
//   3. The `index {source:"image"}` workload is the catch-up door; its pre-check treats a captioned row with
//      no breakdown as WORK, which is what makes the facet backfill resumable without `force`.
//   4. HERE: k-means over the raw avatar vectors makes the families; the breakdown names them by LIFT.
//   5. `image-analytics/facets.ts` tallies the same column into the Visuals tab's distributions + drill.
// Nothing in this chain reads card TEXT to name a picture; `genre`/`tone` ride along as context chips only.

import type { ImageCaptionMeta, ImageFacetMetaKey } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context.ts";
import type { ArchetypeMember, ImageDuplicatePair, VisualArchetype } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { readOwnedAvatarVectors, readOwnedCaptionRows } from "../persistence/embed-store-reads.ts";
import { readOwnedCardFacets } from "../persistence/summary-reads.ts";
import { kmeans } from "../substrate/kmeans.ts";
import { pairsAboveThreshold } from "../substrate/pair-cosine.ts";

const DEFAULT_IMAGE_DUP_THRESHOLD = 0.92;
const DEFAULT_VISUAL_K = 8;
const VISUAL_SEED = 1;
const MAX_MEMBERS = 12;

type AvatarVector = Awaited<ReturnType<typeof readOwnedAvatarVectors>>[number];

function groupByModel<T extends { readonly model: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
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

export function createImageAnalyticsRetrieve(ctx: DiscoveryContext): Pick<DiscoveryService, "imageDuplicates" | "visualArchetypes"> {
  return {
    imageDuplicates: (userId, threshold) => imageDuplicates(ctx.db, userId, threshold),
    visualArchetypes: (userId, k) => visualArchetypes(ctx.db, userId, k),
  };
}

async function imageDuplicates(db: Db, ownerId: UserId, threshold = DEFAULT_IMAGE_DUP_THRESHOLD): Promise<ImageDuplicatePair[]> {
  const avatars = await readOwnedAvatarVectors(db, ownerId);
  const out: ImageDuplicatePair[] = [];
  for (const [, group] of groupByModel(avatars)) {
    if (group.length < 2) {
      continue;
    }
    const hubs = new Array<number>(group.length).fill(0);
    for (const pair of pairsAboveThreshold(
      group.map((r) => r.embedding),
      hubs,
      threshold,
    )) {
      const a = group[pair.i];
      const b = group[pair.j];
      if (a === undefined || b === undefined) {
        continue;
      }
      out.push({
        characterIdA: a.characterId,
        nameA: a.name,
        characterIdB: b.characterId,
        nameB: b.name,
        similarity: pair.similarity,
      });
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

// ── the visual labeler ────────────────────────────────────────────────────────
//
// THE LABEL COMES FROM THE PICTURES. A visual family is a k-means cluster of PORTRAIT vectors; labelling it
// from the card text's genre/tone (what the old `[tone, genre]` fallback did whenever the caption facets were
// null — i.e. always, because nothing produced them) is a category error the owner caught with one receipt:
// the family whose members are grouped precisely by their missing art was labelled "melancholic fantasy".
// `genre`/`tone` remain on the payload as CONTEXT chips; they may never reach `label`.
//
// AND IT COMES FROM LIFT, NOT FROM THE MODE. The mode of a 46-member cluster drawn from a corpus that is 30%
// one value IS that value, for every large cluster — which is exactly how three of eight families rendered
// "wholesome slice-of-life". A family's label has to answer "what is this family MORE of than the library is",
// so each candidate value is scored by its share inside the cluster over its share across the whole corpus.
// A cluster that genuinely looks like the library average scores no lift anywhere and says so.

/** The facets a family may be NAMED by, in preference order. Deliberately a SUBSET of the breakdown: a family
 *  called "large chest" or "brown skin" is not a description of an art family, it is a body caption. Typed
 *  against the shared vocabulary so a renamed facet is a tsc error here. */
const LABEL_FACETS = ["artStyle", "mood", "palette", "shotType", "outfitType", "gender", "rating"] as const satisfies readonly ImageFacetMetaKey[];
type LabelFacet = (typeof LABEL_FACETS)[number];

/** A candidate value must hold at least this share of the cluster before it can name it — lift alone would
 *  let one oddball member (share 1/46, lift 20) name the whole family. */
const MIN_LABEL_SHARE = 0.25;
/** …and must be at least this much more concentrated here than in the library, or it says nothing. */
const MIN_LABEL_LIFT = 1.15;

/** What a family whose members carry NO breakdown is called. Never a narrative label — the honest reading is
 *  that the visual pass has not looked at these yet. */
const UNANALYSED_LABEL = "unanalysed portraits";

type FacetCounts = Map<LabelFacet, Map<string, number>>;

const emptyFacetCounts = (): FacetCounts => new Map(LABEL_FACETS.map((f) => [f, new Map<string, number>()]));

function bump(m: Map<string, number>, key: string | null | undefined): void {
  if (key !== null && key !== undefined && key.length > 0) {
    m.set(key, (m.get(key) ?? 0) + 1);
  }
}

function bumpFacets(counts: FacetCounts, facets: VisualFacets | undefined): void {
  for (const facet of LABEL_FACETS) {
    const counter = counts.get(facet);
    if (counter !== undefined) {
      bump(counter, facets?.[facet]);
    }
  }
}

function mode(m: Map<string, number>): string | null {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

/** One value's claim to name a family. */
interface LabelCandidate {
  readonly facet: LabelFacet;
  readonly value: string;
  readonly lift: number;
  readonly share: number;
}

/** Every value that clears BOTH floors, strongest first. Ties break on share then name so the labelling is
 *  deterministic across runs (the same requirement `VISUAL_SEED` puts on the clustering). */
function rankCandidates(cluster: FacetCounts, corpus: FacetCounts, clusterSize: number, corpusSize: number): LabelCandidate[] {
  const out: LabelCandidate[] = [];
  for (const facet of LABEL_FACETS) {
    const inCluster = cluster.get(facet);
    const inCorpus = corpus.get(facet);
    if (inCluster === undefined || inCorpus === undefined) {
      continue;
    }
    for (const [value, count] of inCluster) {
      const share = count / clusterSize;
      const baseline = (inCorpus.get(value) ?? 0) / corpusSize;
      const lift = baseline === 0 ? Number.POSITIVE_INFINITY : share / baseline;
      if (share >= MIN_LABEL_SHARE && lift >= MIN_LABEL_LIFT) {
        out.push({ facet, value, lift, share });
      }
    }
  }
  return out.sort((a, b) => b.lift - a.lift || b.share - a.share || (a.value < b.value ? -1 : 1));
}

/**
 * Compose ONE family's label from its ranked candidates, avoiding every label already handed out.
 *
 * DISTINCTNESS IS THE POINT, not a nicety (issue #164 item 3): two rows reading "wholesome slice-of-life" are
 * two rows a reader cannot tell apart, which is worse than one row and a number. So a taken single-term label
 * grows a qualifying second term from a DIFFERENT facet, and only a family with nothing else to say at all
 * falls back to the honest unlabelled reading — which the client already renders as its member names.
 */
function composeLabel(candidates: readonly LabelCandidate[], taken: ReadonlySet<string>): string | null {
  const primary = candidates[0];
  if (primary === undefined) {
    return null;
  }
  if (!taken.has(primary.value)) {
    return primary.value;
  }
  for (const next of candidates.slice(1)) {
    if (next.facet === primary.facet) {
      continue;
    }
    const qualified = `${primary.value} · ${next.value}`;
    if (!taken.has(qualified)) {
      return qualified;
    }
  }
  return null;
}

/** The visual half of one member's row — the facets the labeler reads, all optional (a member analysed before
 *  the breakdown landed carries none). */
type VisualFacets = Partial<Record<LabelFacet, string>>;

/** One cluster, accumulated before labels are assigned (labelling is a WHOLE-READ decision — a family's name
 *  depends on what the other families took, so no cluster can be finished in isolation). */
interface VisualClusterAcc {
  readonly members: ArchetypeMember[];
  readonly genre: Map<string, number>;
  readonly tone: Map<string, number>;
  readonly facets: FacetCounts;
  /** Members carrying any breakdown at all — the labeler's denominator and the unanalysed test. */
  analysed: number;
}

function clusterAcc(): VisualClusterAcc {
  return { members: [], genre: new Map(), tone: new Map(), facets: emptyFacetCounts(), analysed: 0 };
}

function accumulateClusters(group: readonly AvatarVector[], labels: Map<CharacterId, VisualLabels>, k: number): VisualClusterAcc[] {
  // A space below the k+1 floor yields NO archetypes (clustering n≤k vectors just renames each one a cluster).
  // The caller returns [] for the whole read, which the UI must show as "not enough captioned avatars yet" —
  // it is a coverage state, never a failure (mirrors `archetypes.archetypesForGroup`).
  if (group.length < k + 1) {
    return [];
  }
  const { assignments } = kmeans(
    group.map((r) => r.embedding),
    k,
    VISUAL_SEED,
  );
  const clusters = new Map<number, VisualClusterAcc>();
  for (let i = 0; i < group.length; i += 1) {
    const row = group[i];
    if (row === undefined) {
      continue;
    }
    const c = assignments[i] ?? 0;
    let acc = clusters.get(c);
    if (acc === undefined) {
      acc = clusterAcc();
      clusters.set(c, acc);
    }
    // Never null on this side: a row is only here BECAUSE it has a current-avatar vector, so the hash the
    // cluster was computed from is the hash the member draws with.
    acc.members.push({ characterId: row.characterId, name: row.name, avatarHash: row.avatarHash });
    const l = labels.get(row.characterId);
    bump(acc.genre, l?.genre);
    bump(acc.tone, l?.tone);
    bumpFacets(acc.facets, l?.facets);
    if (l?.facets !== undefined) {
      acc.analysed += 1;
    }
  }
  return [...clusters.values()];
}

/** Turn accumulated clusters into labelled archetypes. Biggest family picks its label first — the largest
 *  group is the one a reader scans for, so it gets the plainest name and the smaller ones qualify. */
function labelClusters(accs: readonly VisualClusterAcc[], corpus: FacetCounts, corpusSize: number, model: string): VisualArchetype[] {
  const taken = new Set<string>();
  return accs
    .toSorted((a, b) => b.members.length - a.members.length)
    .map((acc) => {
      const candidates = acc.analysed === 0 ? [] : rankCandidates(acc.facets, corpus, acc.analysed, corpusSize);
      const label = composeLabel(candidates, taken);
      if (label !== null) {
        taken.add(label);
      }
      return {
        label: label ?? UNANALYSED_LABEL,
        genre: mode(acc.genre),
        tone: mode(acc.tone),
        artStyle: mode(acc.facets.get("artStyle") ?? new Map()),
        palette: mode(acc.facets.get("palette") ?? new Map()),
        mood: mode(acc.facets.get("mood") ?? new Map()),
        size: acc.members.length,
        members: acc.members.slice(0, MAX_MEMBERS),
        model,
      };
    });
}

/** Everything the labeler knows about one character: its CONTEXT chips (card-text genre/tone) and, separately,
 *  the visual facets that may actually name a family. The two are kept apart on purpose. */
interface VisualLabels {
  readonly genre: string | null;
  readonly tone: string | null;
  /** `undefined` when this character's avatar has no breakdown yet — distinct from "analysed, all values
   *  absent", which cannot happen (the grammar makes every scalar facet required). */
  readonly facets: VisualFacets | undefined;
}

const metaStr = (m: ImageCaptionMeta | null, key: string): string | null => (m !== null && typeof m[key] === "string" ? (m[key] as string) : null);

/** Project one stored `caption_meta` blob onto the facets the labeler reads; `undefined` when it carries none
 *  (a provenance-only `{model}` row, i.e. captioned before the breakdown pass existed). */
function toVisualFacets(meta: ImageCaptionMeta | null): VisualFacets | undefined {
  const facets: Partial<Record<LabelFacet, string>> = {};
  let any = false;
  for (const facet of LABEL_FACETS) {
    const value = metaStr(meta, facet);
    if (value !== null) {
      facets[facet] = value;
      any = true;
    }
  }
  return any ? facets : undefined;
}

async function visualArchetypes(db: Db, ownerId: UserId, k = DEFAULT_VISUAL_K): Promise<VisualArchetype[]> {
  const [avatars, cardFacets, captions] = await Promise.all([
    readOwnedAvatarVectors(db, ownerId),
    readOwnedCardFacets(db, ownerId),
    readOwnedCaptionRows(db, ownerId),
  ]);
  const genreTone = new Map(cardFacets.map((f) => [f.characterId, { genre: f.genre, tone: f.tone }]));
  const labels = new Map<CharacterId, VisualLabels>();
  const corpus = emptyFacetCounts();
  let corpusSize = 0;
  for (const cap of captions) {
    const facets = toVisualFacets(cap.captionMeta);
    const context = genreTone.get(cap.characterId);
    labels.set(cap.characterId, { genre: context?.genre ?? null, tone: context?.tone ?? null, facets });
    if (facets !== undefined) {
      bumpFacets(corpus, facets);
      corpusSize += 1;
    }
  }
  // A character with card facets but no caption row still contributes its CONTEXT chips.
  for (const [characterId, context] of genreTone) {
    if (!labels.has(characterId)) {
      labels.set(characterId, { ...context, facets: undefined });
    }
  }
  const out: VisualArchetype[] = [];
  for (const [, group] of groupByModel(avatars)) {
    // The baseline is the whole owner corpus, not this embedding space — a family is "more X than your
    // library", and which model embedded it is not part of that question.
    out.push(...labelClusters(accumulateClusters(group, labels, k), corpus, Math.max(corpusSize, 1), group[0]?.model ?? ""));
  }
  return out.sort((a, b) => b.size - a.size);
}
