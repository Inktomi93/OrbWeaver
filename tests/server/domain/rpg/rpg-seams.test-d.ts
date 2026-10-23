// @subject packages/server/src/domain/rpg/contract/service.ts
import type { ScheduleOp } from "@orb/kit/time";
import type { createRpgRoundObservers, RpgContext, RpgRoundsDeps } from "@orb/server/domain/rpg";
import { expectTypeOf, test } from "vitest";

test("the rpg context and rounds deps require their id source, so a round never mints an ambient turn id", () => {
  expectTypeOf<Pick<RpgContext, "idSource">>().toEqualTypeOf<Required<Pick<RpgContext, "idSource">>>();
  expectTypeOf<undefined>().not.toExtend<RpgContext["idSource"]>();
  expectTypeOf<Pick<RpgRoundsDeps, "idSource">>().toEqualTypeOf<Required<Pick<RpgRoundsDeps, "idSource">>>();
  expectTypeOf<undefined>().not.toExtend<RpgRoundsDeps["idSource"]>();
  // @ts-expect-error rounds deps without `idSource` must not compile
  const withoutIdSource: Pick<RpgRoundsDeps, "idSource"> = {};
  expectTypeOf(withoutIdSource).toBeObject();
});

test("the round observers require the flush barrier's timer, so the barrier bound never arms a real timeout", () => {
  expectTypeOf<Parameters<typeof createRpgRoundObservers>[1]>().toEqualTypeOf<ScheduleOp>();
  expectTypeOf<undefined>().not.toExtend<Parameters<typeof createRpgRoundObservers>[1]>();
});
