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
import { crewCardEvolutionRunner } from "../runners/crew-card-evolution";
import { crewDirectorRunner } from "../runners/crew-director";
import { crewLorebookKeeperRunner } from "../runners/crew-lorebook-keeper";
import { crewProseAuditRunner } from "../runners/crew-prose-audit";
import { cslsRunner } from "../runners/csls";
import { databankIngestRunner } from "../runners/databank-ingest";
import { databankReindexRunner } from "../runners/databank-reindex";
import { distillCharactersRunner } from "../runners/distill-characters";
import { expressionsSpriteSheetRunner } from "../runners/expressions-sprite-sheet";
import { findDuplicatesRunner } from "../runners/find-duplicates";
import { groupCharacterBackfillRunner } from "../runners/group-character-backfill";
import { importBundleRunner } from "../runners/import-bundle";
import { importStRunner } from "../runners/import-st";
import { indexRunner } from "../runners/index";
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
