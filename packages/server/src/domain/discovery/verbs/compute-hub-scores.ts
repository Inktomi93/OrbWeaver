// domain/discovery/verbs/compute-hub-scores — the four per-kind CSLS hubness passes (the `csls` workload).
// Computes `hub_score` (mean cosine to the K nearest SAME-TYPE neighbours) per vector and writes it back
// THROUGH the injected `embeddings.writeHubScores` seam — discovery computes the VALUES, embeddings owns the
// WRITE, search reads (the hub_score seam — `domains/memory.md` §8). NO `db.update` on a vector table here.
//
// LOAD-BEARING:
//   • OWNER-SCOPED, always (owner ruling): csls analyzes YOUR OWN library only — it NEVER compares against
//     another owner's vectors. Every pass runs per owner (SINGULAR = one owner; BULK = a fan-out over every
//     owner), and WITHIN an owner the group key is the space tag: `model` for character/segment/image;
//     `(tier, model)` for digests (a card and a chat segment have very different vector distributions).
//   • content-collapse before the all-pairs math (#3): byte-identical fork/import copies collapse to one rep
//     so they don't mutually inflate each other's top-K mean to ≈1; collapsed members INHERIT the rep's hub.
//   • dense-vs-streaming is `hub-math`'s concern (esoteric #1) — `writeHubScores` is a bulk UPDATE that
//     handles any batch size.
//   • image hub is image↔image ONLY (#2) — discovery stamps the column; `search` omits it on text→image.
//   • hub_score is advisory-STALE by design (#4): it is NOT auto-invalidated on a re-embed (a single-row
//     re-embed would force a full same-(type,model) recompute to be correct); the scheduled `csls` cadence
//     recomputes, and a stale score still demotes a near-everything vector roughly right. A vector write must
//     NEVER null it (embeddings owns that). If precise hubness ever becomes load-bearing, wire a
//     `hubness_dirty` flag + debounce-rebuild (noted, not built).
//
// The `compute*HubScores` are standalone `(db, deps, opts?)` exports (deps = `{ writeHubScores }`) so the
// `csls` runner drives them without the whole service. `CSLS_K` is re-exported for the runner's log line.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { VectorTable } from "#domain/embeddings";
import type { ComputeHubScoresOptions } from "../contract/params";
import type { HubStats } from "../contract/results";
import type { ComputeHubScoresDeps, DiscoveryContext, DiscoveryService } from "../contract/service";
import {
  distinctCharacterHubOwners,
  distinctDigestHubOwners,
  distinctImageHubOwners,
  distinctSegmentHubOwners,
  readCharacterHubVectors,
  readDigestHubVectors,
  readImageHubVectors,
  readSegmentHubVectors,
} from "../persistence/embed-store-reads";
import { collapseByHash } from "../substrate/collapse";
import { computeGroupHubs } from "../substrate/hub-math";

