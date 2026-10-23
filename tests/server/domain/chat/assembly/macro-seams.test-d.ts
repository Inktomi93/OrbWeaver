// @subject packages/server/src/domain/chat/assembly/macros.ts
import type { FreezeVolatileMacrosArgs, TurnMacroContextArgs } from "@orb/server/domain/chat";
import { expectTypeOf, test } from "vitest";

test("the turn macro context and the send freeze require the turn PRNG, so no draw falls back to kit's ambient Math.random", () => {
  expectTypeOf<Pick<TurnMacroContextArgs, "random">>().toEqualTypeOf<Required<Pick<TurnMacroContextArgs, "random">>>();
  expectTypeOf<undefined>().not.toExtend<TurnMacroContextArgs["random"]>();
  expectTypeOf<Pick<FreezeVolatileMacrosArgs, "random">>().toEqualTypeOf<Required<Pick<FreezeVolatileMacrosArgs, "random">>>();
  expectTypeOf<undefined>().not.toExtend<FreezeVolatileMacrosArgs["random"]>();
  // @ts-expect-error a freeze without `random` must not compile
  const withoutRandom: FreezeVolatileMacrosArgs = {};
  expectTypeOf(withoutRandom).toBeObject();
});
