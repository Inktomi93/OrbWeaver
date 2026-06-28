// domain/discovery/themes/generate — the emergent-theme pass (the `compute-themes` workload). Per
// (owner, level, embedding-space) k-means over SOLO digest embeddings (k-means++ seeded, content-collapsed),
// every digest assigned (full coverage), each name-worthy cluster LLM-named via the injected `summarize`
// thunk → `theme_clusters` + `digest_theme_assignments`. discovery.md §"Emergent themes" + esoteric
// #3/#6/#13.
//
// LOAD-BEARING:
//   • SOLO only (#13): group-room digests (`is_group=1`) belong to the synthetic group character, not the
//     host's personal theme space — clustering them skews an owner's solo centroids. They are filtered out.
//   • content-collapse before clustering (#3): centroids are computed on the collapsed REP set, but `size`
//     (the name-worthiness gate + the stored count) is the FULL-space member count — a fork-of-50 collapsing
//     to one rep should still be a named theme.
//   • centroids are k-means-normalized (#6) and stored as the `vector32` rollup (a MEAN, not an embed call).
//
// FLAG[PD-39]: `digest_theme_assignments.msgMidAt` (the position-median story-time stamp) → the
// themeDrift wave (it powers themeDrift only; the column is nullable, so assignments write without it now).

import type { SummarizeInput } from "@orb/contracts/role-clients";
import type { BatchStmt, Db } from "@orb/db";
import {
  batchMany,
  chunkRows,
  digestThemeAssignments,
  rowsPerInsert,
  themeClusters,
} from "@orb/db";
import type { ThemeClusterId } from "@orb/kit/ids";
import type { ComputeThemesOptions, ThemeLevel } from "../contract/params";
import type { ThemeComputeStats } from "../contract/results";
import type { ComputeThemesDeps, Summarize } from "../contract/service";
import { readOwnedDigestVectors } from "../persistence/embed-store-reads";
import { collapseByHash } from "../substrate/collapse";
import { kmeans } from "../substrate/kmeans";
import { parseThemeName } from "./utils";

/** The default k-means++ seeding seed (overridable via opts.seed) — pins the clustering for reproducibility. */
const DEFAULT_SEED = 1;
/** A cluster must have at least this many FULL-space members to be worth naming (else stored with `name`
 *  null). Small singleton clusters are not handed to the (costly) summarize pass. */
const MIN_NAME_SIZE = 2;
/** How many of a cluster's most-frequent keywords feed the naming prompt. */
const NAME_KEYWORDS = 12;
/** theme_clusters insert column count (id, ownerId, level, clusterIdx, name, centroid, size, model, at). */
const CLUSTER_COLS = 9;
/** digest_theme_assignments insert column count (digestId, themeClusterId, msgMidAt, computedAt). */
const ASSIGN_COLS = 4;

const NAME_SYSTEM =
  "You name emergent themes in a roleplay library. Given the shared keywords of a cluster of scenes, reply with ONLY a concise 2-5 word theme name — no quotes, no punctuation, no explanation.";

type OwnedDigest = Awaited<ReturnType<typeof readOwnedDigestVectors>>[number];
type ClusterRow = typeof themeClusters.$inferInsert;
type AssignRow = typeof digestThemeAssignments.$inferInsert;

/** A built cluster before persistence — its owner/level/space address, the normalized centroid rollup, the
 *  full-space member digest ids, and the member rows (for keyword-based naming). */
interface ClusterDraft {
  readonly ownerId: OwnedDigest["ownerId"];
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly model: string;
  readonly centroid: Float32Array;
  readonly memberDigestIds: OwnedDigest["digestId"][];
  readonly memberRows: OwnedDigest[];
}

/** `scene` = tier-0 single-block digests; `arc` = tier-1+ cross-block syntheses. */
function levelOf(tier: number): ThemeLevel {
  return tier === 0 ? "scene" : "arc";
}

/** The cluster count heuristic √(n/2), clamped to ≥1 (overridable via opts.k). */
function heuristicK(n: number): number {
  return Math.max(1, Math.round(Math.sqrt(n / 2)));
}

/** Group rows by a string key (deterministic insertion order). */
function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [row]);
    } else {
      bucket.push(row);
    }
  }
  return groups;
}

/** The most-frequent keywords across a cluster's member digests (for the naming prompt). */
function topKeywords(rows: readonly OwnedDigest[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const kw of row.keywords) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, NAME_KEYWORDS)
    .map(([kw]) => kw);
}

/** Cluster ONE (owner, level, space) subgroup → its non-empty clusters (no clusterIdx yet — the caller
 *  assigns a running index within the (owner, level) partition). */
function clusterSubgroup(
  rows: readonly OwnedDigest[],
  k: number,
  seed: number,
): {
  centroid: Float32Array;
  memberDigestIds: OwnedDigest["digestId"][];
  memberRows: OwnedDigest[];
}[] {
  const { reps, repOf } = collapseByHash(
    rows,
    (r) => r.contentHash,
    (r) => r.digestId,
  );
  const { centroids, assignments } = kmeans(
    reps.map((r) => r.embedding),
    k,
    seed,
  );
  const builds = centroids.map((centroid) => ({
    centroid,
    memberDigestIds: [] as OwnedDigest["digestId"][],
    memberRows: [] as OwnedDigest[],
  }));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const repIdx = repOf[i];
    if (row === undefined || repIdx === undefined) {
      continue;
    }
    const build = builds[assignments[repIdx] ?? 0];
    if (build !== undefined) {
      build.memberDigestIds.push(row.digestId);
      build.memberRows.push(row);
    }
  }
  return builds.filter((b) => b.memberDigestIds.length > 0);
}

