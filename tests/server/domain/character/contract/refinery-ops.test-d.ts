// @subject packages/server/src/domain/character/contract/refinery-ops.ts
import type { EveryOwnerEstimate, EveryOwnerRun, WorkloadEstimateScope, WorkloadRunScope } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { CountRefineryScoreTargetsOp, createCountRefineryScoreTargets, ListRefineryScoreTargetsOp } from "@orb/server/domain/character";
import { expectTypeOf, test } from "vitest";

test("null and estimate scope cannot authorize refinery target execution", () => {
  expectTypeOf<{ ownerId: null; unscoredOnly: boolean }>().not.toExtend<Parameters<ListRefineryScoreTargetsOp>[0]>();
  expectTypeOf<WorkloadEstimateScope & { unscoredOnly: boolean }>().not.toExtend<Parameters<ListRefineryScoreTargetsOp>[0]>();
});

test("run authority cannot substitute for scalar-only estimate authority", () => {
  expectTypeOf<WorkloadRunScope & { unscoredOnly: boolean }>().not.toExtend<Parameters<CountRefineryScoreTargetsOp>[0]>();
  expectTypeOf<{ ownerId: null; unscoredOnly: boolean }>().not.toExtend<Parameters<CountRefineryScoreTargetsOp>[0]>();
  expectTypeOf<{ ownerId: null; everyOwnerEstimate: EveryOwnerRun; unscoredOnly: boolean }>().not.toExtend<Parameters<CountRefineryScoreTargetsOp>[0]>();
  expectTypeOf<{ ownerId: null; everyOwnerRun: EveryOwnerEstimate; unscoredOnly: boolean }>().not.toExtend<Parameters<ListRefineryScoreTargetsOp>[0]>();
  expectTypeOf<{ ownerId: UserId; unscoredOnly: boolean }>().toExtend<Parameters<CountRefineryScoreTargetsOp>[0]>();
  expectTypeOf<{ ownerId: UserId; unscoredOnly: boolean }>().toExtend<Parameters<ListRefineryScoreTargetsOp>[0]>();
  expectTypeOf<Awaited<ReturnType<CountRefineryScoreTargetsOp>>>().toEqualTypeOf<number>();
  expectTypeOf<Parameters<typeof createCountRefineryScoreTargets>[0]["db"]>().not.toHaveProperty("update");
  expectTypeOf<Parameters<typeof createCountRefineryScoreTargets>[0]>().not.toHaveProperty("roleClientsFor");
});
