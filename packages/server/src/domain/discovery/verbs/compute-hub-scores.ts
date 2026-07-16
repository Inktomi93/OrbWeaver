// domain/discovery/verbs/compute-hub-scores — the four per-kind CSLS hubness passes (the `csls` workload).
// Computes `hub_score` (mean cosine to the K nearest same-type neighbours) per vector, written back THROUGH
// the injected `embeddings.writeHubScores` seam — discovery computes the values, embeddings owns the write.
// OWNER-SCOPED always: csls never compares one owner's vectors against another's.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { VectorTable } from "#domain/embeddings";
import type { DiscoveryContext } from "../context";
import type { ComputeHubScoresOptions } from "../contract/params";
import type { HubStats } from "../contract/results";
import type { ComputeHubScoresDeps, DiscoveryService } from "../contract/service";
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

async function hubOwners(db: Db, ownerId: UserId | null | undefined, distinct: (db: Db) => Promise<UserId[]>): Promise<UserId[]> {
  if (ownerId === undefined || ownerId === null) {
    return await distinct(db);
  }
  return [ownerId];
}

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
    // @orb-gate-ignore no-await-db-in-loop owner-local hubness — parallel would stampede the write seam.
    // biome-ignore lint/performance/noAwaitInLoops: per-owner fan-out — sequential keeps writeHubScores backpressure bounded.
    const stats = await runHubPass(await readForOwner(owner), cfg);
    rowsScored += stats.rowsScored;
    groupsProcessed += stats.groupsProcessed;
  }
  return { rowsScored, groupsProcessed };
}

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

/** Card hub scores, grouped per embedding space (`model`). */
export async function computeCharacterHubScores(db: Db, deps: ComputeHubScoresDeps, opts: ComputeHubScoresOptions = {}): Promise<HubStats> {
  const owners = await hubOwners(db, opts.ownerId, distinctCharacterHubOwners);
  return await fanOutHubPass(owners, (owner) => readCharacterHubVectors(db, owner), {
    table: "character_embeddings",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
}

/** Digest hub scores, grouped per `(tier, model)`. */
export async function computeDigestHubScores(db: Db, deps: ComputeHubScoresDeps, opts: ComputeHubScoresOptions = {}): Promise<number> {
  const owners = await hubOwners(db, opts.ownerId, distinctDigestHubOwners);
  const stats = await fanOutHubPass(owners, (owner) => readDigestHubVectors(db, owner), {
    table: "chat_digests",
    groupKeyOf: (r) => `${r.tier} ${r.model}`,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** Segment hub scores, grouped per embedding space (`model`). */
export async function computeSegmentHubScores(db: Db, deps: ComputeHubScoresDeps, opts: ComputeHubScoresOptions = {}): Promise<number> {
  const owners = await hubOwners(db, opts.ownerId, distinctSegmentHubOwners);
  const stats = await fanOutHubPass(owners, (owner) => readSegmentHubVectors(db, owner), {
    table: "chat_segments",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** Image hub scores, grouped per embedding space (`model`); image↔image only. */
export async function computeImageHubScores(db: Db, deps: ComputeHubScoresDeps, opts: ComputeHubScoresOptions = {}): Promise<number> {
  const owners = await hubOwners(db, opts.ownerId, distinctImageHubOwners);
  const stats = await fanOutHubPass(owners, (owner) => readImageHubVectors(db, owner), {
    table: "image_embeddings",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** The four hub-score verbs bound over the context (the `csls` runner calls the standalone functions above directly). */
export function createComputeHubScores(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "computeCharacterHubScores" | "computeDigestHubScores" | "computeSegmentHubScores" | "computeImageHubScores"> {
  const deps: ComputeHubScoresDeps = { writeHubScores: ctx.writeHubScores };
  return {
    computeCharacterHubScores: (opts) => computeCharacterHubScores(ctx.db, deps, opts),
    computeDigestHubScores: (opts) => computeDigestHubScores(ctx.db, deps, opts),
    computeSegmentHubScores: (opts) => computeSegmentHubScores(ctx.db, deps, opts),
    computeImageHubScores: (opts) => computeImageHubScores(ctx.db, deps, opts),
  };
}
