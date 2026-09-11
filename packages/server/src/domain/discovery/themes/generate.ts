// domain/discovery/themes/generate — the emergent-theme pass (the `compute-themes` workload). Per
// (owner, level, embedding-space) k-means over SOLO digest embeddings (content-collapsed, full coverage),
// each name-worthy cluster LLM-named → `theme_clusters` + `digest_theme_assignments`. Group-room digests
// are excluded (they belong to the synthetic group character, not an owner's solo theme space).

import type { SummarizeInput } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { digestThemeAssignments, themeClusters } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, chunkRows, rowsPerInsert } from "@orb/db/kit";
import type { ThemeClusterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ComputeThemesOptions, ThemeLevel } from "../contract/params.ts";
import type { ThemeComputeStats } from "../contract/results.ts";
import type { ComputeThemesDeps, Summarize } from "../contract/service.ts";
import { readOwnedDigestVectors } from "../persistence/embed-store-reads.ts";
import { collapseByHash } from "../substrate/collapse.ts";
import { kmeans } from "../substrate/kmeans.ts";
import { backfillMsgMidAt } from "./backfill.ts";
import { parseThemeName } from "./utils.ts";

const DEFAULT_SEED = 1;
// A cluster must have at least this many FULL-space members to be worth naming (else stored with name null).
const MIN_NAME_SIZE = 2;
const NAME_KEYWORDS = 12;
const CLUSTER_COLS = 9;
const ASSIGN_COLS = 4;

const NAME_SYSTEM =
  "You name emergent themes in a roleplay library. Given the shared keywords of a cluster of scenes, reply with ONLY a concise 2-5 word theme name — no quotes, no punctuation, no explanation.";

type OwnedDigest = Awaited<ReturnType<typeof readOwnedDigestVectors>>[number];
type ClusterRow = typeof themeClusters.$inferInsert;
type AssignRow = typeof digestThemeAssignments.$inferInsert;

/** A built cluster before persistence. */
interface ClusterDraft {
  readonly ownerId: OwnedDigest["ownerId"];
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly model: string;
  readonly centroid: Float32Array;
  readonly memberDigestIds: OwnedDigest["digestId"][];
  readonly memberRows: OwnedDigest[];
}

function levelOf(tier: number): ThemeLevel {
  return tier === 0 ? "scene" : "arc";
}

function heuristicK(n: number): number {
  return Math.max(1, Math.round(Math.sqrt(n / 2)));
}

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

function buildDrafts(solo: readonly OwnedDigest[], opts: ComputeThemesOptions, seed: number): { drafts: ClusterDraft[]; owners: Set<string> } {
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

async function nameDrafts(drafts: readonly ClusterDraft[], summarize: Summarize): Promise<(string | null)[]> {
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
  // A provider fault PROPAGATES and aborts the whole pass — deliberate: a themes recompute is an atomic
  // replace, and half-named clusters written over the old set is worse than a workload row that says it failed.
  const result = await summarize(inputs);
  for (let t = 0; t < targets.length; t += 1) {
    const item = result.items[t];
    const idx = targets[t];
    if (item !== undefined && idx !== undefined) {
      names[idx] = parseThemeName(item.text);
    }
  }
  // A DEGRADE, not a fault: a reply short of `targets.length` items (or one that sanitizes to empty) leaves
  // those clusters at `name: null` — the same state a below-MIN_NAME_SIZE cluster gets, which the schema and
  // every reader already handle. The cluster keeps its members and centroid; only its label is missing.
  return names;
}

/**
 * Recompute EVERY owner's emergent themes — a full atomic replace of `theme_clusters` (the CASCADE clears
 * `digest_theme_assignments`, then both are reinserted). Standalone `(db, deps, opts?)` so the
 * `compute-themes` runner drives it without the whole service.
 */
export async function computeThemes(db: Db, deps: ComputeThemesDeps, opts: ComputeThemesOptions = {}): Promise<ThemeComputeStats> {
  const seed = opts.seed ?? DEFAULT_SEED;
  const all = await readOwnedDigestVectors(db, opts.ownerId);
  const solo = all.filter((r) => !r.isGroup);
  // NO INPUT ⇒ REFUSE BEFORE THE REPLACE (issue #166). This pass is an ATOMIC REPLACE: `replaceAll` deletes
  // the scope's `theme_clusters` (CASCADE takes the assignments) and reinserts what it just computed. With an
  // empty digest plane it therefore deleted every existing cluster and inserted nothing — a run that reported
  // `succeeded {scanned: 0, written: 0}` while DESTROYING the previous pass's output. A digest-less corpus is
  // not "themes with no members", it is a pass whose input does not exist yet; the caller turns
  // `digestsRead: 0` into the stated refusal. Deliberately BEFORE `buildDrafts` so no summarize call is spent
  // either.
  // The two counts are separate facts and the caller needs both: `digestsRead: 0` means the backfill never
  // ran, `soloDigestsRead: 0` with digests present means it ran over group rooms only. Reporting one number
  // let the second case land as a bare `{scanned: 0, written: 0}` success (issue #558).
  if (solo.length === 0) {
    return { ownersProcessed: 0, clustersWritten: 0, digestsAssigned: 0, digestsRead: all.length, soloDigestsRead: 0 };
  }
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

  await replaceAll(db, clusterRows, assignRows, opts.ownerId);
  // Stamps `msgMidAt` on the fresh assignments (written null in the replace batch) — tier-0 via the exact
  // segment span, tier-k via the injected memory tier-grid (deps.tier0RangeOf).
  await backfillMsgMidAt(db, deps.tier0RangeOf, opts.ownerId);
  return {
    ownersProcessed: owners.size,
    clustersWritten: clusterRows.length,
    digestsAssigned: assignRows.length,
    digestsRead: all.length,
    soloDigestsRead: solo.length,
  };
}

// Delete before insert, clusters before assignments (FK order); `ownerId` scopes the delete, omitted/null = delete-ALL.
// @orb-waive owner-scoped-writes(themeClusters): the un-scoped arm is the DELIBERATE box-wide rebuild (`ownerId` omitted/null — the admin/system regeneration of the whole analytics plane), and the per-owner arm one line down IS the owner predicate. No principal reaches this: `generateThemes` is a workload the enqueue already authorized, and the delete is always paired with the re-insert of what it just recomputed. Ends if a caller-supplied ownerId can ever be null/absent here.
async function replaceAll(db: Db, clusterRows: readonly ClusterRow[], assignRows: readonly AssignRow[], ownerId?: UserId | null): Promise<void> {
  const del = ownerId === undefined || ownerId === null ? db.delete(themeClusters) : db.delete(themeClusters).where(eq(themeClusters.ownerId, ownerId));
  const stmts: BatchStmt[] = [del];
  for (const chunk of chunkRows(clusterRows, rowsPerInsert(CLUSTER_COLS))) {
    stmts.push(db.insert(themeClusters).values(chunk));
  }
  for (const chunk of chunkRows(assignRows, rowsPerInsert(ASSIGN_COLS))) {
    stmts.push(db.insert(digestThemeAssignments).values(chunk));
  }
  await db.batch(batchMany(stmts));
}
