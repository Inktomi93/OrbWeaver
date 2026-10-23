// @subject packages/server/src/domain/stats/service.ts
import type { IdSource } from "@orb/kit/ids";
import type { createStatsBatchWiring, createStatsService, reconcileOwnersMissingTimeline, reconcileStats } from "@orb/server/domain/stats";
import { expectTypeOf, test } from "vitest";

test("every stats writer requires its id source, so no direct call mints ambient rollup ids", () => {
  expectTypeOf<Parameters<typeof createStatsService>>().toEqualTypeOf<Required<Parameters<typeof createStatsService>>>();
  expectTypeOf<Parameters<typeof createStatsService>[2]>().toEqualTypeOf<IdSource>();
  expectTypeOf<Parameters<typeof createStatsBatchWiring>>().toEqualTypeOf<[IdSource]>();
  expectTypeOf<Parameters<typeof reconcileOwnersMissingTimeline>[2]>().toEqualTypeOf<IdSource>();
  expectTypeOf<Parameters<typeof reconcileOwnersMissingTimeline>>().toEqualTypeOf<Required<Parameters<typeof reconcileOwnersMissingTimeline>>>();
  type ReconcileOpts = Parameters<typeof reconcileStats>[1];
  expectTypeOf<undefined>().not.toExtend<ReconcileOpts["idSource"]>();
  // @ts-expect-error a reconcile without `idSource` must not compile
  const withoutIdSource: Pick<ReconcileOpts, "idSource"> = {};
  expectTypeOf(withoutIdSource).toBeObject();
});
