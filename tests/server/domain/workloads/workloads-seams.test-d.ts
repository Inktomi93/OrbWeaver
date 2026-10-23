// @subject packages/server/src/domain/workloads/contract/service.ts
import type { WorkloadRunnerDeps } from "@orb/server/domain/workloads";
import { expectTypeOf, test } from "vitest";

test("the workload runner requires its lease interval, so a direct run never arms a real setInterval", () => {
  expectTypeOf<Pick<WorkloadRunnerDeps, "scheduleInterval">>().toEqualTypeOf<Required<Pick<WorkloadRunnerDeps, "scheduleInterval">>>();
  expectTypeOf<undefined>().not.toExtend<WorkloadRunnerDeps["scheduleInterval"]>();
  // @ts-expect-error runner deps without `scheduleInterval` must not compile
  const withoutScheduleInterval: Pick<WorkloadRunnerDeps, "scheduleInterval"> = {};
  expectTypeOf(withoutScheduleInterval).toBeObject();
});
