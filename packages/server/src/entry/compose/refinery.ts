// entry/compose/refinery — the refinery seam. Assembles the
// RefineryContext: db + the injected clock/id determinism seam + the per-funder role-client binder + the
// caller-scoped prose/preset resolvers (the distill rung, verbatim) + the CHARACTER ops — three
// persistence factories (card read, signal stamp, and the #1551 snapshot retraction; `characters.*` keeps
// one writer, F6) and the three service verbs (snapshot + update + the zero-write get) the apply path rides.
//
// Both halves close over the ONE per-user freshness plane (`publishUserEvent`, the house injected-emit
// pattern — the domain never reaches at transport): the service verbs emit `refineryChanged`, and the sweep
// fans `charactersChanged` once per stamped owner at its terminal (survey F1/F2).
//
// It also raises the domain's WORKLOAD deps (R4): the `refine-score-sweep` library pass closes over a
// DIFFERENT, smaller bundle than the service (no session minters, no clock, none of the apply-path ops) —
// so the two are assembled side by side here rather than the queue reaching into the service.

import type { Principal } from "@orb/contracts/identity";
import { canFund } from "@orb/contracts/inference";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { RefinerySchemaPlan } from "@orb/contracts/refinery";
import { schemaPlanReasonOf } from "@orb/contracts/refinery";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { InferenceRuntime, Resolved, RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import { NoConnectionError, structuredFitFor } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { WireReady } from "@orb/kit/json-schema";
import type { CharacterService } from "#domain/character";
import { createDeleteSnapshot, createListRefineryScoreTargets, createLoadOwnedCard, createStampRefinerySignals } from "#domain/character";
import type { RefineryService, RefineryWorkloadDeps } from "#domain/refinery";
import { createRefineryService } from "#domain/refinery";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import { minter } from "./minter.ts";

export interface RefineryComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  /** The per-FUNDER role-client binder (§8.5b) — every refinery pass is `structured` on the card owner's (or
   *  the sweep's acting user's) own `summarize` binding. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  /** The owner's bound `structured` connection, resolved WITHOUT the background-work check the role clients apply
   *  (`null` when none is bound), so the editor can name a bound row that refinery runs cannot use. */
  readonly resolveStructuredBinding: (ownerId: UserId) => Promise<Resolved | null>;
  readonly character: CharacterService;
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}

/** The refinery seam's two halves: the principal-taking SERVICE (tRPC) and the principal-less WORKLOAD
 *  deps (the queue's own actor). */
export interface RefineryCompose {
  readonly refinery: RefineryService;
  readonly refineryWorkloads: RefineryWorkloadDeps;
}

/** The owner's bound `structured` row as the resolver folds it, before the background-work check. It reads only the
 *  server facts already cached: the editor asks on every settled draft, and a dead endpoint must not be dialed each time. */
export function createResolveStructuredBinding(
  runtime: Pick<InferenceRuntime, "resolve">,
  principalOf: (userId: UserId) => Promise<Principal>,
): RefineryComposeDeps["resolveStructuredBinding"] {
  return async (ownerId) => {
    try {
      return (await runtime.resolve({ task: "structured", principal: await principalOf(ownerId), cachedFacts: true })).resolved;
    } catch (error) {
      if (error instanceof NoConnectionError) {
        return null;
      }
      throw error;
    }
  };
}

/** The refinery editor's plan preview: every refinery pass is `structured` background work on the owner's own
 *  binding, so that connection's consent and its plan for the projected draft are the answer. */
export function createPlanSchema(
  resolveStructuredBinding: RefineryComposeDeps["resolveStructuredBinding"],
): (ownerId: UserId, schema: WireReady) => Promise<RefinerySchemaPlan> {
  return async (ownerId, schema) => {
    const connection = await resolveStructuredBinding(ownerId);
    if (connection === null) {
      return { outcome: "unbound" };
    }
    if (!canFund(connection, "structured")) {
      return { outcome: "background-refused", model: connection.model };
    }
    const preview = structuredFitFor(connection, { name: "refinery_schema_preview", schema });
    if (preview.ok) {
      return { outcome: "sends", model: connection.model, carrier: preview.native ? "native" : "tool" };
    }
    // No vehicle is a fact about the model, not the schema, so the author is not sent to rewrite the shape.
    if (preview.violations.some((violation) => violation.kind === "no-vehicle")) {
      return { outcome: "no-structured", model: connection.model };
    }
    return { outcome: "refused", model: connection.model, reasons: preview.violations.map(schemaPlanReasonOf) };
  };
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
    roleClientsFor: deps.roleClientsFor,
    resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
    resolveUserProse,
    planSchema: createPlanSchema(deps.resolveStructuredBinding),
    emitUserEvent: publishUserEvent,
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
      stampRefinerySignals,
      emitUserEvent: publishUserEvent,
    },
  };
}
