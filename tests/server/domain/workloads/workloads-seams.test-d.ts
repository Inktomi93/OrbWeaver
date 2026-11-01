// @subject packages/server/src/domain/workloads/contract/service.ts
import type { WorkloadRunnerAssemblyDeps } from "@orb/server/domain/workloads";
import { expectTypeOf, test } from "vitest";

test("the workload runner requires its lease interval, so a direct run never arms a real setInterval", () => {
  expectTypeOf<Pick<WorkloadRunnerAssemblyDeps, "scheduleInterval">>().toEqualTypeOf<Required<Pick<WorkloadRunnerAssemblyDeps, "scheduleInterval">>>();
  expectTypeOf<undefined>().not.toExtend<WorkloadRunnerAssemblyDeps["scheduleInterval"]>();
  // @ts-expect-error runner deps without `scheduleInterval` must not compile
  const withoutScheduleInterval: Pick<WorkloadRunnerAssemblyDeps, "scheduleInterval"> = {};
  expectTypeOf(withoutScheduleInterval).toBeObject();
});
