import type {
  ApplyAsCopyResult,
  ApplyFieldsResult,
  applyAsCopyResultSchema,
  applyFieldsResultSchema,
  RefinerySessionView,
  refinerySessionViewSchema,
} from "@orb/contracts/refinery";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("canonical refinery schema outputs and independently authored promises assign in both directions", () => {
  expectTypeOf<z.output<typeof refinerySessionViewSchema>>().toExtend<RefinerySessionView>();
  expectTypeOf<RefinerySessionView>().toExtend<z.output<typeof refinerySessionViewSchema>>();
  expectTypeOf<z.output<typeof applyFieldsResultSchema>>().toExtend<ApplyFieldsResult>();
  expectTypeOf<ApplyFieldsResult>().toExtend<z.output<typeof applyFieldsResultSchema>>();
  expectTypeOf<z.output<typeof applyAsCopyResultSchema>>().toExtend<ApplyAsCopyResult>();
  expectTypeOf<ApplyAsCopyResult>().toExtend<z.output<typeof applyAsCopyResultSchema>>();
});
