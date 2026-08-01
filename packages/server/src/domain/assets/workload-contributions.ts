// domain/assets — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Three kinds: the CAS maintenance passes.
//
// This file also RE-HOMES a defect: the `assets-backfill` GATHER (a `db.select` over `characters` plus a
// per-row CAS probe) used to run at the ENTRY tier, in `compose/runner-env.ts`, purely because the old hub
// demanded a count-only op shape. Domain reads belong in the domain — they are here now, and the compose
// file contains no `db.select` at all.

import type { FsckReport } from "@orb/contracts/assets";
import type { MaintenanceResult } from "@orb/contracts/workloads";
import { emptyWorkloadParams, maintenanceWorkloadParams } from "@orb/contracts/workloads";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { WorkloadContribution } from "#domain/workloads";
import type { AssetsWorkloadDeps } from "./contract/service";

type AssetsContributions = readonly [WorkloadContribution<"assets-backfill">, WorkloadContribution<"assets-gc">, WorkloadContribution<"assets-fsck">];

/** The staged cards an avatar backfill would re-pair: characters with a recorded card but no linked avatar,
 *  whose card blob is still in the CAS. Grouped per owner (the backfill verb is per-owner). */
async function gatherStagedCards(
  deps: AssetsWorkloadDeps,
  ownerId: UserId | null,
): Promise<Map<UserId, { characterId: CharacterId; bytes: Uint8Array; importHash: string }[]>> {
  const scope =
    ownerId === null
      ? and(isNull(characters.avatarAssetId), isNotNull(characters.importHash))
      : and(eq(characters.ownerId, ownerId), isNull(characters.avatarAssetId), isNotNull(characters.importHash));
  const rows = await deps.db.select({ id: characters.id, ownerId: characters.ownerId, importHash: characters.importHash }).from(characters).where(scope);

  const byOwner = new Map<UserId, { characterId: CharacterId; bytes: Uint8Array; importHash: string }[]>();
  for (const row of rows) {
    const importHash = row.importHash;
    // biome-ignore lint/performance/noAwaitInLoops: per-character CAS probe during a maintenance-time gather — not a hot path.
    if (importHash === null || !(await deps.cas.exists(row.ownerId, importHash))) {
      continue;
    }
    const bytes = await deps.cas.read(row.ownerId, importHash);
    const cards = byOwner.get(row.ownerId) ?? [];
    cards.push({ characterId: row.id, bytes, importHash });
    byOwner.set(row.ownerId, cards);
  }
  return byOwner;
}

export function createAssetsWorkloadContributions(deps: AssetsWorkloadDeps): AssetsContributions {
  return [
    {
      kind: "assets-backfill",
      params: maintenanceWorkloadParams,
      // Per-candidate CAS probes over the whole character table — medium, and never latency-sensitive.
      lane: "sweep",
      // Re-pairing an already-paired avatar is a no-op, so a retry re-runs the whole pass safely.
      resume: "idempotent-restart",
      run: async (ctx, params, report, _signal): Promise<MaintenanceResult> => {
        const dryRun = params.dryRun ?? false;
        report({ message: dryRun ? "assets backfill (dry run)" : "backfilling avatars" });
        const byOwner = await gatherStagedCards(deps, ctx.ownerId);
        let scanned = 0;
        let changed = 0;
        for (const [owner, cards] of byOwner) {
          // biome-ignore lint/performance/noAwaitInLoops: sequential per-owner fan-out (the verb is per-owner) — maintenance-time, not a hot path.
          const result = await deps.assets.backfillAvatars({ ownerId: owner, cards, dryRun });
          scanned += result.scanned;
          changed += result.linked;
        }
        return { scanned, changed, dryRun };
      },
    },
    {
      kind: "assets-gc",
      params: maintenanceWorkloadParams,
      // A whole-CAS mark-sweep that DELETES blobs — potentially long, and two concurrent GCs are a
      // corruption class (the bulk single-active lock is load-bearing, not a nicety).
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (_ctx, params, report, signal): Promise<MaintenanceResult> => {
        const dryRun = params.dryRun ?? false;
        report({ message: dryRun ? "assets GC (dry run)" : "collecting garbage" });
        const result = await deps.assets.collectGarbage({ dryRun, signal });
        return { scanned: result.scanned, changed: result.reclaimed, dryRun };
      },
    },
    {
      kind: "assets-fsck",
      params: emptyWorkloadParams,
      // A read-only integrity walk — mutates nothing; the REPORT is the product of the run.
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (_ctx, _params, report, signal): Promise<FsckReport> => {
        report({ message: "checking asset integrity" });
        const result = await deps.assets.fsck({ signal });
        return { danglingRows: result.danglingRows, corruptBlobs: result.corruptBlobs, orphanBlobs: result.orphanBlobs };
      },
    },
  ];
}
