// Compose service and workload authority separately; both share live bindings and one prose resolver.

import type { DatabaseHandle } from "@orb/db/wiring";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { CharacterService } from "#domain/character";
import {
  createCountRefineryScoreTargets,
  createDeleteSnapshot,
  createListRefineryScoreTargets,
  createLoadOwnedCard,
  createStampRefinerySignals,
} from "#domain/character";
import type { RefineryContext, RefineryService, RefineryWorkloadDeps, ResolveStructuredBinding } from "#domain/refinery";
import { createPlanSchema, createRefineryService, isScoreSweepReady } from "#domain/refinery";
import type { SettingsService } from "#domain/settings";
import { createResolveUserProse } from "#domain/settings";
import type { LiveBuses } from "#transport/trpc";

import { minter } from "./minter.ts";

// @orb-waive no-inline-package-interface(RefineryComposeDeps): baselined when the gate landed; burn-down item 952.
/** Graph inputs; the refinery owns draft planning and settings owns the prose projection. */
export interface RefineryComposeDeps {
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];

  readonly idSource?: IdSource;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly resolveStructuredBinding: ResolveStructuredBinding;
  readonly character: Pick<CharacterService, "snapshot" | "update" | "get" | "duplicate">;
  readonly resolveUtilityPresetParams: RefineryContext["resolveUtilityPresetParams"];
  readonly loadUserSettings: SettingsService["loadUserSettings"];
}

// @orb-waive no-inline-package-interface(RefineryCompose): baselined when the gate landed; burn-down item 952.
/** Service authority and the smaller, session-less workload bundle remain separate. */
export interface RefineryCompose {
  readonly refinery: RefineryService;
  readonly refineryWorkloads: RefineryWorkloadDeps;
}

export function buildRefinery(deps: RefineryComposeDeps): RefineryCompose {
  const resolveUserProse = createResolveUserProse((userId) => deps.loadUserSettings(userId));

  const stampRefinerySignals = createStampRefinerySignals({ db: deps.db });
  const refinery = createRefineryService({
    db: deps.db,
    now: deps.now,
    newRefinerySessionId: minter(ID_PREFIX.refinerySession, deps.idSource),
    newRefineryRunId: minter(ID_PREFIX.refineryRun, deps.idSource),
    newRefinerySchemaId: minter(ID_PREFIX.refinerySchema, deps.idSource),
    roleClientsFor: deps.roleClientsFor,
    resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
    resolveUserProse,
    planSchema: createPlanSchema({ resolveStructuredBinding: deps.resolveStructuredBinding, resolveUtilityPresetParams: deps.resolveUtilityPresetParams }),
    emitUserEvent: deps.emitUserEvent,
    loadOwnedCard: createLoadOwnedCard({ db: deps.db }),
    stampRefinerySignals,
    snapshotCharacter: deps.character.snapshot,
    deleteSnapshot: createDeleteSnapshot({ db: deps.db }),
    updateCharacter: deps.character.update,
    getCharacter: deps.character.get,
    duplicateCharacter: deps.character.duplicate,
  });
  return {
    refinery,
    refineryWorkloads: {
      roleClientsFor: deps.roleClientsFor,
      resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
      resolveUserProse,
      listRefineryScoreTargets: createListRefineryScoreTargets({ db: deps.db }),
      countRefineryScoreTargets: createCountRefineryScoreTargets({ db: deps.db, isReady: isScoreSweepReady }),
      stampRefinerySignals,
      emitUserEvent: deps.emitUserEvent,
    },
  };
}
