// An authored provider row cannot name a retired task; only the stored read-back parse admits one, to drop it.
// @subject packages/contracts/src/inference/provider-schema.ts
import type { ProviderDef, ProviderDefInput, RETIRED_TASKS, storedProviderDefSchema } from "@orb/contracts/inference";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

type RetiredTask = (typeof RETIRED_TASKS)[number];

test("a built-in or uploaded row that names a retired task does not compile", () => {
  expectTypeOf<RetiredTask>().not.toExtend<NonNullable<ProviderDefInput["serves"]>[number]>();
});

test("the stored read-back parse yields the same definition shape the authored parse does", () => {
  expectTypeOf<z.output<typeof storedProviderDefSchema>>().toEqualTypeOf<ProviderDef>();
});
