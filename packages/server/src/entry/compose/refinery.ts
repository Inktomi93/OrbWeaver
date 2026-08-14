// entry/compose/refinery — the refinery seam (R1 — docs/design/refinery-r0.md §9.3). Assembles the
// RefineryContext: db + the injected clock/id determinism seam + the bound `summarize` role thunk + the
// caller-scoped prose/preset resolvers (the distill rung, verbatim) + the four CHARACTER ops — the two
// persistence factories (card read + signal stamp; `characters.*` keeps one writer, F6) and the two
// service verbs (snapshot + update + the zero-write get) the apply path rides.
//
// Both halves close over the ONE per-user freshness plane (`publishUserEvent`, the house injected-emit
// pattern — the domain never reaches at transport): the service verbs emit `refineryChanged`, and the sweep
// fans `charactersChanged` once per stamped owner at its terminal (survey F1/F2).
//
// It also raises the domain's WORKLOAD deps (R4): the `refine-score-sweep` library pass closes over a
// DIFFERENT, smaller bundle than the service (no session minters, no clock, none of the apply-path ops) —
// so the two are assembled side by side here rather than the queue reaching into the service.

import type { ProseOverrides } from "@orb/contracts/prose";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import type { CharacterService } from "#domain/character";
import { createListRefineryScoreTargets, createLoadOwnedCard, createStampRefinerySignals } from "#domain/character";
import type { RefineryService, RefineryWorkloadDeps } from "#domain/refinery";
import { createRefineryService } from "#domain/refinery";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import { minter } from "./minter.ts";

export interface RefineryComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly roleClients: Pick<RoleClients, "summarize" | "summarizerModel" | "summarizerContextTokens">;
  readonly character: CharacterService;
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}

/** The refinery seam's two halves: the principal-taking SERVICE (tRPC) and the principal-less WORKLOAD
 *  deps (the queue's own actor). */
export interface RefineryCompose {
  readonly refinery: RefineryService;
  readonly refineryWorkloads: RefineryWorkloadDeps;
}

export function buildRefinery(deps: RefineryComposeDeps): RefineryCompose {
  const resolveUserProse = async (userId: UserId): Promise<ProseOverrides> => (await deps.loadUserSettings(userId)).prose;
  const stampRefinerySignals = createStampRefinerySignals({ db: deps.db });
  const refinery = createRefineryService({
    db: deps.db,
    now: deps.now,
    newRefinerySessionId: minter(ID_PREFIX.refinerySession),
    newRefineryRunId: minter(ID_PREFIX.refineryRun),
    newRefinerySchemaId: minter(ID_PREFIX.refinerySchema),
    summarize: deps.roleClients.summarize,
    summarizerModel: deps.roleClients.summarizerModel,
    summarizerContextTokens: deps.roleClients.summarizerContextTokens,
    resolveUserPresetParams: deps.resolveUserPresetParams,
    resolveUserProse,
    emitUserEvent: publishUserEvent,
    loadOwnedCard: createLoadOwnedCard({ db: deps.db }),
    stampRefinerySignals,
    snapshotCharacter: deps.character.snapshot,
    updateCharacter: deps.character.update,
    getCharacter: deps.character.get,
    duplicateCharacter: deps.character.duplicate,
  });
  return {
    refinery,
    refineryWorkloads: {
      summarize: deps.roleClients.summarize,
      summarizerContextTokens: deps.roleClients.summarizerContextTokens,
      resolveUserPresetParams: deps.resolveUserPresetParams,
      resolveUserProse,
      listRefineryScoreTargets: createListRefineryScoreTargets({ db: deps.db }),
      stampRefinerySignals,
      emitUserEvent: publishUserEvent,
    },
  };
}
