import type {
  EveryOwnerEstimate,
  EveryOwnerRun,
  StartWorkloadParams,
  WorkloadEstimateScope,
  WorkloadRunContext,
  WorkloadRunScope,
} from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("null and request identity cannot stand in for execution authority", () => {
  expectTypeOf<null>().not.toExtend<EveryOwnerRun>();
  expectTypeOf<UserId>().not.toExtend<EveryOwnerRun>();
  expectTypeOf<object>().not.toExtend<EveryOwnerRun>();
  expectTypeOf<{ ownerId: null }>().not.toExtend<WorkloadRunScope>();
  expectTypeOf<Extract<WorkloadRunContext, { ownerId: null }>["everyOwnerRun"]>().toEqualTypeOf<EveryOwnerRun>();
  expectTypeOf<{ ownerId: UserId }>().toExtend<WorkloadRunScope>();
});

test("count-only authority cannot authorize an execution or emerge from it", () => {
  expectTypeOf<EveryOwnerEstimate>().not.toExtend<EveryOwnerRun>();
  expectTypeOf<EveryOwnerRun>().not.toExtend<EveryOwnerEstimate>();
  expectTypeOf<WorkloadEstimateScope>().not.toExtend<WorkloadRunScope>();
  expectTypeOf<{ ownerId: null; everyOwnerRun: EveryOwnerEstimate }>().not.toExtend<WorkloadRunScope>();
  expectTypeOf<{ ownerId: null; everyOwnerEstimate: EveryOwnerRun }>().not.toExtend<WorkloadEstimateScope>();
});

test("trusted admission states nullable funding and request admission cannot override it", () => {
  expectTypeOf<Extract<StartWorkloadParams, { caller: null }>["funderUserId"]>().toEqualTypeOf<UserId | null>();
  expectTypeOf<{ caller: null }>().not.toExtend<Pick<Extract<StartWorkloadParams, { caller: null }>, "caller" | "funderUserId">>();
  expectTypeOf<Extract<StartWorkloadParams, { caller: object }>["funderUserId"]>().toEqualTypeOf<undefined>();
  expectTypeOf<WorkloadRunContext["funderUserId"]>().toEqualTypeOf<UserId | null>();
});
