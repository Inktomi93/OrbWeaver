import { expectTypeOf, test } from "vitest";
import type { RegexPipelineStage } from "#client/features/regex/lib/regex-pipeline.ts";

type Common = Pick<RegexPipelineStage, "key" | "name" | "isSubject" | "isAppended" | "before" | "after">;

test("a pipeline stage that ran carries its match count and error, and a skipped one its reason", () => {
  expectTypeOf<Common & { status: "ran" }>().not.toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { status: "skipped" }>().not.toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { status: "skipped"; skipped: "disabled" }>().toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { status: "ran"; matchCount: number; error: string | null }>().toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { status: "stopped" }>().toExtend<RegexPipelineStage>();
});
