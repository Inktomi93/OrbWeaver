// @subject packages/server/src/domain/rpg/contract/service.ts
import type { ScheduleOp } from "@orb/kit/time";
import type { createRpgRoundObservers, RpgAssemblyContext, RpgRoundsAssemblyDeps } from "@orb/server/domain/rpg";
import { expectTypeOf, test } from "vitest";

test("the rpg context and rounds deps require their id source, so a round never mints an ambient turn id", () => {
  expectTypeOf<Pick<RpgAssemblyContext, "idSource">>().toEqualTypeOf<Required<Pick<RpgAssemblyContext, "idSource">>>();
  expectTypeOf<undefined>().not.toExtend<RpgAssemblyContext["idSource"]>();
  expectTypeOf<Pick<RpgRoundsAssemblyDeps, "idSource">>().toEqualTypeOf<Required<Pick<RpgRoundsAssemblyDeps, "idSource">>>();
  expectTypeOf<undefined>().not.toExtend<RpgRoundsAssemblyDeps["idSource"]>();
  // @ts-expect-error rounds deps without `idSource` must not compile
  const withoutIdSource: Pick<RpgRoundsAssemblyDeps, "idSource"> = {};
  expectTypeOf(withoutIdSource).toBeObject();
});

test("the round observers require the flush barrier's timer, so the barrier bound never arms a real timeout", () => {
  expectTypeOf<Parameters<typeof createRpgRoundObservers>[1]>().toEqualTypeOf<ScheduleOp>();
  expectTypeOf<undefined>().not.toExtend<Parameters<typeof createRpgRoundObservers>[1]>();
});
