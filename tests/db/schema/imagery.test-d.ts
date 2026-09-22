import type { ProviderId } from "@orb/contracts/inference";
import type { imageryGenerations } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type ImageryInsert = typeof imageryGenerations.$inferInsert;

test("imagery_generations preserves model and provider identity at its producer contract", () => {
  expectTypeOf<ImageryInsert["model"]>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<ImageryInsert["model"]>();
  expectTypeOf<NonNullable<ImageryInsert["provider"]>>().toEqualTypeOf<ProviderId>();
  expectTypeOf<string>().not.toExtend<NonNullable<ImageryInsert["provider"]>>();
});
