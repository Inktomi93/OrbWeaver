// entry/compose/refinery — the refinery seam (R1 — docs/design/refinery-r0.md §9.3). Assembles the
// RefineryContext: db + the injected clock/id determinism seam + the bound `summarize` role thunk + the
// caller-scoped prose/preset resolvers (the distill rung, verbatim) + the four CHARACTER ops — the two
// persistence factories (card read + signal stamp; `characters.*` keeps one writer, F6) and the two
// service verbs (snapshot + update + the zero-write get) the apply path rides.

import type { ProseOverrides } from "@orb/contracts/prose";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import type { CharacterService } from "#domain/character";
import { createLoadOwnedCard, createStampRefinerySignals } from "#domain/character";
import type { RefineryService } from "#domain/refinery";
import { createRefineryService } from "#domain/refinery";
import { minter } from "./minter.ts";

export interface RefineryComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly roleClients: Pick<RoleClients, "summarize" | "summarizerModel">;
  readonly character: CharacterService;
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}

export function buildRefinery(deps: RefineryComposeDeps): RefineryService {
  const resolveUserProse = async (userId: UserId): Promise<ProseOverrides> => (await deps.loadUserSettings(userId)).prose;
  return createRefineryService({
    db: deps.db,
    now: deps.now,
    newRefinerySessionId: minter(ID_PREFIX.refinerySession),
    newRefineryRunId: minter(ID_PREFIX.refineryRun),
    summarize: deps.roleClients.summarize,
    summarizerModel: deps.roleClients.summarizerModel,
    resolveUserPresetParams: deps.resolveUserPresetParams,
    resolveUserProse,
    loadOwnedCard: createLoadOwnedCard({ db: deps.db }),
    stampRefinerySignals: createStampRefinerySignals({ db: deps.db }),
    snapshotCharacter: deps.character.snapshot,
    updateCharacter: deps.character.update,
    getCharacter: deps.character.get,
  });
}
