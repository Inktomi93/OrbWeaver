// domain/workloads/substrate/dispatch — RUNNERS: { [K in WorkloadKind]: Runner<K> }, the exhaustiveness
// pin. Add a kind without its runner here and tsc goes red at this object; do not change its shape.
//
// Homes here (not engine/) because dep-cruiser forbids one named subsystem (engine/) importing another
// (runners/) by value — substrate/ is the sanctioned cross-subsystem seam.

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { Runner } from "../contract/runner";
import { assetsBackfillRunner } from "../runners/assets-backfill";
import { assetsFsckRunner } from "../runners/assets-fsck";
import { assetsGcRunner } from "../runners/assets-gc";
import { computeCooccurrenceRunner } from "../runners/compute-cooccurrence";
import { computeThemesRunner } from "../runners/compute-themes";

import { cslsRunner } from "../runners/csls";
import { databankIngestRunner } from "../runners/databank-ingest";
import { databankReindexRunner } from "../runners/databank-reindex";
import { distillCharactersRunner } from "../runners/distill-characters";

import { findDuplicatesRunner } from "../runners/find-duplicates";
import { groupCharacterBackfillRunner } from "../runners/group-character-backfill";
import { importBundleRunner } from "../runners/import-bundle";
import { importStRunner } from "../runners/import-st";
import { indexRunner } from "../runners/index";
import { memoryBackfillRunner } from "../runners/memory-backfill";
import { reconcileStatsRunner } from "../runners/reconcile-stats";
import { reconcileWorldStateRunner } from "../runners/reconcile-world-state";
import { refreshModelCatalogRunner } from "../runners/refresh-model-catalog";


export const RUNNERS: { [K in WorkloadKind]: Runner<K> } = {
  index: indexRunner,
  "distill-characters": distillCharactersRunner,
  "compute-themes": computeThemesRunner,
  "memory-backfill": memoryBackfillRunner,
  "group-character-backfill": groupCharacterBackfillRunner,
  "compute-cooccurrence": computeCooccurrenceRunner,
  "find-duplicates": findDuplicatesRunner,
  csls: cslsRunner,
  "assets-backfill": assetsBackfillRunner,
  "assets-gc": assetsGcRunner,
  "assets-fsck": assetsFsckRunner,
  "import-st": importStRunner,
  "import-bundle": importBundleRunner,
  "reconcile-stats": reconcileStatsRunner,
  "refresh-model-catalog": refreshModelCatalogRunner,
  "reconcile-world-state": reconcileWorldStateRunner,

  "databank-ingest": databankIngestRunner,
  "databank-reindex": databankReindexRunner,

};
