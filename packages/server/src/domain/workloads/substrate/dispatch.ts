// domain/workloads/substrate/dispatch — `RUNNERS: { [K in WorkloadKind]: Runner<K> }`, the §7.5 GOLD
// STANDARD exhaustiveness pin (the WorkloadKind mapped-type Record). The mapped type forces
// an entry for EVERY kind: add a member to `WORKLOAD_KINDS` without its runner here and `tsc` goes RED at
// this object. Do NOT change its shape. It depends on `contract/runner` for the TYPE and on each `runners/*`
// for the VALUE — no edge from a runner back to the engine, so no cycle.
//
// HOME NOTE: `domain-no-cross-subsystem` (dep-cruiser) forbids one named
// subsystem (`engine/`) importing another (`runners/`) by VALUE — the
// sanctioned seam for cross-subsystem coordination is `substrate/` (a fixed slot, exempt as the FROM side).
// So the dispatch table homes HERE (not `engine/`); `engine/runner.ts` imports `RUNNERS` from substrate
// (engine→substrate is allowed; substrate→runners is allowed).
//
// The index-through-the-union call (a `RUNNERS[kind]` whose `kind` is a widened union) cannot narrow — that
// two-cast bridge is `dispatchAndRun` in `engine/runner.ts` (the single sanctioned escape); it is NOT here.

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { Runner } from "../contract/runner";
import { assetsBackfillRunner } from "../runners/assets-backfill";
import { computeCooccurrenceRunner } from "../runners/compute-cooccurrence";
import { computeThemesRunner } from "../runners/compute-themes";
import { crewCardEvolutionRunner } from "../runners/crew-card-evolution";
import { crewDirectorRunner } from "../runners/crew-director";
import { crewLorebookKeeperRunner } from "../runners/crew-lorebook-keeper";
import { crewProseAuditRunner } from "../runners/crew-prose-audit";
import { cslsRunner } from "../runners/csls";
import { databankIngestRunner } from "../runners/databank-ingest";
import { databankReindexRunner } from "../runners/databank-reindex";
import { distillCharactersRunner } from "../runners/distill-characters";
import { embedAssetsRunner } from "../runners/embed-assets";
import { embedCorpusRunner } from "../runners/embed-corpus";
import { expressionsSpriteSheetRunner } from "../runners/expressions-sprite-sheet";
import { findDuplicatesRunner } from "../runners/find-duplicates";
import { groupCharacterBackfillRunner } from "../runners/group-character-backfill";
import { importStRunner } from "../runners/import-st";
import { memoryBackfillRunner } from "../runners/memory-backfill";
import { reconcileStatsRunner } from "../runners/reconcile-stats";
import { reconcileWorldStateRunner } from "../runners/reconcile-world-state";
import { refreshModelCatalogRunner } from "../runners/refresh-model-catalog";
import { rpgDirectorRunner } from "../runners/rpg-director";
import { rpgIllustrationRunner } from "../runners/rpg-illustration";
import { rpgLorebookUpkeepRunner } from "../runners/rpg-lorebook-upkeep";
import { rpgNpcPortraitRunner } from "../runners/rpg-npc-portrait";
import { rpgRecapRunner } from "../runners/rpg-recap";
import { rpgRecruitCardRunner } from "../runners/rpg-recruit-card";
import { rpgSceneDistillRunner } from "../runners/rpg-scene-distill";
import { rpgScenePlanRunner } from "../runners/rpg-scene-plan";
import { rpgSessionDistillRunner } from "../runners/rpg-session-distill";
import { rpgWorldGenRunner } from "../runners/rpg-world-gen";

/** The exhaustive kind → runner dispatch table. The `{ [K in WorkloadKind]: Runner<K> }` mapped type is the
 *  compile-time checklist for adding a kind (§7.5). The engine treats every kind uniformly. */
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
  "crew-lorebook-keeper": crewLorebookKeeperRunner,
  "crew-card-evolution": crewCardEvolutionRunner,
  "crew-director": crewDirectorRunner,
  "crew-prose-audit": crewProseAuditRunner,
  "expressions-sprite-sheet": expressionsSpriteSheetRunner,
  "databank-ingest": databankIngestRunner,
  "databank-reindex": databankReindexRunner,
  "rpg-world-gen": rpgWorldGenRunner,
  "rpg-recap": rpgRecapRunner,
  "rpg-session-distill": rpgSessionDistillRunner,
  "rpg-director": rpgDirectorRunner,
  "rpg-lorebook-upkeep": rpgLorebookUpkeepRunner,
  "rpg-illustration": rpgIllustrationRunner,
  "rpg-npc-portrait": rpgNpcPortraitRunner,
  "rpg-scene-plan": rpgScenePlanRunner,
  "rpg-scene-distill": rpgSceneDistillRunner,
  "rpg-recruit-card": rpgRecruitCardRunner,
};