interface HubRow {
  readonly id: string;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

// One pre-computed hub-score update (the writeHubScores payload shape: keyed (id, model)).
interface HubUpdate {
  readonly id: string;
  readonly model: string;
  readonly hubScore: number;
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

// The owner set a hub pass runs over: `ownerId` set → just that owner (SINGULAR); omitted/null → every owner
// with rows in the table (the BULK per-owner FAN-OUT — never a cross-tenant whole-space read).
async function hubOwners(
  db: Db,
  ownerId: UserId | null | undefined,
  distinct: (db: Db) => Promise<UserId[]>,
): Promise<UserId[]> {
  if (ownerId === undefined || ownerId === null) {
    return await distinct(db);
  }
  return [ownerId];
}

// Run the hub pass for EACH owner separately (the owner-local hub space) and fold the counts — csls never
// compares one owner's vectors against another's (owner ruling). Sequential: each owner's writeHubScores is
// independent + a parallel fan-out would stampede the write seam.
async function fanOutHubPass<T extends HubRow>(
  owners: readonly UserId[],
  readForOwner: (ownerId: UserId) => Promise<T[]>,
  cfg: {
    readonly table: VectorTable;
    readonly groupKeyOf: (row: T) => string;
    readonly deps: ComputeHubScoresDeps;
    readonly opts: ComputeHubScoresOptions;
  },
): Promise<HubStats> {
  let rowsScored = 0;
  let groupsProcessed = 0;
  for (const owner of owners) {
    // biome-ignore lint/performance/noAwaitInLoops: a per-owner FAN-OUT — each owner's hub space is independent; sequential keeps the writeHubScores backpressure bounded (never a whole-store read).
    // biome-ignore lint/plugin/no-await-db-in-loop: the bulk csls fan-out is inherently per-owner (owner-local hubness); parallel would stampede the write seam.
    const stats = await runHubPass(await readForOwner(owner), cfg);
    rowsScored += stats.rowsScored;
    groupsProcessed += stats.groupsProcessed;
  }
  return { rowsScored, groupsProcessed };
}

// Compute every group's hub scores (content-collapsed, CSLS top-K mean) and write them through the seam.
// Returns the rows scored + the groups processed. groupKeyOf is the SPACE partition WITHIN one owner (#5).
async function runHubPass<T extends HubRow>(
  rows: readonly T[],
  cfg: {
    readonly table: VectorTable;
    readonly groupKeyOf: (row: T) => string;
    readonly deps: ComputeHubScoresDeps;
    readonly opts: ComputeHubScoresOptions;
  },
): Promise<HubStats> {
  const { table, groupKeyOf, deps, opts } = cfg;
  const updates: HubUpdate[] = [];
  const groups = groupBy(rows, groupKeyOf);
  for (const [, group] of groups) {
    const { reps, repOf } = collapseByHash(
      group,
      (r) => r.contentHash,
      (r) => r.id,
    );
    const hubs = computeGroupHubs(
      reps.map((r) => r.embedding),
      { k: opts.k, denseMax: opts.denseMax },
    );
    for (let i = 0; i < group.length; i += 1) {
      const row = group[i];
      const repIdx = repOf[i];
      if (row !== undefined && repIdx !== undefined) {
        updates.push({ id: row.id, model: row.model, hubScore: hubs[repIdx] ?? 0 });
      }
    }
  }
  if (updates.length > 0) {
    await deps.writeHubScores({ table, updates });
  }
  return { rowsScored: updates.length, groupsProcessed: groups.size };
}

/** Card hub scores — per owner (owner-local space), grouped per embedding space (`model`). SINGULAR = the
 *  caller's own cards; BULK (null) = a per-owner fan-out over every owner with card embeddings. */
export async function computeCharacterHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<HubStats> {
  const owners = await hubOwners(db, opts.ownerId, distinctCharacterHubOwners);
  return await fanOutHubPass(owners, (owner) => readCharacterHubVectors(db, owner), {
    table: "character_embeddings",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
}

/** Digest hub scores — per owner, grouped per `(tier, model)` (digests, esoteric #5). Returns rows scored. */
export async function computeDigestHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<number> {
  const owners = await hubOwners(db, opts.ownerId, distinctDigestHubOwners);
  const stats = await fanOutHubPass(owners, (owner) => readDigestHubVectors(db, owner), {
    table: "chat_digests",
    groupKeyOf: (r) => `${r.tier} ${r.model}`,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** Segment hub scores — per owner, grouped per embedding space (`model`). Returns rows scored. */
export async function computeSegmentHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<number> {
  const owners = await hubOwners(db, opts.ownerId, distinctSegmentHubOwners);
  const stats = await fanOutHubPass(owners, (owner) => readSegmentHubVectors(db, owner), {
    table: "chat_segments",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** Image hub scores — per owner, grouped per embedding space (`model`); image↔image ONLY (#2). Returns rows scored. */
export async function computeImageHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<number> {
  const owners = await hubOwners(db, opts.ownerId, distinctImageHubOwners);
  const stats = await fanOutHubPass(owners, (owner) => readImageHubVectors(db, owner), {
    table: "image_embeddings",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** The four hub-score verbs bound over the context — the `service.ts` wiring seam (the standalone functions
 *  above are what the `csls` runner calls directly; this binds them to `ctx.db` + the injected `writeHubScores`
 *  seam). The file hosts the 4 related per-kind passes (hubness is verbs + pure substrate, not a subsystem —
 *  it writes a column on EXISTING tables, no table of its own). */
export function createComputeHubScores(
  ctx: DiscoveryContext,
): Pick<
  DiscoveryService,
  | "computeCharacterHubScores"
  | "computeDigestHubScores"
  | "computeSegmentHubScores"
  | "computeImageHubScores"
> {
  const deps: ComputeHubScoresDeps = { writeHubScores: ctx.writeHubScores };
  return {
    computeCharacterHubScores: (opts) => computeCharacterHubScores(ctx.db, deps, opts),
    computeDigestHubScores: (opts) => computeDigestHubScores(ctx.db, deps, opts),
    computeSegmentHubScores: (opts) => computeSegmentHubScores(ctx.db, deps, opts),
    computeImageHubScores: (opts) => computeImageHubScores(ctx.db, deps, opts),
  };
}
