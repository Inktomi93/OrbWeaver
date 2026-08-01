// domain/workloads/substrate/dispatch — TRANSITIONAL (the junk-drawer exit). The remaining `runners/`,
// keyed by kind, consumed ONLY by `shim-contributions.ts` (which adapts them onto the contribution seam the
// engine now dispatches through). The exhaustiveness pin has MOVED to `WorkloadContributions` at compose.
//
// Homes here (not engine/) because dep-cruiser forbids one named subsystem (engine/) importing another
// (runners/) by value — substrate/ is the sanctioned cross-subsystem seam.

import type { Runner, ShimmedKind } from "../contract/runner";

import { assetsBackfillRunner } from "../runners/assets-backfill";
import { assetsFsckRunner } from "../runners/assets-fsck";
import { assetsGcRunner } from "../runners/assets-gc";
import { databankIngestRunner } from "../runners/databank-ingest";
import { databankReindexRunner } from "../runners/databank-reindex";
import { groupCharacterBackfillRunner } from "../runners/group-character-backfill";
import { importBundleRunner } from "../runners/import-bundle";
import { importStRunner } from "../runners/import-st";
import { memoryBackfillRunner } from "../runners/memory-backfill";
import { reconcileWorldStateRunner } from "../runners/reconcile-world-state";

/** The kinds whose ownership move has NOT landed yet — this map shrinks to nothing and is deleted with
 *  `runners/`. A moved kind is absent here and present as a `WorkloadContribution` in its owning domain. */
export const RUNNERS = {
  "memory-backfill": memoryBackfillRunner,
  "group-character-backfill": groupCharacterBackfillRunner,
  "assets-backfill": assetsBackfillRunner,
  "assets-gc": assetsGcRunner,
  "assets-fsck": assetsFsckRunner,
  "import-st": importStRunner,
  "import-bundle": importBundleRunner,
  "reconcile-world-state": reconcileWorldStateRunner,
  "databank-ingest": databankIngestRunner,
  "databank-reindex": databankReindexRunner,
} as const satisfies { [K in ShimmedKind]: Runner<K> };
