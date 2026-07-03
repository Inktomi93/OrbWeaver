// domain/discovery/verbs/compute-hub-scores — the four per-kind CSLS hubness passes (the `csls` workload).
// Computes `hub_score` (mean cosine to the K nearest SAME-TYPE neighbours) per vector and writes it back
// THROUGH the injected `embeddings.writeHubScores` seam — discovery computes the VALUES, embeddings owns the
// WRITE, search reads (the hub_score seam — `domains/memory.md` §8). NO `db.update` on a vector table here.
//
// LOAD-BEARING:
//   • CROSS-TENANT grouping (#5): hubness describes a vector SPACE, not a user — there is NO owner filter.
//     The group key is the space tag: `model` for character/segment/image; `(tier, model)` for digests (a
//     card and a chat segment have very different vector distributions).
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
import type { VectorTable } from "#domain/embeddings";
import type { ComputeHubScoresOptions } from "../contract/params";
import type { HubStats } from "../contract/results";
import type { ComputeHubScoresDeps, DiscoveryContext, DiscoveryService } from "../contract/service";
import {
  readCharacterHubVectors,
  readDigestHubVectors,
  readImageHubVectors,
  readSegmentHubVectors,
} from "../persistence/embed-store-reads";
import { collapseByHash } from "../substrate/collapse";
import { computeGroupHubs } from "../substrate/hub-math";

// A bare vector row a hub pass scores.
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

// Group rows by a string key (deterministic insertion order).
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

// Compute every group's hub scores (content-collapsed, CSLS top-K mean) and write them through the seam.
// Returns the rows scored + the groups processed. groupKeyOf is the SPACE partition (cross-tenant, #5).
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

/** Card hub scores — grouped per embedding space (`model`). */
export async function computeCharacterHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<HubStats> {
  const rows = await readCharacterHubVectors(db);
  return await runHubPass(rows, {
    table: "character_embeddings",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
}

/** Digest hub scores — grouped per `(tier, model)` (digests, esoteric #5). Returns rows scored. */
export async function computeDigestHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<number> {
  const rows = await readDigestHubVectors(db);
  const stats = await runHubPass(rows, {
    table: "chat_digests",
    groupKeyOf: (r) => `${r.tier} ${r.model}`,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** Segment hub scores — grouped per embedding space (`model`). Returns rows scored. */
export async function computeSegmentHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<number> {
  const rows = await readSegmentHubVectors(db);
  const stats = await runHubPass(rows, {
    table: "chat_segments",
    groupKeyOf: (r) => r.model,
    deps,
    opts,
  });
  return stats.rowsScored;
}

/** Image hub scores — grouped per embedding space (`model`); image↔image ONLY (#2). Returns rows scored. */
export async function computeImageHubScores(
  db: Db,
  deps: ComputeHubScoresDeps,
  opts: ComputeHubScoresOptions = {},
): Promise<number> {
  const rows = await readImageHubVectors(db);
  const stats = await runHubPass(rows, {
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
