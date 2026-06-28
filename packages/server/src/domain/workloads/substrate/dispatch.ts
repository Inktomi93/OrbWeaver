// domain/workloads/substrate/dispatch — `RUNNERS: { [K in WorkloadKind]: Runner<K> }`, the §7.5 GOLD
// STANDARD exhaustiveness pin (workloads.md "the WorkloadKind mapped-type Record"). The mapped type forces
// an entry for EVERY kind: add a member to `WORKLOAD_KINDS` without its runner here and `tsc` goes RED at
// this object. Do NOT change its shape. It depends on `contract/runner` for the TYPE and on each `runners/*`
// for the VALUE — no edge from a runner back to the engine, so no cycle (invariant #8).
//
// HOME NOTE (born-compliant vs doc): workloads.md sketches this in `engine/`, but `domain-no-cross-subsystem`
// (dep-cruiser) forbids one named subsystem (`engine/`) importing another (`runners/`) by VALUE — the
// sanctioned seam for cross-subsystem coordination is `substrate/` (a fixed slot, exempt as the FROM side).
// So the dispatch table homes HERE; `engine/runner.ts` imports `RUNNERS` from substrate (engine→substrate is
// allowed; substrate→runners is allowed). The gate wins over the doc's illustrative layout.
//
// The index-through-the-union call (a `RUNNERS[kind]` whose `kind` is a widened union) cannot narrow — that
// two-cast bridge is `dispatchAndRun` in `engine/runner.ts` (the single sanctioned escape); it is NOT here.

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { Runner } from "../contract/runner";
import { assetsBackfillRunner } from "../runners/assets-backfill";
import { computeCooccurrenceRunner } from "../runners/compute-cooccurrence";
import { computeThemesRunner } from "../runners/compute-themes";
import { cslsRunner } from "../runners/csls";
import { distillCharactersRunner } from "../runners/distill-characters";
import { embedAssetsRunner } from "../runners/embed-assets";
import { embedCorpusRunner } from "../runners/embed-corpus";
import { findDuplicatesRunner } from "../runners/find-duplicates";
import { groupCharacterBackfillRunner } from "../runners/group-character-backfill";
import { importStRunner } from "../runners/import-st";
import { memoryBackfillRunner } from "../runners/memory-backfill";
import { reconcileStatsRunner } from "../runners/reconcile-stats";
import { reconcileWorldStateRunner } from "../runners/reconcile-world-state";
import { refreshModelCatalogRunner } from "../runners/refresh-model-catalog";

/** The exhaustive kind → runner dispatch table. The `{ [K in WorkloadKind]: Runner<K> }` mapped type is the
 *  compile-time checklist for adding a kind (workloads.md §7.5). The engine treats every kind uniformly. */
export const RUNNERS: { [K in WorkloadKind]: Runner<K> } = {
  "embed-corpus": embedCorpusRunner,
  "embed-assets": embedAssetsRunner,
  "distill-characters": distillCharactersRunner,
  "compute-themes": computeThemesRunner,
  "memory-backfill": memoryBackfillRunner,
  "group-character-backfill": groupCharacterBackfillRunner,
  "compute-cooccurrence": computeCooccurrenceRunner,
  "find-duplicates": findDuplicatesRunner,
  csls: cslsRunner,
  "assets-backfill": assetsBackfillRunner,
  "import-st": importStRunner,
  "reconcile-stats": reconcileStatsRunner,
  "refresh-model-catalog": refreshModelCatalogRunner,
  "reconcile-world-state": reconcileWorldStateRunner,
};
