import type { TestTag } from "@orb/tooling/_shared/test-tags";
import type { TestOptions } from "vitest";
import { expectTypeOf, test } from "vitest";

const registered: TestOptions = {
  tags: ["slow", "requires-process-chdir", "source-freshness", "requires-git-history", "live", "local-model-cache"],
};
// @ts-expect-error — runtime strictTags rejects this spelling, so authored tests must reject it too.
const typo = { tags: "slwo" } satisfies TestOptions;

test("registered Vitest tags are a closed type vocabulary", () => {
  expectTypeOf<TestTag>().toEqualTypeOf<"slow" | "requires-process-chdir" | "source-freshness" | "requires-git-history" | "live" | "local-model-cache">();
  expectTypeOf(registered.tags).toEqualTypeOf<TestTag | TestTag[] | undefined>();
  expectTypeOf(typo).not.toExtend<TestOptions>();
});
