import type { ProviderId } from "@orb/contracts/inference";
import type { messageVariants } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type VariantInsert = typeof messageVariants.$inferInsert;

test("message_variants preserves model and provider identity at its producer contract", () => {
  expectTypeOf<NonNullable<VariantInsert["model"]>>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<NonNullable<VariantInsert["model"]>>();
  expectTypeOf<NonNullable<VariantInsert["provider"]>>().toEqualTypeOf<ProviderId>();
  expectTypeOf<string>().not.toExtend<NonNullable<VariantInsert["provider"]>>();
});
