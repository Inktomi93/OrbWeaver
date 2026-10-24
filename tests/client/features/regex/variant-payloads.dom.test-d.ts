import { expectTypeOf, test } from "vitest";
import type { RegexPipelineStage } from "#client/features/regex/lib/regex-pipeline.ts";

test("a skipped regex pipeline step has neither execution errors nor matches", () => {
  type Common = Pick<RegexPipelineStage, "key" | "name" | "isSubject" | "isAppended" | "before" | "after">;
  expectTypeOf<Common & { skipped: "disabled"; matchCount: 1; error: null }>().not.toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { skipped: "disabled"; matchCount: 0; error: string }>().not.toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { skipped: "disabled"; matchCount: 0; error: null }>().toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { skipped: null; matchCount: number; error: string | null }>().toExtend<RegexPipelineStage>();
});