/** Build every cluster draft across all (owner, level, space) partitions (clusterIdx running per owner+level). */
function buildDrafts(
  solo: readonly OwnedDigest[],
  opts: ComputeThemesOptions,
  seed: number,
): { drafts: ClusterDraft[]; owners: Set<string> } {
  const drafts: ClusterDraft[] = [];
  const owners = new Set<string>();
  for (const [, levelGroup] of groupBy(solo, (r) => `${r.ownerId} ${levelOf(r.tier)}`)) {
    const first = levelGroup[0];
    if (first === undefined) {
      continue;
    }
    owners.add(first.ownerId);
    const level = levelOf(first.tier);
    let clusterIdx = 0;
    for (const [model, modelGroup] of groupBy(levelGroup, (r) => r.model)) {
      const k = opts.k ?? heuristicK(modelGroup.length);
      for (const build of clusterSubgroup(modelGroup, k, seed)) {
        drafts.push({ ownerId: first.ownerId, level, clusterIdx, model, ...build });
        clusterIdx += 1;
      }
    }
  }
  return { drafts, owners };
}

/** Name the name-worthy drafts (≥ {@link MIN_NAME_SIZE} members) in ONE batched `summarize` call; return a
 *  name (or null) index-aligned to `drafts`. */
async function nameDrafts(
  drafts: readonly ClusterDraft[],
  summarize: Summarize,
): Promise<(string | null)[]> {
  const names = new Array<string | null>(drafts.length).fill(null);
  const targets: number[] = [];
  const inputs: SummarizeInput[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i];
    if (draft !== undefined && draft.memberDigestIds.length >= MIN_NAME_SIZE) {
      targets.push(i);
      inputs.push({
        systemPrompt: NAME_SYSTEM,
        userPrompt: `Shared keywords: ${topKeywords(draft.memberRows).join(", ")}`,
      });
    }
  }
  if (inputs.length === 0) {
    return names;
  }
  const result = await summarize(inputs);
  for (let t = 0; t < targets.length; t += 1) {
    const item = result.items[t];
    const idx = targets[t];
    if (item !== undefined && idx !== undefined) {
      names[idx] = parseThemeName(item.text);
    }
  }
  return names;
}

/**
 * Recompute EVERY owner's emergent themes — a full atomic replace of `theme_clusters` (the CASCADE clears
 * `digest_theme_assignments`, then both are reinserted). Standalone `(db, deps, opts?)` so the
 * `compute-themes` runner drives it without the whole service.
 */
export async function computeThemes(
  db: Db,
  deps: ComputeThemesDeps,
  opts: ComputeThemesOptions = {},
): Promise<ThemeComputeStats> {
  const seed = opts.seed ?? DEFAULT_SEED;
  const all = await readOwnedDigestVectors(db);
  const solo = all.filter((r) => !r.isGroup);
  const { drafts, owners } = buildDrafts(solo, opts, seed);
  const names = await nameDrafts(drafts, deps.summarize);
  const computedAt = deps.now();

  const clusterRows: ClusterRow[] = [];
  const assignRows: AssignRow[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i];
    if (draft === undefined) {
      continue;
    }
    const id: ThemeClusterId = deps.newThemeClusterId();
    clusterRows.push({
      id,
      ownerId: draft.ownerId,
      level: draft.level,
      clusterIdx: draft.clusterIdx,
      name: names[i] ?? null,
      centroid: draft.centroid,
      size: draft.memberDigestIds.length,
      model: draft.model,
      computedAt,
    });
    for (const digestId of draft.memberDigestIds) {
      assignRows.push({ digestId, themeClusterId: id, msgMidAt: null, computedAt });
    }
  }

  await replaceAll(db, clusterRows, assignRows);
  return {
    ownersProcessed: owners.size,
    clustersWritten: clusterRows.length,
    digestsAssigned: assignRows.length,
  };
}

/** Atomic full replace: ONE `db.batch` of [delete-all clusters (CASCADE clears assignments), ...chunked
 *  cluster inserts, ...chunked assignment inserts] — clusters before assignments (the FK order). */
async function replaceAll(
  db: Db,
  clusterRows: readonly ClusterRow[],
  assignRows: readonly AssignRow[],
): Promise<void> {
  const stmts: BatchStmt[] = [db.delete(themeClusters)];
  for (const chunk of chunkRows(clusterRows, rowsPerInsert(CLUSTER_COLS))) {
    stmts.push(db.insert(themeClusters).values(chunk));
  }
  for (const chunk of chunkRows(assignRows, rowsPerInsert(ASSIGN_COLS))) {
    stmts.push(db.insert(digestThemeAssignments).values(chunk));
  }
  await db.batch(batchMany(stmts));
}
