import type { ProviderId } from "@orb/contracts/inference";
import type { modelStats } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type ModelStatInsert = typeof modelStats.$inferInsert;

test("model_stats preserves model identity and the ruled provider sentinel", () => {
  expectTypeOf<ModelStatInsert["model"]>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<ModelStatInsert["model"]>();
  expectTypeOf<ModelStatInsert["provider"]>().toEqualTypeOf<ProviderId | "(unknown)" | undefined>();
  expectTypeOf<string>().not.toExtend<NonNullable<ModelStatInsert["provider"]>>();
  expectTypeOf<"(unknown)">().toExtend<NonNullable<ModelStatInsert["provider"]>>();
});
